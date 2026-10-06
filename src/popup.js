import { MODELS } from './gemini.js';
import { siteEnabled, hasSiteAccess } from './settings.js';

const $ = (id) => document.getElementById(id);
let status;
let tab;
let host = '';
const send = async (msg) => {
  const res = await chrome.runtime.sendMessage(msg);
  if (res?.error) throw new Error(res.error);
  return res;
};
const time = (ms) => ms ? new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never';
async function refresh() {
  status = await send({ type: 'status' });
  const c = status.config;
  const s = c.settings;
  $('enabled').checked = s.enabled;
  $('newSitesEnabled').value = String(s.newSitesEnabled);
  $('siteEnabled').checked = !!host && (s.siteOverrides[host] ?? s.newSitesEnabled);
  $('siteEnabled').disabled = !host;
  $('siteName').textContent = host || 'Unsupported page';
  $('levelOverride').value = s.levelOverride;
  $('pauseDays').value = s.pauseDays;
  $('model').value = s.model;
  $('apiKey').placeholder = c.hasKey ? 'Saved on this device' : 'Add Gemini key';
  $('githubToken').placeholder = status.hasGithubToken ? 'Saved on this device' : 'Add GitHub token';
  $('levelInfo').textContent = `${c.stage ? 'Shared' : 'Scheduled'} · L${c.level}${(s.levelOverride || c.stage || 1) > 2 ? ' (L3/4 use L2)' : ''}`;
  $('queue').textContent = `${status.queued} pending`;
  $('syncStatus').textContent = `${status.syncRunning ? 'Syncing… ' : ''}${status.hasGithubToken ? 'Connected' : 'Not connected'} · checked ${time(status.lastRead)}${c.vocabularyVersion ? ` · ${c.words.length} words · ${c.vocabularyVersion}` : ''}${status.syncStatus?.error ? ` · ${status.syncStatus.error}` : ''}`;
  $('syncStatus').classList.toggle('error', !!status.syncStatus?.error);
  const all = await chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] });
  $('grantSites').hidden = all;
  $('accessNote').textContent = all ? 'Website access enabled. Site exceptions override the default.' : 'Website access is limited. Enable all websites or switch this site on.';
  $('operation').textContent = !s.enabled ? 'Off' : !c.hasKey ? 'Add a Gemini key to start' : host && !siteEnabled(s, tab.url) ? 'Off on this site' : host && !hasSiteAccess(tab.url, c.origins) ? 'This site needs website access' : status.modelStatus?.error ? status.modelStatus.error : 'On · sparse French while you read';
  $('notice').textContent = status.eventError || status.preferenceError || '';
  const list = $('siteList'); list.replaceChildren();
  for (const [name, enabled] of Object.entries(s.siteOverrides)) {
    const row = document.createElement('div'); row.className = 'row';
    const label = document.createElement('span'); label.className = 'small'; label.textContent = `${name}: ${enabled ? 'on' : 'off'}`;
    const button = document.createElement('button'); button.textContent = 'Reset';
    button.addEventListener('click', () => run(() => save({}, { host: name, enabled: null })));
    row.append(label, button); list.append(row);
  }
  if (!list.childNodes.length) list.textContent = 'No exceptions';
}
async function save(settings = {}, siteOverride) {
  await send({ type: 'save', settings, siteOverride });
  await refresh();
}
async function run(fn) {
  $('notice').textContent = '';
  try { await fn(); } catch (e) { $('notice').textContent = e.message || 'Could not complete this action'; }
}
async function inject() {
  if (!tab?.id || !host) return;
  try {
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['src/content.css'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/content-loader.js'] });
  } catch { $('notice').textContent = 'Reload this page to apply website access. Chrome blocks extensions on some pages.'; }
}
for (const [value, label] of Object.entries(MODELS)) {
  const o = document.createElement('option'); o.value = value; o.textContent = label; $('model').append(o);
}
$('enabled').addEventListener('change', (e) => run(() => save({ enabled: e.target.checked })));
$('newSitesEnabled').addEventListener('change', (e) => run(() => save({ newSitesEnabled: e.target.value === 'true' })));
$('levelOverride').addEventListener('change', (e) => run(() => save({ levelOverride: Number(e.target.value) })));
$('pauseDays').addEventListener('change', (e) => run(() => save({ pauseDays: Math.max(0, Math.floor(Number(e.target.value) || 0)) })));
$('model').addEventListener('change', (e) => run(() => save({ model: e.target.value })));
$('siteEnabled').addEventListener('change', (e) => run(async () => {
  const enabled = e.target.checked;
  if (enabled && !hasSiteAccess(tab.url, status.config.origins)) {
    const accepted = await chrome.permissions.request({ origins: [`${new URL(tab.url).protocol}//${host}/*`] });
    if (!accepted) { await refresh(); return; }
  }
  await save({}, { host, enabled });
  if (enabled) await inject();
}));
$('grantSites').addEventListener('click', () => run(async () => {
  const accepted = await chrome.permissions.request({ origins: ['http://*/*', 'https://*/*'] });
  if (accepted) { await refresh(); await inject(); }
}));
$('saveKey').addEventListener('click', () => run(async () => {
  await send({ type: 'save', secrets: { apiKey: $('apiKey').value } });
  $('apiKey').value = ''; await refresh();
}));
$('connect').addEventListener('click', () => run(async () => {
  if (!$('githubToken').value.trim()) throw new Error('Enter a GitHub token first.');
  await send({ type: 'save', secrets: { githubToken: $('githubToken').value } });
  $('githubToken').value = ''; await refresh();
  await send({ type: 'sync' }); await refresh();
}));
$('disconnect').addEventListener('click', () => run(async () => {
  await send({ type: 'save', secrets: { githubToken: '' } }); await refresh();
}));
$('syncNow').addEventListener('click', () => run(async () => {
  $('syncNow').disabled = true;
  try { await send({ type: 'sync' }); } finally { $('syncNow').disabled = false; await refresh(); }
}));
$('clearCache').addEventListener('click', () => run(async () => {
  await send({ type: 'clearCache' }); await refresh();
}));
void run(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try { const u = new URL(tab?.url); if (/^https?:$/.test(u.protocol)) host = u.hostname; } catch { /* internal tab */ }
  await refresh();
});
