// What each device remembers about papers (when it last opened one, where it was
// reading) lives in that device's own file, `.xivly/devices/<device>.json`:
// two devices syncing the library never write the same file for it, so it
// never conflicts. Reading merges every device's file: the latest wins, so a
// paper still reopens where it was last read, on whichever device.
import type { LibraryFs } from './platform';

export interface Visit {
	/** ISO timestamp of the last time it was opened. */
	opened?: string;
	/** Reading position (fractional page). */
	position?: number;
	/** When this record last changed (the newest position wins). */
	at: string;
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

function parseVisits(raw: unknown): Map<string, Visit> {
	const out = new Map<string, Visit>();
	const papers = isObject(raw) && isObject(raw.papers) ? raw.papers : {};
	for (const [id, v] of Object.entries(papers)) {
		if (!isObject(v) || typeof v.at !== 'string') continue;
		const position = typeof v.position === 'number' && Number.isFinite(v.position) ? v.position : undefined;
		out.set(id, { at: v.at, opened: typeof v.opened === 'string' ? v.opened : undefined, position });
	}
	return out;
}

/** Many devices' visits as one: the latest opening, and the position recorded last. */
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
				position: (newer ? (v.position ?? cur.position) : (cur.position ?? v.position))
			});
		}
	return out;
}

export class DeviceStore {
	/** This device's own record (what it writes). */
	#mine = new Map<string, Visit>();
	#loaded = false;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#writing: Promise<void> = Promise.resolve();
	#dirty = false;
	/** Papers removed since the last write (kept out of the merge with the file). */
	#forgotten = new Set<string>();

	constructor(
		readonly fs: LibraryFs,
		readonly id: string,
		private readonly delay = 1000
	) {}

	get #path() {
		return `${DIR}/${this.id}.json`;
	}

	async #read(path: string): Promise<Map<string, Visit>> {
		const bytes = await this.fs.read(path).catch(() => null);
		if (!bytes) return new Map();
		try {
			return parseVisits(JSON.parse(dec.decode(bytes)));
		} catch {
			return new Map();
		}
	}

	/** Every device's visits, merged (this device's latest ones included, saved or not). */
	async readAll(): Promise<Map<string, Visit>> {
		const names = (await this.fs.exists(DIR)) ? (await this.fs.list(DIR)).filter((e) => !e.dir && e.name.endsWith('.json')).map((e) => e.name) : [];
		const files = await Promise.all(names.filter((n) => n !== `${this.id}.json`).map((n) => this.#read(`${DIR}/${n}`)));
		await this.#load();
		return mergeVisits([...files, this.#mine]);
	}

	async #load() {
		if (this.#loaded) return;
		const stored = await this.#read(this.#path);
		// Kept over what's on disk: notes made before it was read.
		for (const [id, v] of stored) if (!this.#mine.has(id)) this.#mine.set(id, v);
		this.#loaded = true;
	}

	/** This device opened a paper, or read on to a position: saved a moment later. */
	note(paperId: string, change: { opened?: string; position?: number }) {
		const cur = this.#mine.get(paperId);
		this.#mine.set(paperId, { ...cur, ...change, at: new Date().toISOString() });
		this.#dirty = true;
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => void this.flush(), this.delay);
	}

	/** Forget a paper (it was removed from the library). */
	forget(paperId: string) {
		this.#mine.delete(paperId);
		this.#forgotten.add(paperId);
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
				const merged = mergeVisits([await this.#read(this.#path), this.#mine]);
				for (const id of this.#forgotten) merged.delete(id);
				this.#forgotten.clear();
				this.#mine = merged;
				await this.fs.write(this.#path, enc.encode(JSON.stringify({ version: 1, device: this.id, updated: new Date().toISOString(), papers: Object.fromEntries(merged) }, null, 1) + '\n'));
			});
		});
		return this.#writing;
	}
}
