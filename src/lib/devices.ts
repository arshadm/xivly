// What each device remembers about papers (when it last opened one, where it was
// reading, how it was zoomed) and notebooks (the paper beside the text, and how each
// paper read there was shown) lives in that device's own file, `.xivly/devices/<device>.json`:
// two devices syncing the library never write the same file for it, so it
// never conflicts. Reading merges every device's file: the latest wins, so a
// paper or notebook still reopens as it was left, on whichever device.
import type { ZoomMode } from 'svelte-pdf-mini';
import type { LibraryFs } from './platform';

/** How a paper's pages were shown: where (a fractional page), the zoom, and how far across (0–1) when wider than the window. */
export interface PageView {
	position?: number;
	mode: ZoomMode;
	zoom: number;
	cross?: number;
}

export interface Visit {
	/** ISO timestamp of the last time it was opened. */
	opened?: string;
	/** Reading position (fractional page). */
	position?: number;
	/** The zoom it was read at (its position is `position`). */
	view?: PageView;
	/** When this record last changed (the newest position wins). */
	at: string;
}

/** A notebook window as it was left. */
export interface NotebookVisit {
	/** The paper beside the text. */
	paperId?: string;
	/** How each paper read beside it was shown. */
	papers: Record<string, PageView>;
	at: string;
}

interface DeviceFile {
	papers: Map<string, Visit>;
	notebooks: Map<string, NotebookVisit>;
}

const DIR = '.xivly/devices';
const enc = new TextEncoder();
const dec = new TextDecoder();
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** This device's id: made once, kept apart from the settings (resetting them keeps it). */
export function deviceId(storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): string {
	try {
		const known = storage?.getItem('xivly:device');
		if (known && /^[\w-]{6,64}$/.test(known)) return known;
		const id = crypto.randomUUID();
		storage?.setItem('xivly:device', id);
		return id;
	} catch {
		return 'this-device';
	}
}

const MODES: readonly unknown[] = ['manual', 'auto', 'page-width', 'page-height', 'page-fit'];
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function parsePageView(raw: unknown): PageView | undefined {
	if (!isObject(raw)) return undefined;
	const zoom = num(raw.zoom);
	if (!MODES.includes(raw.mode) || !zoom || zoom <= 0) return undefined;
	const cross = num(raw.cross);
	return { position: num(raw.position), mode: raw.mode as ZoomMode, zoom, cross: cross === undefined ? undefined : Math.min(1, Math.max(0, cross)) };
}

function parseFile(raw: unknown): DeviceFile {
	const papers = new Map<string, Visit>();
	for (const [id, v] of Object.entries(isObject(raw) && isObject(raw.papers) ? raw.papers : {})) {
		if (!isObject(v) || typeof v.at !== 'string') continue;
		papers.set(id, { at: v.at, opened: typeof v.opened === 'string' ? v.opened : undefined, position: num(v.position), view: parsePageView(v.view) });
	}
	const notebooks = new Map<string, NotebookVisit>();
	for (const [id, v] of Object.entries(isObject(raw) && isObject(raw.notebooks) ? raw.notebooks : {})) {
		if (!isObject(v) || typeof v.at !== 'string') continue;
		const views = Object.entries(isObject(v.papers) ? v.papers : {}).flatMap(([paperId, pv]) => {
			const view = parsePageView(pv);
			return view ? [[paperId, view] as const] : [];
		});
		notebooks.set(id, { at: v.at, paperId: typeof v.paperId === 'string' ? v.paperId : undefined, papers: Object.fromEntries(views) });
	}
	return { papers, notebooks };
}

/** Many devices' visits as one: the latest opening, and the position (and zoom) recorded last. */
export function mergeVisits(all: Map<string, Visit>[]): Map<string, Visit> {
	const out = new Map<string, Visit>();
	for (const visits of all)
		for (const [id, v] of visits) {
			const cur = out.get(id);
			if (!cur) {
				out.set(id, { ...v });
				continue;
			}
			const newer = v.at > cur.at;
			out.set(id, {
				at: newer ? v.at : cur.at,
				opened: [cur.opened, v.opened].filter(Boolean).sort().at(-1),
				position: newer ? (v.position ?? cur.position) : (cur.position ?? v.position),
				view: newer ? (v.view ?? cur.view) : (cur.view ?? v.view)
			});
		}
	return out;
}

/** Many devices' notebook windows as one: the one left last. */
function mergeNotebooks(all: Map<string, NotebookVisit>[]): Map<string, NotebookVisit> {
	const out = new Map<string, NotebookVisit>();
	for (const visits of all) for (const [id, v] of visits) if (!out.has(id) || v.at > out.get(id)!.at) out.set(id, v);
	return out;
}

