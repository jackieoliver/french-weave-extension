// Credential storage, readable only by the worker. Chrome restricts storage.local to trusted contexts.
// Firefox has no access levels and its content scripts can read storage.local, so there the secrets live
// in the extension origin's IndexedDB, which content scripts (running in the page origin) cannot open.

export function idbStore(indexedDB = globalThis.indexedDB, name = 'french-weave') {
  const open = () => new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const run = async (mode, fn) => {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('kv', mode);
        const req = fn(tx.objectStore('kv'));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  };
  return {
    get: (key) => run('readonly', (kv) => kv.get(key)),
    set: (key, value) => run('readwrite', (kv) => kv.put(value, key)),
  };
}

export function createVault(store, idb = null) {
  if (store.setAccessLevel || !idb) {
    return {
      async get() { return (await store.get('secrets')).secrets || {}; },
      async set(secrets) { await store.set({ secrets }); },
      async migrate() {},
    };
  }
  return {
    async get() { return (await idb.get('secrets')) || {}; },
    async set(secrets) { await idb.set('secrets', { ...secrets }); },
    // Move anything an earlier build left in storage.local, then remove it there.
    async migrate() {
      const { secrets } = await store.get('secrets');
      if (!secrets) return;
      await idb.set('secrets', { ...secrets, ...(await idb.get('secrets')) });
      await store.remove(['secrets']);
    },
  };
}
