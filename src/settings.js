// Shared settings shape. Stored under chrome.storage.local["settings"].
export const DEFAULT_SETTINGS = {
  enabled: true,
  apiKey: '',
  model: 'gemini-3.8-flash',
  pauseDays: 0,
  levelOverride: 0, // 0 = follow the date table
};

export function withDefaults(s) {
  return { ...DEFAULT_SETTINGS, ...(s || {}) };
}
