// The library on disk, shared by desktop and web. See templates/AGENTS.md
// for the layout. paper.json / library.json are merged, never rewritten
// from scratch, so fields added by users, hooks or agents survive.
import type { HookEvent, LibraryFs, Platform } from './platform';
import agentsMd from './templates/AGENTS.md?raw';
import sampleHook from './templates/paper-added.sample?raw';
import type { LibraryFile, Paper, PaperPatch } from './types';

const enc = new TextEncoder();
const dec = new TextDecoder();

export const DEFAULT_LIBRARY: LibraryFile = {
	version: 1,
	// Colours are keys of svelte-pdf-mini's `paperColors` matte palette.
	categories: [
		{ id: 'to-read', name: 'To read', color: 'sand' },
		{ id: 'vision', name: 'Vision', color: 'sage' },
		{ id: 'language', name: 'Language', color: 'sky' },
		{ id: 'generative', name: 'Generative', color: 'rose' }
	],
	tags: []
};

type Json = Record<string, unknown>;

/** Shallow merge: `null` deletes a key, `undefined` is ignored. */
export function merge<T extends Json>(target: T, patch: Json): T {
	const out: Json = { ...target };
	for (const [k, v] of Object.entries(patch)) {
		if (v === null) delete out[k];
		else if (v !== undefined) out[k] = v;
	}
	return out as T;
}

export function slugify(s: string) {
	const slug = s
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80)
		.replace(/-+$/, '');
	return slug || 'paper';
}

export class Repo {
	/** Per-path promise chains: read-merge-write cycles never interleave. */
	#locks = new Map<string, Promise<unknown>>();

	constructor(
		readonly fs: LibraryFs,
		readonly platform: Platform
	) {}

	#lock<T>(key: string, fn: () => Promise<T>): Promise<T> {
		const prev = this.#locks.get(key) ?? Promise.resolve();
		const next = prev.then(fn, fn);
		const settled = next.catch(() => {});
		this.#locks.set(key, settled);
		settled.then(() => this.#locks.get(key) === settled && this.#locks.delete(key));
		return next;
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

	/** Read-merge-write under the file's lock. */
	#patchJson(path: string, patch: Json): Promise<Json> {
		return this.#lock(path, async () => {
			const next = merge((await this.#readJson(path)) ?? {}, patch);
			await this.#writeJson(path, next);
			return next;
		});
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
		return merge(DEFAULT_LIBRARY as unknown as Json, (await this.#readJson('.xivly/library.json')) ?? {}) as unknown as LibraryFile;
	}

	async updateLibrary(patch: Partial<LibraryFile>): Promise<LibraryFile> {
		const next = await this.#patchJson('.xivly/library.json', patch);
		return merge(DEFAULT_LIBRARY as unknown as Json, next) as unknown as LibraryFile;
	}

	// ── Papers ────────────────────────────────────────────────────────────

	async listPapers(): Promise<Paper[]> {
		const dirs = (await this.fs.list('papers')).filter((e) => e.dir && !e.name.startsWith('.'));
		const papers = await Promise.all(
			dirs.map(async ({ name: id }) => {
				// A broken paper.json shouldn't hide the paper (edits to it will fail loudly).
				const meta = await this.#readJson<Json>(`papers/${id}/paper.json`).catch(() => ({}));
				if (!meta && !(await this.fs.exists(`papers/${id}/paper.pdf`))) return null;
				return { title: id, added: '', ...meta, id } as Paper;
			})
		);
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
			await this.#writeJson(`papers/${id}/paper.json`, paper);
			return id;
		});
		await this.fs.write(`papers/${id}/paper.pdf`, bytes);
		this.#hook('paper-added', id);
		return { ...paper, id } as Paper;
	}

	async update(id: string, patch: PaperPatch): Promise<Paper> {
		const next = await this.#patchJson(`papers/${id}/paper.json`, { ...patch, id: undefined });
		this.#hook('paper-updated', id);
		return { ...next, id } as Paper;
	}

	/** Like `update`, without firing a hook (reading position, last opened). */
	async touch(id: string, patch: PaperPatch) {
		await this.#patchJson(`papers/${id}/paper.json`, patch);
	}

	readPdf(id: string) {
		return this.fs.read(`papers/${id}/paper.pdf`);
	}

	async savePdf(id: string, bytes: Uint8Array) {
		if (dec.decode(bytes.subarray(0, 4)) !== '%PDF') throw new Error('Refusing to save: not a PDF');
		await this.#lock(`papers/${id}/paper.pdf`, () => this.fs.write(`papers/${id}/paper.pdf`, bytes));
		this.#hook('paper-saved', id);
	}

	async remove(id: string) {
		// Hook first (the platform waits for it): once trashed, the folder is gone.
		await this.platform.runHook?.('paper-removed', id).catch((e) => console.warn('hook failed', e));
		await this.fs.trash(`papers/${id}`);
	}
}
