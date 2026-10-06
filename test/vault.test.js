import { test, expect } from 'bun:test';
import { createVault } from '../src/vault.js';

const memoryStore = (data, restricted) => ({
  ...(restricted ? { setAccessLevel: async () => {} } : {}),
  async get(key) { return key in data ? { [key]: structuredClone(data[key]) } : {}; },
  async set(values) { Object.assign(data, structuredClone(values)); },
  async remove(keys) { for (const k of keys) delete data[k]; },
});
const memoryIdb = (data = {}) => ({ data, get: async (k) => structuredClone(data[k]), set: async (k, v) => { data[k] = structuredClone(v); } });

test('Chrome: secrets stay in access-restricted storage.local', async () => {
  const local = {};
  const vault = createVault(memoryStore(local, true), memoryIdb());
  await vault.set({ apiKey: 'a' });
  expect(local.secrets).toEqual({ apiKey: 'a' });
  expect(await vault.get()).toEqual({ apiKey: 'a' });
});

test('Firefox: secrets live in IndexedDB, never storage.local; older copies are migrated out', async () => {
  const local = { secrets: { apiKey: 'old', githubToken: 'tok' }, settings: {} };
  const idb = memoryIdb({ secrets: { apiKey: 'new' } });
  const vault = createVault(memoryStore(local, false), idb);
  await vault.migrate();
  expect(local.secrets).toBeUndefined();
  expect(await vault.get()).toEqual({ apiKey: 'new', githubToken: 'tok' });
  await vault.set({ apiKey: 'x' });
  expect(local.secrets).toBeUndefined();
  expect(idb.data.secrets).toEqual({ apiKey: 'x' });
  await vault.migrate();
  expect(await vault.get()).toEqual({ apiKey: 'x' });
});
