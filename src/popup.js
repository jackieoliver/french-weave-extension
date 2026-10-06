import { resolveLevel, MAX_BUILT_LEVEL } from './levels.js';
import { MODELS } from './gemini.js';
import { withDefaults } from './settings.js';

const $ = (id) => document.getElementById(id);
let settings = withDefaults();

function renderLevel() {
  const { scheduled, chosen, effective } = resolveLevel(settings);
  let s = `L${chosen}`;
  if (chosen !== scheduled) s += ` (schedule says L${scheduled})`;
  if (effective < chosen) s += ` · using L${MAX_BUILT_LEVEL} rules for now`;
  $('levelInfo').textContent = s;
}

function render() {
  $('enabled').checked = !!settings.enabled;
  $('levelOverride').value = String(settings.levelOverride || 0);
  $('pauseDays').value = String(settings.pauseDays || 0);
  $('model').value = settings.model;
  $('apiKey').value = settings.apiKey || '';
  $('status').textContent = settings.apiKey ? '' : 'no key: off';
  renderLevel();
}

async function save(patch) {
  settings = { ...settings, ...patch };
  await chrome.storage.local.set({ settings });
  render();
}

for (const [id, label] of Object.entries(MODELS)) {
  const opt = document.createElement('option');
  opt.value = id;
  opt.textContent = label;
  $('model').appendChild(opt);
}

$('enabled').addEventListener('change', (e) => save({ enabled: e.target.checked }));
$('levelOverride').addEventListener('change', (e) => save({ levelOverride: Number(e.target.value) || 0 }));
$('pauseDays').addEventListener('change', (e) => save({ pauseDays: Math.max(0, Math.floor(Number(e.target.value) || 0)) }));
$('model').addEventListener('change', (e) => save({ model: e.target.value }));
$('apiKey').addEventListener('change', (e) => save({ apiKey: e.target.value.trim() }));
$('clearCache').addEventListener('click', async () => {
  const res = await chrome.runtime.sendMessage({ type: 'clearCache' });
  $('status').textContent = res?.ok ? `cleared ${res.removed}` : (res?.error || 'failed');
});

chrome.storage.local.get('settings').then(({ settings: s }) => {
  settings = withDefaults(s);
  render();
});
