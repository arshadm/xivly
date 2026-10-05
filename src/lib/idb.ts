// Tiny IndexedDB key-value stores (one database, one object store per name).
// Device-local only (caches, the web build's folder handle): nothing here is
// part of the library folder.
const DB = 'xivly-cache';
const STORES = ['covers', 'metadata', 'kv'] as const;
type StoreName = (typeof STORES)[number];

let db: Promise<IDBDatabase> | null = null;
function open() {
	db ??= new Promise<IDBDatabase>((resolve, reject) => {
		const req = indexedDB.open(DB, 2);
		req.onupgradeneeded = () => STORES.forEach((s) => req.result.objectStoreNames.contains(s) || req.result.createObjectStore(s));
		req.onsuccess = () => {
			// A newer tab upgrading the database must not wait on this one.
			req.result.onversionchange = () => (req.result.close(), (db = null));
			resolve(req.result);
		};
		req.onerror = () => reject(req.error);
		// An older tab still holds the previous version: fail (caches are optional) instead of hanging.
		req.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'));
	}).catch((e) => {
		db = null;
		throw e;
	});
	return db as Promise<IDBDatabase>;
}

async function run<T>(store: StoreName, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
	const tx = (await open()).transaction(store, mode);
	const req = op(tx.objectStore(store));
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve(req.result as T);
		tx.onerror = tx.onabort = () => reject(tx.error ?? req.error);
	});
}

export function idb(store: StoreName) {
	return {
		get: <T>(key: string) => run<T | undefined>(store, 'readonly', (s) => s.get(key)).catch(() => undefined),
		set: (key: string, value: unknown) => run<void>(store, 'readwrite', (s) => s.put(value, key)).catch(() => {}),
		delete: (key: string) => run<void>(store, 'readwrite', (s) => s.delete(key)).catch(() => {})
	};
}
