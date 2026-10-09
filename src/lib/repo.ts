// The library on disk, shared by desktop and web. See templates/AGENTS.md
// for the layout. paper.json / library.json are merged, never rewritten
// from scratch, so fields added by users, hooks or agents survive.
import { parseBookmarks } from './bookmarks';
import { sha256 } from './duplicates';
import { isPaperPath } from './notes/images';
import { notesToMarkdown } from './notes/markdown';
import type { HookEvent, LibraryFs, Platform } from './platform';
import agentsMd from './templates/AGENTS.md?raw';
import sampleHook from './templates/paper-added.sample?raw';
import type { HfLinks, LibraryFile, NotesDoc, NotesFile, Paper, PaperLinks, PaperPatch } from './types';

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
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const isObject = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
/** A list of URLs; a single one written as a string counts too. */
const urls = (v: unknown) => (typeof v === 'string' ? [v] : strs(v));

/** `year`: a number, or a year written as text ("2017"). */
function year(v: unknown) {
	const n = typeof v === 'string' && /^\s*\d{4}\s*$/.test(v) ? Number(v) : num(v);
	return n !== undefined && Number.isInteger(n) ? n : undefined;
}

function links(v: unknown): PaperLinks | undefined {
	if (!isObject(v)) return undefined;
	return { ...v, project: str(v.project), github: urls(v.github), huggingface: urls(v.huggingface), other: urls(v.other) };
}

/** Hugging Face counts (`{ total, top }`), shown in the paper details. */
function repoCounts(v: unknown) {
	return isObject(v) && num(v.total) !== undefined ? { total: v.total as number, top: strs(v.top) ?? [] } : undefined;
}

function hf(v: unknown): HfLinks | undefined {
	if (!isObject(v)) return undefined;
	return {
		...v,
		page: str(v.page),
		title: str(v.title),
		authors: strs(v.authors),
		upvotes: num(v.upvotes),
		project: str(v.project),
		github: str(v.github),
		githubStars: num(v.githubStars),
		models: repoCounts(v.models),
		datasets: repoCounts(v.datasets),
		spaces: repoCounts(v.spaces),
		checked: str(v.checked)
	};
}

/**
 * paper.json is edited by people and agents: keep the fields the app relies on
 * well-typed (a wrong type reads as absent; unknown fields are kept as they are).
 */
export function normalizePaper(id: string, meta: Json): Paper {
	return {
		...meta,
		id,
		title: str(meta.title)?.trim() || id,
		added: str(meta.added) ?? '',
		authors: strs(meta.authors),
		tags: strs(meta.tags),
		category: str(meta.category),
		year: year(meta.year),
		// A date written as a bare year (`"date": 2017`) still sorts.
		date: str(meta.date) ?? (year(meta.date) !== undefined ? String(meta.date) : undefined),
		opened: str(meta.opened),
		// Read: a timestamp; any other truthy value still counts as read.
		read: str(meta.read) ?? (meta.read ? String(meta.read) : undefined),
		position: num(meta.position),
		bookmarks: parseBookmarks(meta.bookmarks),
		abstract: str(meta.abstract),
		doi: str(meta.doi),
		arxiv: str(meta.arxiv),
		links: links(meta.links),
		hf: hf(meta.hf)
	} as Paper;
}

const NOTES_VERSION = 1;
const NOTES_MD_HEADER = '<!-- Written by Xivly from notes.json each time the notes are saved: edit the notes in Xivly (changes here are replaced). -->';

/** notes.json as the app needs it, or null when it isn't notes at all. */
function normalizeNotes(raw: Json): NotesFile | null {
	const doc = raw.doc;
	if (!isObject(doc) || doc.type !== 'doc' || (doc.content !== undefined && !Array.isArray(doc.content))) return null;
	return { ...raw, version: num(raw.version) ?? NOTES_VERSION, doc: doc as NotesDoc, updated: str(raw.updated) };
}

const isColor = (v: unknown) => typeof v === 'string' && v.length > 0;

/** library.json too: a category without a name or color, or tags that aren't a list, must not break the app. */
export function normalizeLibrary(raw: Json): LibraryFile {
	const categories = (Array.isArray(raw.categories) ? raw.categories : DEFAULT_LIBRARY.categories)
		.filter((c): c is Json => !!c && typeof c === 'object' && typeof (c as Json).id === 'string')
		.map((c) => ({ ...c, id: c.id as string, name: str(c.name) || (c.id as string), color: isColor(c.color) ? c.color : 'stone' }));
	return { ...raw, version: typeof raw.version === 'number' ? raw.version : 1, categories, tags: strs(raw.tags) ?? [] } as LibraryFile;
}

/**
 * Whether these bytes are a PDF: `%PDF-` within the first 1 KB (PDF readers
 * allow some junk before the header). An HTML page saved as `.pdf` (a paywall,
 * a login page) isn't.
 */
