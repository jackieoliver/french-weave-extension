import { test, expect } from 'bun:test';
import { githubClient, validateState, encode, decode } from '../src/sync.js';
import { cleanSettings, siteEnabled, hasSiteAccess } from '../src/settings.js';

const state = { version: '1.sample', stage: 1, words: [{ fr: 'très', en: 'very', hint: 'treh', status: 'shaky' }] };
const device = '11111111-1111-4111-8111-111111111111';
const event = { id: '22222222-2222-4222-8222-222222222222', date: '2026-09-22', word: 'très', event: 'seen' };
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const file = (text, sha = 'blob') => response(200, { type: 'file', encoding: 'base64', content: encode(text), sha, size: text.length });

test('GitHub state preserves accents and rejects malformed/ambiguous records', async () => {
  const client = githubClient('synthetic-token', async (url, init) => {
    expect(url).toContain('state.json?ref=main');
    expect(url).not.toContain('synthetic-token');
    expect(init.headers.Authorization).toBe('Bearer synthetic-token');
    return file(JSON.stringify(state));
  });
  expect(await client.state()).toEqual(state);
  expect(() => validateState({ ...state, stage: 9 })).toThrow();
  expect(() => validateState({ ...state, words: [...state.words, ...state.words] })).toThrow();
  expect(() => validateState({ ...state, words: [{ ...state.words[0], fr: 'bad\nword' }] })).toThrow();
});

test('a successful upload with a lost response is retry-safe', async () => {
  let remote = null;
  let writes = 0;
  const client = githubClient('synthetic-token', async (url, init) => {
    expect(url).toContain(`extension-${device}-2026-09.csv`);
    if (init.method === 'GET') return remote ? file(remote) : response(404, {});
    const body = JSON.parse(init.body);
    remote = decode(body.content); writes++;
    expect(body.branch).toBe('main');
    throw new Error('connection lost after server committed');
  });
  await expect(client.upload(device, [event])).rejects.toThrow('GitHub is unavailable');
  await client.upload(device, [event]);
  expect(writes).toBe(1);
  expect(remote.split(event.id).length - 1).toBe(1);
  expect(remote).toContain('très');
});

test('SHA conflict refetches and preserves an existing event', async () => {
  let reads = 0, writes = 0;
  let result;
  const previous = 'date,word,event,count,id\n2026-09-21,"et",seen,1,33333333-3333-4333-8333-333333333333\n';
  const client = githubClient('synthetic-token', async (_url, init) => {
    if (init.method === 'GET') return file(reads++ ? previous : 'date,word,event,count,id\n', reads === 1 ? 'old' : 'new');
    const body = JSON.parse(init.body);
    if (!writes++) return response(409, {});
    expect(body.sha).toBe('new'); result = decode(body.content);
    return response(200, {});
  });
  await client.upload(device, [event]);
  expect(result).toContain(previous);
  expect(result.split(event.id).length - 1).toBe(1);
});

test('GitHub errors do not include the credential or server response', async () => {
  const client = githubClient('synthetic-secret', async () => response(403, { message: 'synthetic-secret' }));
  await expect(client.state()).rejects.toThrow('Contents permission');
});

test('new sites default on; explicit site exceptions win in either default mode', () => {
  const s = cleanSettings({ apiKey: 'must-not-sync', githubToken: 'must-not-sync' });
  expect(s.apiKey).toBeUndefined(); expect(s.githubToken).toBeUndefined();
  expect(siteEnabled(s, 'https://example.com/story')).toBe(true);
  expect(siteEnabled({ ...s, siteOverrides: { 'example.com': false } }, 'https://example.com/story')).toBe(false);
  expect(siteEnabled({ ...s, newSitesEnabled: false, siteOverrides: { 'example.com': true } }, 'https://example.com/story')).toBe(true);
  expect(siteEnabled(s, 'chrome://extensions')).toBe(false);
  expect(hasSiteAccess('https://example.com', ['https://*/*'])).toBe(true);
  expect(hasSiteAccess('http://example.com', ['https://*/*'])).toBe(false);
  expect(hasSiteAccess('https://example.org', ['https://example.com/*'])).toBe(false);
  expect(hasSiteAccess('http://localhost:8843/article', ['http://localhost/*'])).toBe(true);
  expect(hasSiteAccess('https://x.com/home', [])).toBe(false);
  expect(hasSiteAccess('https://x.com/home', ['https://x.com/*'])).toBe(true);
});
