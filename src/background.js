// Credentials and durable state live here; content scripts receive only public config.
import { createCache, chromeStorage } from './cache.js';
import { requestSwaps } from './engine.js';
import { cleanSettings, siteEnabled, hasSiteAccess } from './settings.js';
import { resolveLevel, exactFr, isZeroFrench, wordCount } from './levels.js';
import { hashKey } from './hash.js';
import { githubClient } from './sync.js';
import { createVault, idbStore } from './vault.js';

const cache = createCache(chromeStorage);
let mutations = Promise.resolve();
let models = Promise.resolve();
let syncing = null;
const locked = (fn) => { const p = mutations.then(fn); mutations = p.catch(() => {}); return p; };
const modelCall = (fn) => { const p = models.then(fn); models = p.catch(() => {}); return p; };
const store = chrome.storage.local;
const vault = createVault(store, store.setAccessLevel ? null : idbStore());
const cooldown = new Map(); // model -> rate-limit cooldown end; worker memory is enough
const DAILY = { seen: 'seenToday', peek: 'peekToday' }; // one event per word per day per installation

const ready = (async () => {
  // Chrome: keep storage away from content scripts. Firefox has no access levels; its vault uses IndexedDB.
  if (store.setAccessLevel) await store.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await vault.migrate();
  const local = await store.get(['settings', 'secrets', 'deviceId', 'preferenceDirty']);
  await vault.set({ apiKey: local.settings?.apiKey || '', ...local.secrets, ...(await vault.get()) });
  let remote = {};
  try { remote = await chrome.storage.sync.get('preferences'); } catch { /* local preferences work offline */ }
  await store.set({
    settings: cleanSettings(local.preferenceDirty ? local.settings : remote.preferences || local.settings),
    preferenceDirty: !!local.preferenceDirty || !remote.preferences,
    deviceId: local.deviceId || crypto.randomUUID(),
  });
})();

async function context() {
  await ready;
  const data = await store.get(['settings', 'vocabulary', 'epoch']);
  const secrets = await vault.get();
  const settings = cleanSettings(data.settings);
  const level = resolveLevel(settings, new Date(), data.vocabulary).effective;
  const { origins = [] } = await chrome.permissions.getAll();
  const revision = hashKey(JSON.stringify([data.epoch || '', settings, level, data.vocabulary || null, secrets.apiKey || '', origins]));
  return { settings, level, revision, words: data.vocabulary?.words, vocabularyVersion: data.vocabulary?.version || null,
    stage: data.vocabulary?.stage || null, hasKey: !!secrets.apiKey, origins };
}

async function broadcast(type = 'config') {
  const config = await context();
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.map((t) => chrome.tabs.sendMessage(t.id, { type, config })));
}

async function swaps(msg, sender) {
  const ctx = await context();
  if (msg.revision !== ctx.revision || !ctx.hasKey || !siteEnabled(ctx.settings, sender.url) || !hasSiteAccess(sender.url, ctx.origins)) return { results: {}, stale: true };
  if (!Array.isArray(msg.items) || msg.items.length > 8) throw new Error('Invalid text batch');
  const items = msg.items.filter((i) => i && typeof i.text === 'string' && i.text.length <= 2000 &&
    wordCount(i.text) >= 6 && !isZeroFrench(i.text) && i.key === `${ctx.revision}:${hashKey(i.text)}`);
  const results = await cache.getMany(items.map((i) => i.key));
  const misses = items.filter((i) => !(i.key in results));
  if (!misses.length) return { results };
  try {
    const fresh = await modelCall(async () => {
      if ((await context()).revision !== ctx.revision) return null;
      const secrets = await vault.get();
      const { seenToday } = await store.get('seenToday');
      const shownToday = seenToday?.date === new Date().toISOString().slice(0, 10) ? seenToday.words : [];
      return requestSwaps({ apiKey: secrets.apiKey, model: ctx.settings.model, level: ctx.level, words: ctx.words, shownToday, cooldown,
        batch: misses.map((i) => ({ id: i.key, text: i.text })) });
    });
    return await locked(async () => {
      if (!fresh || (await context()).revision !== ctx.revision) return { results: {}, stale: true };
      await cache.setMany(fresh.results);
      await store.set({ modelStatus: { at: Date.now(), error: '', model: fresh.model } });
      return { results: { ...results, ...fresh.results } };
    });
  } catch (e) {
    const error = e?.message || 'Model request failed';
    await store.set({ modelStatus: { at: Date.now(), error } });
    return { results, error, retryAfterMs: e?.retryAfterMs };
  }
}