export class DeviceStore {
	/** This device's own record (what it writes). */
	#mine = new Map<string, Visit>();
	#notebooks = new Map<string, NotebookVisit>();
	#loaded = false;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#writing: Promise<void> = Promise.resolve();
	#dirty = false;
	/** Papers and notebooks removed since the last write (kept out of the merge with the file). */
	#forgotten = new Set<string>();
	#forgottenNotebooks = new Set<string>();

	constructor(
		readonly fs: LibraryFs,
		readonly id: string,
		private readonly delay = 1000
	) {}

	get #path() {
		return `${DIR}/${this.id}.json`;
	}

	async #read(path: string): Promise<DeviceFile> {
		const bytes = await this.fs.read(path).catch(() => null);
		if (!bytes) return { papers: new Map(), notebooks: new Map() };
		try {
			return parseFile(JSON.parse(dec.decode(bytes)));
		} catch {
			return { papers: new Map(), notebooks: new Map() };
		}
	}

	/** The other devices' files. */
	async #others(): Promise<DeviceFile[]> {
		const names = (await this.fs.exists(DIR)) ? (await this.fs.list(DIR)).filter((e) => !e.dir && e.name.endsWith('.json')).map((e) => e.name) : [];
		return Promise.all(names.filter((n) => n !== `${this.id}.json`).map((n) => this.#read(`${DIR}/${n}`)));
	}

	/** Every device's visits, merged (this device's latest ones included, saved or not). */
	async readAll(): Promise<Map<string, Visit>> {
		const files = await this.#others();
		await this.#load();
		return mergeVisits([...files.map((f) => f.papers), this.#mine]);
	}

	/** A notebook window as it was left last, on any device. */
	async notebook(id: string): Promise<NotebookVisit | undefined> {
		const files = await this.#others();
		await this.#load();
		return mergeNotebooks([...files.map((f) => f.notebooks), this.#notebooks]).get(id);
	}

	async #load() {
		if (this.#loaded) return;
		const stored = await this.#read(this.#path);
		// Kept over what's on disk: notes made before it was read.
		for (const [id, v] of stored.papers) if (!this.#mine.has(id)) this.#mine.set(id, v);
		for (const [id, v] of stored.notebooks) if (!this.#notebooks.has(id)) this.#notebooks.set(id, v);
		this.#loaded = true;
	}

	/** This device opened a paper, or read on to a position: saved a moment later. */
	note(paperId: string, change: { opened?: string; position?: number; view?: PageView }) {
		const cur = this.#mine.get(paperId);
		this.#mine.set(paperId, { ...cur, ...change, at: new Date().toISOString() });
		this.#later();
	}

	/**
	 * A notebook window shows a paper beside the text (and, given, how it's shown now).
	 * Resolves once it's noted (the record on disk read first, so its other papers are kept).
	 */
	async noteNotebook(id: string, paperId: string, view?: PageView) {
		await this.#load();
		const cur = this.#notebooks.get(id) ?? (await this.notebook(id));
		const { [paperId]: was, ...others } = cur?.papers ?? {};
		const kept = Object.entries({ ...others, ...((view ?? was) && { [paperId]: view ?? was }) }).slice(-30);
		this.#notebooks.set(id, { paperId, papers: Object.fromEntries(kept), at: new Date().toISOString() });
		this.#later();
	}

	/** Forget a paper (it was removed from the library). */
	forget(paperId: string) {
		this.#mine.delete(paperId);
		this.#forgotten.add(paperId);
		this.#later();
	}

	/** Forget a notebook (deleted). */
	forgetNotebook(id: string) {
		this.#notebooks.delete(id);
		this.#forgottenNotebooks.add(id);
		this.#later();
	}

	#later() {
		this.#dirty = true;
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => void this.flush(), this.delay);
	}

	get dirty() {
		return this.#dirty;
	}

	/** Write this device's file now (other windows of this device merge into it). */
	flush(): Promise<void> {
		clearTimeout(this.#timer);
		this.#writing = this.#writing.then(async () => {
			if (!this.#dirty) return;
			this.#dirty = false;
			await this.#load();
			await navigator.locks.request(`xivly:${this.#path}`, async () => {
				// Another window of this device may have written meanwhile: the newest record per paper wins.
				const disk = await this.#read(this.#path);
				const merged = mergeVisits([disk.papers, this.#mine]);
				for (const id of this.#forgotten) merged.delete(id);
				this.#forgotten.clear();
				this.#mine = merged;
				const notebooks = mergeNotebooks([disk.notebooks, this.#notebooks]);
				for (const id of this.#forgottenNotebooks) notebooks.delete(id);
				this.#forgottenNotebooks.clear();
				this.#notebooks = notebooks;
				const file = { version: 1, device: this.id, updated: new Date().toISOString(), papers: Object.fromEntries(merged), ...(notebooks.size && { notebooks: Object.fromEntries(notebooks) }) };
				await this.fs.write(this.#path, enc.encode(JSON.stringify(file, null, 1) + '\n'));
			});
		});
		return this.#writing;
	}
}
