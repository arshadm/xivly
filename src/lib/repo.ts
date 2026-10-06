// The library on disk, shared by desktop and web. See templates/AGENTS.md
// for the layout. paper.json / library.json are merged, never rewritten
// from scratch, so fields added by users, hooks or agents survive.
import type { HookEvent, LibraryFs, Platform } from './platform';
import agentsMd from './templates/AGENTS.md?raw';
import sampleHook from './templates/paper-added.sample?raw';
import type { LibraryFile, Paper, PaperPatch } from './types';

const enc = new TextEncoder();
const dec = new TextDecoder();

const DEFAULT_LIBRARY: LibraryFile = {
	version: 1,
	// Colors are keys of svelte-pdf-mini's `paperColors` matte palette.
	categories: [
		{ id: 'vision', name: 'Vision', color: 'sage' },
		{ id: 'language', name: 'Language', color: 'sky' },
		{ id: 'generative', name: 'Generative', color: 'rose' }
	],
	tags: []
};

type Json = Record<string, unknown>;

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined);

/** paper.json is edited by people and agents: keep the fields the app relies on well-typed. */
export function normalizePaper(id: string, meta: Json): Paper {
	return { ...meta, id, title: str(meta.title)?.trim() || id, added: str(meta.added) ?? '', authors: strs(meta.authors), tags: strs(meta.tags), category: str(meta.category) } as Paper;
}

const isColor = (v: unknown) => typeof v === 'string' && v.length > 0;

/** library.json too: a category without a name or color, or tags that aren't a list, must not break the app. */
export function normalizeLibrary(raw: Json): LibraryFile {
	const categories = (Array.isArray(raw.categories) ? raw.categories : DEFAULT_LIBRARY.categories)
		.filter((c): c is Json => !!c && typeof c === 'object' && typeof (c as Json).id === 'string')
		.map((c) => ({ ...c, id: c.id as string, name: str(c.name) || (c.id as string), color: isColor(c.color) ? c.color : 'stone' }));
	return { ...raw, version: typeof raw.version === 'number' ? raw.version : 1, categories, tags: strs(raw.tags) ?? [] } as LibraryFile;
}

/** A change to a JSON file: a patch, or a function of the current content (applied under the file's lock). */
export type Patch<T> = Json | ((current: T) => Json);

/** Thrown when writing to a paper whose folder is gone (trashed from another window, Finder…). */
export class RemovedError extends Error {
	constructor(id: string) {
		super(`“${id}” is no longer in the library`);
	}
}

/** Shallow merge: `null` deletes a key, `undefined` is ignored. */
export function merge<T extends Json>(target: T, patch: Json): T {
	const out: Json = { ...target };
	for (const [k, v] of Object.entries(patch)) {
		if (v === null) delete out[k];
		else if (v !== undefined) out[k] = v;
	}
	return out as T;
}

/** A folder name for any OS (Windows reserves a few device names). */
export function slugify(s: string, fallback = 'paper') {
	const slug = s
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80)
		.replace(/-+$/, '');
	if (/^(con|prn|aux|nul|com\d|lpt\d)$/.test(slug)) return `${slug}-${fallback}`;
	return slug || fallback;
}

export class Repo {
	constructor(
		readonly fs: LibraryFs,
		readonly platform: Platform
	) {}