async function record(msg, sender) {
  return locked(async () => {
    const ctx = await context();
    if (!siteEnabled(ctx.settings, sender.url) || !hasSiteAccess(sender.url, ctx.origins) || !ctx.words || !['seen', 'flip', 'peek'].includes(msg.event) || typeof msg.word !== 'string') return { ok: false };
    const word = ctx.words.find((w) => exactFr(w.fr) === exactFr(msg.word));
    if (!word) return { ok: false };
    const date = new Date().toISOString().slice(0, 10);
    const daily = DAILY[msg.event];
    const saved = await store.get(['eventQueue', ...(daily ? [daily] : [])]);
    const queue = saved.eventQueue || [];
    const today = daily && saved[daily]?.date === date ? saved[daily].words : [];
    if (daily && today.includes(word.fr)) return { ok: true };
    if (queue.length >= 10000) {
      await store.set({ eventError: 'Learning queue is full. Connect GitHub and sync before recording more events.' });
      return { ok: false };
    }
    queue.push({ id: crypto.randomUUID(), date, word: word.fr, event: msg.event });
    if (daily) today.push(word.fr);
    await store.set({ eventQueue: queue, ...(daily ? { [daily]: { date, words: today } } : {}), eventError: '' });
    return { ok: true };
  });
}

async function sync() {
  if (syncing) return syncing;
  syncing = (async () => {
    await ready;
    await syncPreferences();
    const secrets = await vault.get();
    const { deviceId, eventQueue = [] } = await store.get(['deviceId', 'eventQueue']);
    if (!secrets?.githubToken) return { ok: false, error: 'Add a GitHub token to connect the private learning repo.' };
    const client = githubClient(secrets.githubToken);
    await store.set({ syncRunning: true });
    try {
      const vocabulary = await client.state();
      await locked(async () => {
        if ((await vault.get()).githubToken !== secrets.githubToken) throw new Error('Connection changed; sync again');
        await store.set({ vocabulary, lastRead: Date.now() });
      });
      await broadcast();
      const batch = eventQueue.slice(0, 500);
      if (batch.length) {
        if ((await vault.get()).githubToken !== secrets.githubToken) throw new Error('Connection changed; queued events retained');
        await client.upload(deviceId, batch);
        await locked(async () => {
          const { eventQueue: current = [] } = await store.get('eventQueue');
          const sent = new Set(batch.map((e) => e.id));
          await store.set({ eventQueue: current.filter((e) => !sent.has(e.id)), lastUpload: Date.now(), eventError: '' });
        });
        // The existing GitHub workflow rebuilds state after the event commit.
        await chrome.alarms.create('sync-after-upload', { delayInMinutes: 1 });
      }
      await store.set({ syncStatus: { at: Date.now(), error: '' } });
      return { ok: true };
    } catch (e) {
      const error = e?.message || 'Sync failed; saved state retained';
      await store.set({ syncStatus: { at: Date.now(), error } });
      return { ok: false, error };
    } finally { await store.set({ syncRunning: false }); }
  })().finally(() => { syncing = null; });
  return syncing;
}

async function syncPreferences() {
  return locked(async () => {
    const { settings, preferenceDirty } = await store.get(['settings', 'preferenceDirty']);
    if (!preferenceDirty) return;
    try {
      await chrome.storage.sync.set({ preferences: cleanSettings(settings) });
      await store.set({ preferenceError: '', preferenceDirty: false });
    } catch { await store.set({ preferenceError: 'Browser preferences are saved locally; Chrome Sync is unavailable.' }); }
  });
}

async function clearCache() {
  const removed = await locked(async () => {
    await store.set({ epoch: crypto.randomUUID() });
    return cache.clear();
  });
  await broadcast('retry');
  return { ok: true, removed };
}

