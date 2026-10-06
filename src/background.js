// Service worker: cache lookup, one model call at a time, results back to the content script.
import { createCache, chromeStorage } from './cache.js';
import { requestSwaps } from './engine.js';
import { withDefaults } from './settings.js';

const cache = createCache(chromeStorage);

let chain = Promise.resolve();
function enqueue(fn) {
  const p = chain.then(fn);
  chain = p.catch(() => {});
  return p;
}

async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return withDefaults(settings);
}

async function handleSwaps({ level, items }) {
  const keys = items.map((i) => i.key);
  const results = await cache.getMany(keys);
  const misses = items.filter((i) => !(i.key in results));
  if (misses.length) {
    const settings = await getSettings();
    if (!settings.apiKey) throw new Error('no Gemini key set');
    const batch = misses.map((i) => ({ id: i.key, text: i.text }));
    try {
      const { results: fresh } = await enqueue(() =>
        requestSwaps({ apiKey: settings.apiKey, model: settings.model, level, batch }),
      );
      const toStore = {};
      for (const i of misses) {
        if (i.key in fresh) {
          results[i.key] = fresh[i.key];
          toStore[i.key] = fresh[i.key];
        }
      }
      await cache.setMany(toStore);
    } catch (e) {
      // Cache hits still go back; the misses stay English and are retried when X re-renders them.
      return { results, error: String(e?.message || e) };
    }
  }
  return { results };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'swaps') {
    handleSwaps(msg).then(sendResponse, (e) => sendResponse({ results: {}, error: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === 'clearCache') {
    cache.clear().then((n) => sendResponse({ ok: true, removed: n }), (e) => sendResponse({ error: String(e) }));
    return true;
  }
  return false;
});
