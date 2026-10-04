/// <reference types="wicg-file-system-access" />
// Web build: the library is a real folder picked with the File System Access
// API (Chromium browsers), so iCloud/Dropbox folders and agents still work.
// Elsewhere (Safari, Firefox) it falls back to the browser's private storage
// (OPFS): same features, but the files only live in the browser.
import type { LibraryFs, Platform } from './types';

type Dir = FileSystemDirectoryHandle;

// ── Persist the directory handle in IndexedDB ───────────────────────────────
const DB = 'xivly';
function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
	return new Promise((resolve, reject) => {
		const open = indexedDB.open(DB, 1);
		open.onupgradeneeded = () => open.result.createObjectStore('kv');
		open.onerror = () => reject(open.error);
		open.onsuccess = () => {
			const db = open.result;
			const tx = db.transaction('kv', mode);
			const req = fn(tx.objectStore('kv'));
			// Resolve once the transaction is committed, not just the request.
			tx.oncomplete = () => (db.close(), resolve(req.result as T));
			tx.onerror = tx.onabort = () => (db.close(), reject(tx.error ?? req.error));
		};
	});
}
const saveHandle = (h: Dir) => idb('readwrite', (s) => s.put(h, 'library'));
const loadHandle = () => idb<Dir | undefined>('readonly', (s) => s.get('library'));

// ── LibraryFs over a directory handle ───────────────────────────────────────
const split = (path: string) => path.split('/').filter((p) => p && p !== '.');

async function dirAt(root: Dir, parts: string[], create = false): Promise<Dir> {
	let d = root;
	for (const p of parts) d = await d.getDirectoryHandle(p, { create });
	return d;
}

async function entryAt(root: Dir, path: string) {
	const parts = split(path);
	const name = parts.pop()!;
	const parent = await dirAt(root, parts);
	return { parent, name };
}

async function copyDir(from: Dir, to: Dir) {
	for await (const [name, h] of from.entries()) {
		if (h.kind === 'directory') await copyDir(h as Dir, await to.getDirectoryHandle(name, { create: true }));
		else {
			const w = await (await to.getFileHandle(name, { create: true })).createWritable();
			await w.write(await (h as FileSystemFileHandle).getFile());
			await w.close();
		}
	}
}

function dirFs(root: Dir): LibraryFs {
	const fs: LibraryFs = {
		async read(path) {
			try {
				const { parent, name } = await entryAt(root, path);
				const file = await (await parent.getFileHandle(name)).getFile();
				return new Uint8Array(await file.arrayBuffer());
			} catch (e) {
				if (e instanceof DOMException && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError')) return null;
				throw e;
			}
		},
		async write(path, data) {
			const parts = split(path);
			const name = parts.pop()!;
			const parent = await dirAt(root, parts, true);
			// createWritable writes to a swap file and swaps on close: atomic.
			const w = await (await parent.getFileHandle(name, { create: true })).createWritable();
			await w.write(data as Uint8Array<ArrayBuffer>);
			await w.close();
		},
		async list(path) {
			try {
				const d = await dirAt(root, split(path));
				const out: { name: string; dir: boolean }[] = [];
				for await (const [name, h] of d.entries()) out.push({ name, dir: h.kind === 'directory' });
				return out;
			} catch {
				return [];
			}
		},
		async exists(path) {
			const { parent, name } = await entryAt(root, path).catch(() => ({ parent: null, name: '' }));
			if (!parent) return false;
			for await (const key of parent.keys()) if (key === name) return true;
			return false;
		},
		async mkdir(path) {
			await dirAt(root, split(path), true);
		},
		async rename(from, to) {
			if (await fs.exists(to)) throw new Error(`${to} already exists`);
			const src = await entryAt(root, from);
			const dst = await entryAt(root, to);
			const handle = await src.parent.getDirectoryHandle(src.name).catch(() => src.parent.getFileHandle(src.name));
			// `move()` is Chromium-only; fall back to copy + delete.
			const movable = handle as FileSystemHandle & { move?: (d: Dir, n: string) => Promise<void> };
			try {
				if (!movable.move) throw new Error('no move');
				await movable.move(dst.parent, dst.name);
			} catch {
				if (handle.kind === 'directory') await copyDir(handle as Dir, await dst.parent.getDirectoryHandle(dst.name, { create: true }));
				else await fs.write(to, (await fs.read(from))!);
				await src.parent.removeEntry(src.name, { recursive: true });
			}
		},
		async trash(path) {
			const name = split(path).pop()!;
			await fs.mkdir('.xivly/trash');
			await fs.rename(path, `.xivly/trash/${Date.now()}-${name}`);
		}
	};
	return fs;
}

// ── Platform ────────────────────────────────────────────────────────────────
const hasPicker = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
const opts = { mode: 'readwrite' } as const;

async function opfs() {
	return { fs: dirFs(await navigator.storage.getDirectory()), name: 'Browser storage' };
}

/** Ask the browser not to evict our storage (the OPFS library, the saved folder handle). */
async function persist() {
	if (!(await navigator.storage.persisted())) await navigator.storage.persist();
}

export const webPlatform: Platform = {
	kind: 'web',
	onDisk: hasPicker,
	async restore() {
		if (!hasPicker) return localStorage.getItem('xivly:opfs') ? opfs() : null;
		const h = await loadHandle().catch(() => undefined);
		if (!h) return null;
		if ((await h.queryPermission(opts)) === 'granted') return { fs: dirFs(h), name: h.name };
		return { needsPermission: h.name };
	},
	async reconnect() {
		const h = await loadHandle().catch(() => undefined);
		if (!h || (await h.requestPermission(opts)) !== 'granted') return null;
		return { fs: dirFs(h), name: h.name };
	},
	async pick() {
		await persist();
		if (!hasPicker) {
			localStorage.setItem('xivly:opfs', '1');
			return opfs();
		}
		let h: Dir;
		try {
			h = await window.showDirectoryPicker({ id: 'xivly-library', ...opts });
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') return null; // cancelled
			throw e;
		}
		await saveHandle(h);
		return { fs: dirFs(h), name: h.name };
	},
	async openUrl(url) {
		window.open(url, '_blank', 'noopener');
	}
};