async function save(msg) {
  await locked(async () => {
    const saved = await store.get('settings');
    const merged = { ...saved.settings, ...msg.settings };
    if (msg.siteOverride && typeof msg.siteOverride.host === 'string') {
      merged.siteOverrides = { ...saved.settings?.siteOverrides };
      if (msg.siteOverride.enabled === null) delete merged.siteOverrides[msg.siteOverride.host];
      else merged.siteOverrides[msg.siteOverride.host] = msg.siteOverride.enabled;
    }
    const settings = cleanSettings(merged);
    const secrets = { ...(await vault.get()) };
    for (const key of ['apiKey', 'githubToken']) {
      if (typeof msg.secrets?.[key] === 'string') {
        if (msg.secrets[key].length > 500) throw new Error('Credential is too long');
        secrets[key] = msg.secrets[key].trim();
      }
    }
    await vault.set(secrets);
    await store.set({ settings, preferenceDirty: true });
  });
  await syncPreferences();
  await broadcast();
  return { ok: true };
}

async function status() {
  const secrets = await vault.get();
  const data = await store.get(['settings', 'syncStatus', 'lastRead', 'lastUpload', 'eventQueue', 'syncRunning', 'modelStatus', 'preferenceError', 'eventError']);
  delete data.eventQueue;
  const queue = await store.get('eventQueue');
  return { ...data, hasGithubToken: !!secrets.githubToken,
    config: await context(), queued: (queue.eventQueue || []).length };
}

// Register on every worker wake; network/storage mutations happen only after initialization.
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || sender.id !== chrome.runtime.id) return false;
  const popup = sender.url === chrome.runtime.getURL('src/popup.html');
  const page = sender.tab && /^https?:\/\//.test(sender.url || '');
  const handlers = {
    config: () => context(),
    swaps: () => swaps(msg, sender),
    event: () => record(msg, sender),
    status, save: () => save(msg), sync, clearCache,
  };
  if (!handlers[msg.type] || (!popup && !(page && ['config', 'swaps', 'event'].includes(msg.type)))) return false;
  ready.then(handlers[msg.type]).then(reply, () => reply({ error: 'Extension operation failed. Try again.' }));
  return true;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes.preferences?.newValue) return;
  void ready.then(() => locked(async () => {
    const next = cleanSettings(changes.preferences.newValue);
    const { settings, preferenceDirty } = await store.get(['settings', 'preferenceDirty']);
    if (preferenceDirty) return; // Retry an unsaved local preference before accepting older remote data.
    if (JSON.stringify(next) !== JSON.stringify(settings)) {
      await store.set({ settings: next });
      await broadcast();
    }
  })).catch(() => {});
});

// Optional host grants control injection. The on/off defaults remain user preferences.
let registrations = Promise.resolve();
function registerSites() {
  const p = registrations.then(async () => {
    const { origins = [] } = await chrome.permissions.getAll();
    const matches = [...new Set(origins.flatMap((o) => o === '<all_urls>' ? ['http://*/*', 'https://*/*'] : [o]))]
      .filter((o) => /^(https?|\*):\/\//.test(o) && !o.includes('googleapis.com') && !o.includes('api.github.com'));
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: ['weave-sites'] });
    if (!matches.length) {
      if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: ['weave-sites'] });
      return;
    }
    const script = { id: 'weave-sites', matches, js: ['src/content-loader.js'], css: ['src/content.css'], runAt: 'document_idle',
      excludeMatches: ['https://x.com/*', 'https://twitter.com/*'] };
    if (existing.length) await chrome.scripting.updateContentScripts([script]);
    else await chrome.scripting.registerContentScripts([script]);
  });
  registrations = p.catch(() => {});
  return p;
}
const permissionsChanged = () => { void registerSites().then(() => broadcast('retry')).catch(() => {}); };
chrome.permissions.onAdded.addListener(permissionsChanged);
chrome.permissions.onRemoved.addListener(permissionsChanged);
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name.startsWith('sync')) void sync(); });
chrome.runtime.onStartup.addListener(() => { void sync(); });
chrome.runtime.onInstalled.addListener(() => { void sync(); });
void ready.then(async () => {
  await syncPreferences();
  if (!(await chrome.alarms.get('sync-periodic'))) await chrome.alarms.create('sync-periodic', { periodInMinutes: 15 });
  await registerSites();
}).catch(() => {});
