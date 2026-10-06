import { test, expect } from 'bun:test';
import { Window } from 'happy-dom';
import { encode, decode } from '../src/sync.js';
import { hashKey } from '../src/hash.js';

// Exercise the actual worker + content modules together, with no live API or learning data.
test('runtime: privacy, sync/offline, queue, cache invalidation, site controls and stale responses', async () => {
  const win = new Window({ url: 'https://example.com/article' });
  const originalGlobals = Object.fromEntries(['chrome', 'fetch', 'document', 'window', 'location', 'MutationObserver', 'IntersectionObserver', 'setInterval'].map((k) => [k, globalThis[k]]));
  const local = { settings: { apiKey: 'synthetic-gemini', enabled: true, levelOverride: 1 }, secrets: { githubToken: 'synthetic-github' } };
  const synced = {};
  const messageListeners = [], contentListeners = [], storageListeners = [];
  const alarms = new Map();
  const originEvents = { added: [], removed: [] };
  let accessLevel;
  let origins = ['https://*/*', 'http://*/*'];
  let githubFails = false;
  let preferencesFail = false;
  let remoteEvents;
  let writes = 0;
  let modelCalls = 0;
  let modelThrows = 0;
  let delayed = null;
  let release;
  let remoteState = { version: 'test.1', stage: 1, words: [
    { fr: 'et', en: 'and', hint: 'ay', status: 'active' },
    { fr: 'très', en: 'very', hint: 'treh', status: 'shaky' },
  ] };
  const listener = (arr) => ({ addListener: (fn) => arr.push(fn) });
  const area = (data, name) => ({
    async setAccessLevel(v) { accessLevel = v.accessLevel; },
    async get(keys) { return structuredClone(keys == null ? data : Object.fromEntries((typeof keys === 'string' ? [keys] : keys).filter((k) => k in data).map((k) => [k, data[k]]))); },
    async set(values) {
      if (name === 'sync' && preferencesFail) throw new Error('Chrome Sync unavailable');
      const diff = {};
      for (const [k, v] of Object.entries(values)) { diff[k] = { oldValue: data[k], newValue: structuredClone(v) }; data[k] = structuredClone(v); }
      for (const fn of storageListeners) fn(diff, name);
    },
    async remove(keys) { for (const k of keys) delete data[k]; },
  });
  const page = () => ({ id: 'fw-test', tab: { id: 1 }, url: win.location.href });
  const popup = { id: 'fw-test', url: 'chrome-extension://fw-test/src/popup.html' };
  const dispatch = (msg, sender) => new Promise((done, reject) => {
    let handled = false;
    try { for (const fn of messageListeners) if (fn(msg, sender, done)) handled = true; }
    catch (e) { reject(e); }
    if (!handled) done(undefined);
  });
  const io = [];
  class IO {
    constructor(callback, options) { this.cb = callback; this.options = options; this.elements = new Set(); io.push(this); }
    observe(el) { this.elements.add(el); if (this.options.rootMargin) queueMicrotask(() => { if (this.elements.has(el)) this.cb([{ target: el, isIntersecting: true, intersectionRatio: 1 }]); }); }
    unobserve(el) { this.elements.delete(el); }
    disconnect() { this.elements.clear(); }
  }
  const reply = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const file = (text) => reply({ type: 'file', sha: 'fake-sha', encoding: 'base64', content: encode(text), size: text.length });
  Object.assign(globalThis, {
    window: win, document: win.document, location: win.location, MutationObserver: win.MutationObserver, IntersectionObserver: IO,
    setInterval: win.setInterval.bind(win),
    chrome: {
      storage: { local: area(local, 'local'), sync: area(synced, 'sync'), onChanged: listener(storageListeners) },
      runtime: {
        id: 'fw-test', getURL: (path) => `chrome-extension://fw-test/${path}`,
        onMessage: listener(messageListeners), onInstalled: listener([]), onStartup: listener([]),
        sendMessage: (msg) => dispatch(msg, page()),
      },
      tabs: { query: async () => [{ id: 1, url: win.location.href }], sendMessage: async (_id, msg) => { for (const fn of contentListeners) fn(msg); } },
      alarms: { get: async (name) => alarms.get(name), create: async (name, opts) => alarms.set(name, opts), onAlarm: listener([]) },
      permissions: { getAll: async () => ({ origins }), onAdded: listener(originEvents.added), onRemoved: listener(originEvents.removed) },
      scripting: { getRegisteredContentScripts: async () => [], updateContentScripts: async () => {}, unregisterContentScripts: async () => {}, registerContentScripts: async () => {} },
    },
    fetch: async (url, init) => {
      if (url.startsWith('https://api.github.com/')) {
        if (githubFails) throw new Error('offline');
        if (url.includes('/state.json')) return file(JSON.stringify(remoteState));
        if (init.method === 'GET') return remoteEvents ? file(remoteEvents) : reply({}, 404);
        writes++; remoteEvents = decode(JSON.parse(init.body).content); return reply({});
      }
      expect(url.startsWith('https://generativelanguage.googleapis.com/')).toBe(true);
      modelCalls++;
      if (modelThrows > 0) { modelThrows--; throw new TypeError('Failed to fetch'); }
      if (delayed) { release = () => { delayed = null; }; await new Promise((done) => { const free = release; release = () => { free(); done(); }; }); }
      const body = JSON.parse(init.body);
      const items = JSON.parse(body.contents[0].parts[0].text.replace(/^Passages:\n/, ''));
      const tweets = items.map(({ id, text }) => ({ id, swaps: text.includes(' and ') ? [{ o: 'and', f: 'et', ctx: '' }] : [] }));
      return reply({ candidates: [{ content: { parts: [{ text: JSON.stringify({ tweets }) }] } }] });
    },
  });
  const call = (msg) => dispatch(msg, popup);
  const wait = (ms = 400) => new Promise((done) => setTimeout(done, ms));
  try {
    await import('../src/background.js');
    let config = await dispatch({ type: 'config' }, page());
    expect(accessLevel).toBe('TRUSTED_CONTEXTS');
    expect(JSON.stringify(config)).not.toContain('synthetic-');
    expect(local.settings.apiKey).toBeUndefined();
    expect(local.secrets.apiKey).toBe('synthetic-gemini');
    expect(await dispatch({ type: 'status' }, page())).toBeUndefined();
    expect(await dispatch({ type: 'save', secrets: { githubToken: 'stolen' } }, page())).toBeUndefined();
    expect((await call({ type: 'sync' })).ok).toBe(true);
    expect(local.vocabulary).toEqual(remoteState);
    expect(JSON.stringify(synced)).not.toContain('synthetic-');

    // Route worker broadcasts to the content module without pretending they came from a page.
    const beforeContent = messageListeners.length;
    win.document.body.innerHTML = '<main><p id="reading">I enjoy cats and dogs every single day.</p><form><p>Private typing and secrets should stay exactly here.</p></form><p contenteditable="true">Private words and typing must never leave this editor.</p><p id="nested">Keep these and other words <span contenteditable="true">private typed text</span> here.</p><p>My doctor says medication and rest are important.</p><p lang="fr">Bonjour et merci pour cette belle journee ici.</p></main>';
    await import('../src/content.js');
    contentListeners.push(...messageListeners.splice(beforeContent));
    await wait();
    expect(modelCalls).toBe(1);
    const el = win.document.querySelector('#reading');
    expect(el.querySelector('.fw-word')?.textContent).toBe('et');
    expect(win.document.querySelectorAll('.fw-word').length).toBe(1);
    expect(local.eventQueue || []).toHaveLength(0); // prefetch is not exposure
    const visibility = io.findLast((o) => !o.options.rootMargin);
    const span = el.querySelector('.fw-word');
    visibility.cb([{ target: span, isIntersecting: true, intersectionRatio: 1 }]);
    await wait(20);
    expect(local.eventQueue.map((e) => e.event)).toEqual(['seen']);
    expect(span.dataset.fwStatus).toBe('active');
    // The gloss waits for a dwell; a passing pointer neither shows it nor records anything.
    span.dispatchEvent(new win.MouseEvent('mouseover', { bubbles: true }));
    await wait(100);
    span.dispatchEvent(new win.MouseEvent('mouseout', { bubbles: true }));
    await wait(700);
    expect(span.classList.contains('fw-tip')).toBe(false);
    expect(local.eventQueue).toHaveLength(1);
    span.dispatchEvent(new win.MouseEvent('mouseover', { bubbles: true }));
    await wait(800);
    expect(span.classList.contains('fw-tip')).toBe(true);
    expect(local.eventQueue.map((e) => e.event)).toEqual(['seen', 'peek']);
    span.dispatchEvent(new win.MouseEvent('mouseout', { bubbles: true }));
    expect(span.classList.contains('fw-tip')).toBe(false);
    span.dispatchEvent(new win.MouseEvent('mouseover', { bubbles: true }));
    await wait(800);
    expect(local.eventQueue).toHaveLength(2); // one peek per word per day
    span.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await wait(20);
    expect(span.textContent).toBe('and');
    expect(span.classList.contains('fw-tip')).toBe(false);
    expect(local.eventQueue.map((e) => e.event)).toEqual(['seen', 'peek', 'flip']);
    span.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await wait(20);
    expect(local.eventQueue).toHaveLength(3);

    expect((await call({ type: 'sync' })).ok).toBe(true);
    expect(local.eventQueue).toHaveLength(0);
    expect(writes).toBe(1);
    expect(remoteEvents).toContain(',flip,1,');
    expect(remoteEvents).toContain(',peek,1,');
    expect(remoteEvents).not.toContain('cats');
    expect(alarms.get('sync-after-upload')).toEqual({ delayInMinutes: 1 });
    await call({ type: 'sync' }); expect(writes).toBe(1);
    githubFails = true;
    const failed = await call({ type: 'sync' });
    expect(failed.ok).toBe(false);
    expect(local.vocabulary).toEqual(remoteState);
    await dispatch({ type: 'event', word: 'et', event: 'flip' }, page());
    const pendingID = local.eventQueue[0].id;
    const deviceID = local.deviceId;
    messageListeners.length = 0; storageListeners.length = 0;
    originEvents.added.length = 0; originEvents.removed.length = 0;
    await import('../src/background.js?restart=1');
    await dispatch({ type: 'config' }, page());
    expect(local.eventQueue[0].id).toBe(pendingID);
    expect(local.deviceId).toBe(deviceID);
    githubFails = false;
    await call({ type: 'sync' });
    expect(local.eventQueue).toHaveLength(0);
    expect(remoteEvents.split(pendingID).length - 1).toBe(1);

    // Failed preference writes must survive a worker restart with older synced settings.
    preferencesFail = true;
    await call({ type: 'save', settings: { pauseDays: 2 } });
    expect(local.preferenceDirty).toBe(true);
    expect(synced.preferences.pauseDays).toBe(0);
    messageListeners.length = 0; storageListeners.length = 0;
    originEvents.added.length = 0; originEvents.removed.length = 0;
    await import('../src/background.js?restart=2');
    expect((await dispatch({ type: 'config' }, page())).settings.pauseDays).toBe(2);
    preferencesFail = false;
    await call({ type: 'sync' });
    expect(synced.preferences.pauseDays).toBe(2);
    expect(local.preferenceDirty).toBe(false);
    await chrome.storage.sync.set({ preferences: { ...synced.preferences, pauseDays: 3 } });
    await wait(20);
    expect((await dispatch({ type: 'config' }, page())).settings.pauseDays).toBe(3);

    const beforeClear = modelCalls;
    await call({ type: 'clearCache' }); await wait();
    expect(modelCalls).toBe(beforeClear + 1);
    expect(el.querySelector('.fw-word')?.textContent).toBe('et');
    await call({ type: 'save', siteOverride: { host: 'example.com', enabled: false } });
    expect(el.textContent).toBe('I enjoy cats and dogs every single day.');
    expect(el.querySelector('.fw-word')).toBeNull();
    await call({ type: 'save', settings: { newSitesEnabled: false }, siteOverride: { host: 'example.com', enabled: true } });
    await wait(); expect(el.querySelector('.fw-word')).not.toBeNull();

    // Clearing/off during a delayed API request must not resurrect the old generation.
    delayed = true;
    await call({ type: 'clearCache' }); await wait();
    expect(typeof release).toBe('function');
    await call({ type: 'save', settings: { enabled: false } });
    release(); await wait();
    expect(el.querySelector('.fw-word')).toBeNull();
    expect(Object.keys(local).filter((k) => k.startsWith('c:'))).toHaveLength(0);

    // A different shared vocabulary version updates active pages and cache identity.
    const oldRevision = (await dispatch({ type: 'config' }, page())).revision;
    remoteState = { ...remoteState, version: 'test.2', stage: 2 };
    await call({ type: 'sync' });
    expect((await dispatch({ type: 'config' }, page())).revision).not.toBe(oldRevision);
    expect(local.vocabulary.stage).toBe(2);
    config = await dispatch({ type: 'config' }, page());
    const text = 'I enjoy cats and dogs every single day.';
    const disabledReply = await dispatch({ type: 'swaps', revision: config.revision, items: [{ key: `${config.revision}:${hashKey(text)}`, text }] }, page());
    expect(disabledReply.stale).toBe(true);
    await call({ type: 'save', settings: { enabled: true } }); await wait();
    expect(el.querySelector('.fw-word')).not.toBeNull();
    const dynamic = win.document.createElement('p');
    dynamic.textContent = 'We enjoy books and music every quiet evening.';
    win.document.querySelector('main').append(dynamic); await wait();
    expect(dynamic.querySelector('.fw-word')).not.toBeNull();
    // A failed model call is retried after a backoff instead of leaving the passage English.
    modelThrows = 2;
    const retried = win.document.createElement('p');
    retried.textContent = 'They walk home and talk about the long week.';
    win.document.querySelector('main').append(retried); await wait();
    expect(retried.querySelector('.fw-word')).toBeNull();
    await wait(5500);
    expect(retried.querySelector('.fw-word')?.textContent).toBe('et');
    origins = [];
    for (const fn of originEvents.removed) fn();
    await wait(20);
    expect(el.querySelector('.fw-word')).toBeNull();
    expect(dynamic.querySelector('.fw-word')).toBeNull();
  } finally {
    if (release) release();
    await win.happyDOM.close();
    Object.assign(globalThis, originalGlobals);
  }
}, 30000);
