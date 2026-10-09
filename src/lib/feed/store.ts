// The arXiv feed in the library folder (`.xivly/feed/`): config, state and the
// papers by announcement month. Every write is a read-merge-write under the
// file's lock (shared by every window, like Repo's), so a check running in one
// window never loses a dismissal made in another.
import type { LibraryFs } from '#lib/platform/index.js';
import type { FeedConfig, FeedPaper, FeedState } from '#lib/types.js';
import { FEED_VERSION, mergeFeedPaper, monthOf, normalizeFeedConfig, normalizeFeedPaper, normalizeFeedState } from './model';

type Json = Record<string, unknown>;
const enc = new TextEncoder();
const dec = new TextDecoder();

const DIR = '.xivly/feed';
const CONFIG = `${DIR}/config.json`;
const STATE = `${DIR}/state.json`;
const monthPath = (month: string) => `${DIR}/papers/${month}.json`;
const MONTH = /^\d{4}-\d{2}$/;

export class FeedStore {
	constructor(readonly fs: LibraryFs) {}

	#lock<T>(key: string, fn: () => Promise<T>): Promise<T> {
		return navigator.locks.request(`xivly:${key}`, fn);
	}

	/** null when missing; throws when unreadable (saving over it would lose it). */
	async #read(path: string): Promise<Json | null> {
		const bytes = await this.fs.read(path);
		if (!bytes) return null;
		try {
			const v = JSON.parse(dec.decode(bytes));
			if (v && typeof v === 'object' && !Array.isArray(v)) return v as Json;
		} catch {
			// below
		}
		throw new Error(`${path} is not valid JSON`);
	}

	#write(path: string, value: unknown) {
		return this.fs.write(path, enc.encode(JSON.stringify(value, null, 2) + '\n'));
	}

	// ── Config and state ──────────────────────────────────────────────────

	async readConfig(): Promise<FeedConfig> {
		return normalizeFeedConfig(await this.#read(CONFIG));
	}

	/** Replace the config (fields the app doesn't know, added by hand, are kept). */
	writeConfig(config: FeedConfig) {
		return this.#lock(CONFIG, async () => this.#write(CONFIG, { ...((await this.#read(CONFIG)) ?? {}), ...config, version: FEED_VERSION }));
	}

	async readState(): Promise<FeedState> {
		return normalizeFeedState(await this.#read(STATE));
	}

	/** Change the state from what's on disk now. */
	updateState(change: (state: FeedState) => FeedState): Promise<FeedState> {
		return this.#lock(STATE, async () => {
			const next = change(normalizeFeedState(await this.#read(STATE)));
			await this.#write(STATE, next);
			return next;
		});
	}

	// ── Papers ────────────────────────────────────────────────────────────

	/** Months with papers, newest first. */
	async months(): Promise<string[]> {
		if (!(await this.fs.exists(`${DIR}/papers`))) return [];
		const names = (await this.fs.list(`${DIR}/papers`)).filter((e) => !e.dir && e.name.endsWith('.json')).map((e) => e.name.slice(0, -5));
		return names.filter((m) => MONTH.test(m)).sort().reverse();
	}

	/** A month file's entries as stored (raw), by id. */
	async #rawMonth(month: string): Promise<Record<string, unknown>> {
		const file = await this.#read(monthPath(month));
		const papers = file?.papers;
		return papers && typeof papers === 'object' && !Array.isArray(papers) ? (papers as Record<string, unknown>) : {};
	}

	async readMonth(month: string): Promise<FeedPaper[]> {
		const raw = await this.#rawMonth(month);
		return Object.values(raw)
			.map(normalizeFeedPaper)
			.filter((p): p is FeedPaper => !!p);
	}

	/** Every paper of the feed (dismissed ones too), newest month first. */
	async readAll(): Promise<FeedPaper[]> {
		const months = await this.months();
		return (await Promise.all(months.map((m) => this.readMonth(m)))).flat();
	}

	/**
	 * Add a check's papers: new ones as they are, known ones merged (their score,
	 * dismissal and library link kept). Returns the merged papers, and how many were new.
	 */
	async upsert(papers: FeedPaper[]): Promise<{ papers: FeedPaper[]; added: number }> {
		const byMonth = new Map<string, FeedPaper[]>();
		for (const p of papers) byMonth.set(monthOf(p), [...(byMonth.get(monthOf(p)) ?? []), p]);
		let added = 0;
		const out: FeedPaper[] = [];
		for (const [month, list] of byMonth) {
			await this.#lock(monthPath(month), async () => {
				const raw = await this.#rawMonth(month);
				const next: Record<string, unknown> = { ...raw };
				for (const p of list) {
					const stored = normalizeFeedPaper(raw[p.id]) ?? undefined;
					if (!stored) added++;
					const merged = mergeFeedPaper(stored, p);
					next[p.id] = merged;
					out.push(merged);
				}
				await this.#write(monthPath(month), { version: FEED_VERSION, papers: next });
			});
		}
		return { papers: out, added };
	}

	/** Change one paper (dismiss, score, link to the library) from what's on disk; null if it's gone. */
	update(paper: Pick<FeedPaper, 'id' | 'published'>, patch: Partial<FeedPaper> | ((current: FeedPaper) => Partial<FeedPaper>)): Promise<FeedPaper | null> {
		const path = monthPath(monthOf(paper));
		return this.#lock(path, async () => {
			const raw = await this.#rawMonth(monthOf(paper));
			const current = normalizeFeedPaper(raw[paper.id]);
			if (!current) return null;
			const changes = typeof patch === 'function' ? patch(current) : patch;
			const next: Record<string, unknown> = { ...current, ...changes };
			// undefined removes a field (restore: no more `dismissed`).
			for (const [k, v] of Object.entries(changes)) if (v === undefined) delete next[k];
			await this.#write(path, { version: FEED_VERSION, papers: { ...raw, [paper.id]: next } });
			return next as FeedPaper;
		});
	}
}