export function isPdf(bytes: Uint8Array) {
	return new TextDecoder('latin1').decode(bytes.subarray(0, 1024)).includes('%PDF-');
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

	/** The last paper.json text seen per paper, and the paper parsed from it. */
	#parsed = new Map<string, { text: string; paper: Paper }>();

	/**
	 * Every paper; `previous` (by id) is kept for a paper whose paper.json can't be read right now.
	 * Desktop reads every paper.json in one call (writes are atomic, so never a half-written
	 * one), and an unchanged file returns the same object, unparsed: the library reloads on
	 * every focus. A file that's missing or unreadable is read alone, as `readPaper` does.
	 */
	async listPapers(previous?: ReadonlyMap<string, Paper>): Promise<Paper[]> {
		if (!this.fs.readEach) {
			const dirs = (await this.fs.list('papers')).filter((e) => e.dir && !e.name.startsWith('.'));
			const papers = await Promise.all(dirs.map(({ name: id }) => this.readPaper(id, previous?.get(id))));
			return papers.filter((p): p is Paper => !!p);
		}
		const files = await this.fs.readEach('papers', 'paper.json');
		const parsed = new Map<string, { text: string; paper: Paper }>();
		const papers = await Promise.all(
			files.map(async ({ name: id, text, error }) => {
				if (text !== null && !error) {
					const hit = this.#parsed.get(id);
					if (hit?.text === text) return (parsed.set(id, hit), hit.paper);
					try {
						const paper = normalizePaper(id, JSON.parse(text));
						parsed.set(id, { text, paper });
						return paper;
					} catch {
						// Not valid JSON: read alone (retried, or the paper shown so far is kept).
					}
				}
				return this.readPaper(id, previous?.get(id));
			})
		);
		this.#parsed = parsed;
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

	/**
	 * Merge into paper.json (a function gets the current content, normalized, under
	 * the lock). Refused once the paper is gone.
	 */
	async update(id: string, patch: Patch<Paper>): Promise<Paper> {
		const next = await this.#patchJson<Paper>(`papers/${id}/paper.json`, prepare(id, patch), () => this.#present(id));
		this.#hook('paper-updated', id);
		return normalizePaper(id, next);
	}

	/** Like `update`, without firing a hook (reading position, last opened). */
	async touch(id: string, patch: Patch<Paper>) {
		await this.#patchJson<Paper>(`papers/${id}/paper.json`, prepare(id, patch), () => this.#present(id));
	}

	// ── Notes ─────────────────────────────────────────────────────────────

	/**
	 * The paper's notes, or null when it has none yet. Throws when notes.json exists but
	 * isn't notes (unreadable, or edited by hand into something else): saving over it would lose it.
	 */
	async readNotes(id: string): Promise<NotesFile | null> {
		const path = `papers/${id}/notes.json`;
		const raw = await this.#lock(path, () => this.#readJson<Json>(path));
		if (!raw) return null;
		const notes = normalizeNotes(raw);
		if (!notes) throw new Error(`${path} doesn’t hold notes`);
		return notes;
	}

	/**
	 * Write the notes (merged: fields added by agents are kept), then notes.md, the same notes
	 * as Markdown for tools that read the folder. Refused once the paper is gone.
	 */
	async saveNotes(id: string, doc: NotesDoc) {
		await this.#patchJson(`papers/${id}/notes.json`, { version: NOTES_VERSION, updated: new Date().toISOString(), doc }, () => this.#present(id));
		const md = notesToMarkdown(doc);
		await this.#lock(`papers/${id}/notes.md`, async () => {
			await this.#present(id);
			await this.fs.write(`papers/${id}/notes.md`, enc.encode(`${NOTES_MD_HEADER}\n\n${md}${md ? '\n' : ''}`));
		});
	}

	/**
	 * An image for the paper's notes, kept as `notes-assets/<hash>.<ext>` (the same image is
	 * stored once). Returns that path, relative to the paper's folder.
	 */
	async saveNoteAsset(id: string, bytes: Uint8Array, ext: string): Promise<string> {
		if (!/^[a-z0-9]+$/.test(ext)) throw new Error(`Not a file extension: ${ext}`);
		const name = `notes-assets/${(await sha256(bytes as Uint8Array<ArrayBuffer>)).slice(0, 16)}.${ext}`;
		await this.#lock(`papers/${id}/${name}`, async () => {
			await this.#present(id);
			if (!(await this.fs.exists(`papers/${id}/${name}`))) await this.fs.write(`papers/${id}/${name}`, bytes);
		});
		return name;
	}

	/** A file in the paper's folder by its relative path (a notes image), or null when missing. */
	readPaperFile(id: string, path: string) {
		if (!isPaperPath(path)) throw new Error(`Not a path in the paper’s folder: ${path}`);
		return this.fs.read(`papers/${id}/${path}`);
	}

	/**
	 * Every paper's notes as text (from notes.md), lower-cased, for library search. Papers
	 * without notes are left out. Desktop reads them all in one call.
	 */
	async readAllNotesText(): Promise<Map<string, string>> {
		const files = this.fs.readEach
			? await this.fs.readEach('papers', 'notes.md')
			: await Promise.all(
					(await this.fs.list('papers'))
						.filter((e) => e.dir && !e.name.startsWith('.'))
						.map(async ({ name }) => {
							const bytes = await this.fs.read(`papers/${name}/notes.md`).catch(() => null);
							return { name, text: bytes ? dec.decode(bytes) : null, error: false };
						})
				);
		const out = new Map<string, string>();
		for (const { name, text } of files) {
			const body = text?.replace(/^<!--[\s\S]*?-->\s*/, '').trim();
			if (body) out.set(name, body.toLowerCase());
		}
		return out;
	}

	readPdf(id: string) {
		return this.fs.read(`papers/${id}/paper.pdf`);
	}

	async savePdf(id: string, bytes: Uint8Array) {
		if (!isPdf(bytes)) throw new Error('Refusing to save: not a PDF');
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

/**
 * A function patch sees the paper normalized (as the app shows it), and the
 * paper's id is never written into its own paper.json (it's the folder name).
 */
function prepare(id: string, patch: Patch<Paper>): Patch<Paper> {
	return typeof patch === 'function' ? (cur) => ({ ...patch(normalizePaper(id, cur)), id: undefined }) : { ...patch, id: undefined };
}
