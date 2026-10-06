// Non-secret preferences. Keys/tokens stay in trusted local storage.
export const DEFAULT_SETTINGS = {
  enabled: true,
  model: 'gemini-3.8-flash',
  pauseDays: 0,
  levelOverride: 0, // 0 = follow the date table
  newSitesEnabled: true,
  siteOverrides: {},
};

export function withDefaults(s) {
  return { ...DEFAULT_SETTINGS, ...(s || {}) };
}

export function cleanSettings(s = {}) {
  const d = { ...DEFAULT_SETTINGS, siteOverrides: {} };
  if (typeof s.enabled === 'boolean') d.enabled = s.enabled;
  if (typeof s.newSitesEnabled === 'boolean') d.newSitesEnabled = s.newSitesEnabled;
  if (['gemini-3.8-flash', 'gemini-3.5-flash-lite'].includes(s.model)) d.model = s.model;
  if (Number.isInteger(s.pauseDays) && s.pauseDays >= 0 && s.pauseDays <= 3650) d.pauseDays = s.pauseDays;
  if (Number.isInteger(s.levelOverride) && s.levelOverride >= 0 && s.levelOverride <= 4) d.levelOverride = s.levelOverride;
  const entries = Object.entries(s.siteOverrides || {});
  if (entries.length > 80) throw new Error('Up to 80 site exceptions are supported');
  for (const [host, enabled] of entries) {
    if (/^(?=.{1,253}$)[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?$/.test(host) && typeof enabled === 'boolean') d.siteOverrides[host] = enabled;
  }
  if (JSON.stringify(d).length > 7000) throw new Error('Site exceptions exceed Chrome Sync capacity');
  return d;
}

export function siteEnabled(settings, url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) && settings.enabled && (settings.siteOverrides[u.hostname] ?? settings.newSitesEnabled);
  } catch { return false; }
}

export function hasSiteAccess(url, origins = []) {
  try {
    const u = new URL(url);
    return origins.some((pattern) => {
      if (pattern === '<all_urls>') return /^https?:$/.test(u.protocol);
      const m = pattern.match(/^(https?|\*):\/\/([^/]+)\/\*$/);
      return m && (m[1] === '*' || u.protocol === m[1] + ':') &&
        (m[2] === '*' || u.host === m[2] || u.hostname === m[2] || (m[2].startsWith('*.') && (u.hostname === m[2].slice(2) || u.hostname.endsWith(m[2].slice(1)))));
    });
  } catch { return false; }
}