	/**
	 * Per-path lock, shared by every window and tab of the app (Web Locks):
	 * read-merge-write cycles on a file never interleave, even from the library
	 * and a reader window at once.
	 */
	#lock<T>(key: string, fn: () => Promise<T>): Promise<T> {
		return navigator.locks.request(`xivly:${key}`, fn);
	}

	// ── JSON helpers ──────────────────────────────────────────────────────

	/**
	 * `null` only when the file doesn't exist. A file that can't be read or
	 * parsed throws: merging a patch into `{}` would wipe it on the next write
	 * (e.g. while a sync client or an agent is rewriting it).
	 */
	async #readJson<T = Json>(path: string): Promise<T | null> {
		const bytes = await this.fs.read(path);
		if (!bytes) return null;
		try {
			return JSON.parse(dec.decode(bytes)) as T;
		} catch {
			throw new Error(`${path} is not valid JSON`);
		}
	}

	#writeJson(path: string, value: unknown) {
		return this.fs.write(path, enc.encode(JSON.stringify(value, null, 2) + '\n'));
	}

	/** Read-merge-write under the file's lock; `guard` runs first, under the lock too. */
	#patchJson<T extends Json = Json>(path: string, patch: Patch<T>, guard?: () => Promise<void>): Promise<Json> {
		return this.#lock(path, async () => {
			await guard?.();
			const current = (await this.#readJson(path)) ?? {};
			const next = merge(current, typeof patch === 'function' ? patch(current as T) : patch);
			await this.#writeJson(path, next);
			return next;
		});
	}

	/** A write to a paper must never bring back a folder trashed meanwhile (`write` creates parents). */
	async #present(id: string) {
		if (!(await this.fs.exists(`papers/${id}`))) throw new RemovedError(id);
	}

	#hook(event: HookEvent, id: string) {
		this.platform.runHook?.(event, id).catch((e) => console.warn('hook failed', e));
	}

	// ── Library ───────────────────────────────────────────────────────────

	/** Create missing structure. Never overwrites existing files. */
	async init() {
		await this.fs.mkdir('papers');
		await this.fs.mkdir('.xivly/hooks');
		const files: [string, string | (() => string)][] = [
			['.xivly/library.json', () => JSON.stringify(DEFAULT_LIBRARY, null, 2) + '\n'],
			['.xivly/hooks/paper-added.sample', sampleHook],
			['AGENTS.md', agentsMd],
			['CLAUDE.md', '@AGENTS.md\n']
		];
		for (const [path, content] of files) {
			if (!(await this.fs.exists(path)))
				await this.fs.write(path, enc.encode(typeof content === 'function' ? content() : content));
		}
	}

	async readLibrary(): Promise<LibraryFile> {
		return normalizeLibrary(merge(DEFAULT_LIBRARY as unknown as Json, (await this.#readJson('.xivly/library.json')) ?? {}));
	}

	/**
	 * Merge into library.json. A function gets the current file (normalized), so
	 * a change to its lists never overwrites edits made meanwhile elsewhere.
	 */
	async updateLibrary(patch: Partial<LibraryFile> | ((current: LibraryFile) => Partial<LibraryFile>)): Promise<LibraryFile> {
		const next = await this.#patchJson<Json>(
			'.xivly/library.json',
			typeof patch === 'function' ? (cur) => patch(normalizeLibrary(merge(DEFAULT_LIBRARY as unknown as Json, cur))) as Json : (patch as Json)
		);
		return normalizeLibrary(merge(DEFAULT_LIBRARY as unknown as Json, next));
	}

	// ── Papers ────────────────────────────────────────────────────────────

	/**
	 * One paper, or null once its folder is gone. Read under the file's lock (never
	 * mid-write by this app) and retried once: a read can fail while another
	 * process (sync client, agent) rewrites the file. If it still can't be read,
	 * `previous` (what was shown so far) is kept; without one the paper still
	 * shows, under its folder name (edits to it will fail loudly).
	 */
	async readPaper(id: string, previous?: Paper): Promise<Paper | null> {
		const path = `papers/${id}/paper.json`;
		const read = () => this.#lock(path, () => this.#readJson<Json>(path));
		let meta: Json | null;
		try {
			meta = await read().catch(async () => (await sleep(150), read()));
		} catch {
			return previous ?? normalizePaper(id, {});
		}
		if (!meta && !(await this.fs.exists(`papers/${id}/paper.pdf`))) return null;
		return normalizePaper(id, meta ?? {});
	}

	/** Every paper; `previous` (by id) is kept for a paper whose paper.json can't be read right now. */
	async listPapers(previous?: ReadonlyMap<string, Paper>): Promise<Paper[]> {
		const dirs = (await this.fs.list('papers')).filter((e) => e.dir && !e.name.startsWith('.'));
		const papers = await Promise.all(dirs.map(({ name: id }) => this.readPaper(id, previous?.get(id))));
		return papers.filter((p): p is Paper => !!p);
	}

	/**
	 * Add a PDF: write it under a slug of `<year>-<title>`, merge metadata,
	 * fire `paper-added`. Metadata is extracted *before* writing so the folder
	 * gets its final name directly (no rename on sync drives). Ids are
	 * reserved under a lock so parallel imports never pick the same folder.
	 */
	async add(bytes: Uint8Array, meta: PaperPatch): Promise<Paper> {
		const title = String(meta.title ?? 'paper');
		const base = slugify(meta.year ? `${meta.year} ${title}` : title);
		const paper = merge({ title, added: new Date().toISOString() }, meta);
		const id = await this.#lock('papers/', async () => {
			let id = base;
			for (let n = 2; await this.fs.exists(`papers/${id}`); n++) id = `${base}-${n}`;
			// The empty folder reserves the id (a folder without files isn't listed as a paper).
			await this.fs.mkdir(`papers/${id}`);
			return id;
		});
		try {
			// PDF first: a folder with paper.json but no PDF would show as a broken paper.
			await this.fs.write(`papers/${id}/paper.pdf`, bytes);
			await this.#writeJson(`papers/${id}/paper.json`, paper);
		} catch (e) {
			await this.fs.trash(`papers/${id}`).catch(() => {});
			throw e;
		}
		this.#hook('paper-added', id);
		return { ...paper, id } as Paper;
	}

	/**
	 * Reserve `papers/<id>` for files written by hand (the example library):
	 * `false` when that folder already exists.
	 */
	reserve(id: string): Promise<boolean> {
		return this.#lock('papers/', async () => {
			if (await this.fs.exists(`papers/${id}`)) return false;
			await this.fs.mkdir(`papers/${id}`);
			return true;
		});
	}

	/** Merge into paper.json (a function gets the current content, under the lock). Refused once the paper is gone. */
	async update(id: string, patch: Patch<Paper>): Promise<Paper> {
		const next = await this.#patchJson<Paper>(`papers/${id}/paper.json`, withoutId(patch), () => this.#present(id));
		this.#hook('paper-updated', id);
		return { ...next, id } as Paper;
	}

	/** Like `update`, without firing a hook (reading position, last opened). */
	async touch(id: string, patch: Patch<Paper>) {
		await this.#patchJson<Paper>(`papers/${id}/paper.json`, withoutId(patch), () => this.#present(id));
	}

	readPdf(id: string) {
		return this.fs.read(`papers/${id}/paper.pdf`);
	}

	async savePdf(id: string, bytes: Uint8Array) {
		if (dec.decode(bytes.subarray(0, 4)) !== '%PDF') throw new Error('Refusing to save: not a PDF');
		await this.#lock(`papers/${id}/paper.pdf`, async () => {
			await this.#present(id);
			await this.fs.write(`papers/${id}/paper.pdf`, bytes);
		});
		this.#hook('paper-saved', id);
	}

	async remove(id: string) {
		// Hook first (the platform waits for it): once trashed, the folder is gone.
		await this.platform.runHook?.('paper-removed', id).catch((e) => console.warn('hook failed', e));
		// Under the paper's locks: a save or an edit in progress finishes first, later ones see it's gone.
		await this.#lock(`papers/${id}/paper.json`, () => this.#lock(`papers/${id}/paper.pdf`, () => this.fs.trash(`papers/${id}`)));
	}
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Never write a paper's id into its own paper.json (it's the folder name). */
function withoutId(patch: Patch<Paper>): Patch<Paper> {
	return typeof patch === 'function' ? (cur) => ({ ...patch(cur), id: undefined }) : { ...patch, id: undefined };
}
