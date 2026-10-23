// Тонкая обёртка над IndexedDB. Три хранилища: videos, exercises, workouts.
const DB_NAME = 'trenka';
const DB_VERSION = 1;
const STORES = ['videos', 'exercises', 'workouts'];

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('Не удалось открыть базу'));
    req.onblocked = () => reject(new Error('База заблокирована другой вкладкой'));
  });
  return dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(name, mode, fn) {
  const db = await openDB();
  const tx = db.transaction(name, mode);
  const store = tx.objectStore(name);
  const result = await fn(store);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Транзакция отменена'));
  });
  return result;
}

export const getAll = (name) => withStore(name, 'readonly', (s) => wrap(s.getAll()));
export const get = (name, key) => withStore(name, 'readonly', (s) => wrap(s.get(key)));
export const put = (name, value) => withStore(name, 'readwrite', (s) => wrap(s.put(value)));
export const del = (name, key) => withStore(name, 'readwrite', (s) => wrap(s.delete(key)));
export const count = (name) => withStore(name, 'readonly', (s) => wrap(s.count()));
