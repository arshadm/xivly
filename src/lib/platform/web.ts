/// <reference types="wicg-file-system-access" />
// Web build: the library is a real folder picked with the File System Access
// API (Chromium browsers), so iCloud/Dropbox folders and agents still work.
// Elsewhere (Safari, Firefox) it falls back to the browser's private storage
// (OPFS): same features, but the files only live in the browser.
import { idb } from '../idb';
import type { LibraryFs, Platform } from './types';

type Dir = FileSystemDirectoryHandle;

// ── Persist the directory handle in IndexedDB ───────────────────────────────
const kv = idb('kv');
const saveHandle = (h: Dir) => kv.set('library', h);
const loadHandle = () => kv.get<Dir>('library');

// ── LibraryFs over a directory handle ───────────────────────────────────────
const TRASH_DAYS = 30;
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

/** Not there (vs. a real error such as a revoked permission). */
const missing = (e: unknown) => e instanceof DOMException && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError');

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
			} catch (e) {
				// A missing folder is empty; anything else (a revoked permission) must not look like it.
				if (missing(e)) return [];
				throw e;
			}
		},
		async exists(path) {
			try {
				const { parent, name } = await entryAt(root, path);
				await parent.getFileHandle(name).catch((e) => (e instanceof DOMException && e.name === 'TypeMismatchError' ? null : Promise.reject(e)));
				return true;
			} catch (e) {
				if (missing(e)) return false;
				throw e;
			}
		},
		async mkdir(path) {
			await dirAt(root, split(path), true);
		},
		async trash(path) {
			const name = split(path).pop()!;
			await fs.mkdir('.xivly/trash');
			await move(path, `.xivly/trash/${Date.now()}-${name}`);
			await pruneTrash().catch((e) => console.warn('trash not pruned', e));
		}
	};

	/**
	 * The browser has no system Trash: `.xivly/trash/` keeps removed papers for
	 * 30 days (entries are named `<time>-<name>`), then they're deleted for good.
	 */
	async function pruneTrash() {
		const trash = await dirAt(root, ['.xivly', 'trash']);
		const cutoff = Date.now() - TRASH_DAYS * 864e5;
		for await (const name of trash.keys()) {
			const time = Number(name.split('-')[0]);
			if (Number.isFinite(time) && time < cutoff) await trash.removeEntry(name, { recursive: true });
		}
	}

	/** Rename a file or folder; fails if `to` exists. */
	async function move(from: string, to: string) {
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
	}
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
	// No claude on the web; end-to-end tests stand one in (tests/smoke.spec.ts) to drive the Chat tab.
	claude: (globalThis as { __xivlyTestClaude?: Platform['claude'] }).__xivlyTestClaude,
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
		// Links come from paper.json and Hugging Face: never a `javascript:` URL in our origin.
		const u = URL.parse(url);
		if (u && (u.protocol === 'https:' || u.protocol === 'http:')) window.open(u.href, '_blank', 'noopener,noreferrer');
	}
};
