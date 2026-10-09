// Schema of the files in a library folder. Rust treats them as opaque JSON
// and only merges patches, so this file is the source of truth.

export type ColorName = 'sage' | 'lavender' | 'sand' | 'sky' | 'clay' | 'rose' | 'mint' | 'stone';
/** A palette color, or any color picked by the user (`#rrggbb`). */
export type CategoryColor = ColorName | `#${string}`;

export interface Category {
	id: string;
	name: string;
	/** Key of svelte-pdf-mini's `paperColors` matte palette, or a `#rrggbb` color. */
	color: CategoryColor;
}

/** `.xivly/library.json` */
export interface LibraryFile {
	version: number;
	categories: Category[];
	tags: string[];
}

export interface PaperLinks {
	project?: string;
	github?: string[];
	huggingface?: string[];
	other?: string[];
}

/** Hugging Face paper page data (arXiv papers), refreshed from time to time. */
export interface HfLinks {
	/** Absent: no Hugging Face page for this paper. */
	page?: string;
	/** The paper's title and authors as Hugging Face (arXiv) has them. */
	title?: string;
	authors?: string[];
	upvotes?: number;
	project?: string;
	github?: string;
	githubStars?: number;
	models?: { total: number; top: string[] };
	datasets?: { total: number; top: string[] };
	spaces?: { total: number; top: string[] };
	/** ISO timestamp of the last lookup. */
	checked?: string;
}

/** `papers/<id>/paper.json` (plus `id`, the folder name). */
export interface Paper {
	id: string;
	title: string;
	authors?: string[];
	year?: number;
	/** ISO date (YYYY or YYYY-MM or YYYY-MM-DD). */
	date?: string;
	abstract?: string;
	doi?: string;
	arxiv?: string;
	/** SHA-256 of the PDF as imported (spots the same file imported again). */
	sha256?: string;
	links?: PaperLinks;
	category?: string;
	tags?: string[];
	/** ISO timestamp of import. */
	added: string;
	/** Last opened, used for "Recent". */
	opened?: string;
	/** Added by the example library (Settings › Library › Example papers removes these). */
	starter?: boolean;
	/** Hugging Face paper page, models / datasets / Spaces citing it. */
	hf?: HfLinks;
	/** Added by the example library (Settings › Library can remove them all). */
	sample?: boolean;
	/** ISO timestamp of when it was marked read (absent: unread). */
	read?: string;
	/** Reading position (fractional page) restored on open. */
	position?: number;
	/** Named places in the paper, in page order. */
	bookmarks?: Bookmark[];
	[extra: string]: unknown;
}

export type PaperPatch = { [K in keyof Paper]?: Paper[K] | null };

/**
 * A place in a paper (bookmarks, links in notes, mind-map nodes, page
 * citations). Helpers: `#lib/anchor.ts`.
 */
export interface PaperAnchor {
	/** Fractional page, as `ViewerState.position`: 3.42 = 42% into page 3. */
	page: number;
	label?: string;
}

/** A named place in a paper (`paper.json` › `bookmarks`). */
export interface Bookmark extends PaperAnchor {
	id: string;
	name: string;
	/** ISO timestamp. */
	created: string;
}

/** A rich-text document (TipTap / ProseMirror JSON). */
export interface NotesDoc {
	type: 'doc';
	content?: unknown[];
	[extra: string]: unknown;
}

/** `papers/<id>/notes.json`: the paper's notes (written by the notes pane). */
export interface NotesFile {
	version: number;
	doc: NotesDoc;
	/** ISO timestamp of the last save. */
	updated?: string;
	[extra: string]: unknown;
}

// ── arXiv feed (`.xivly/feed/`) ──────────────────────────────────────────

/** `.xivly/feed/config.json`: what the feed looks for and how papers are scored. */
export interface FeedConfig {
	version: number;
	/** arXiv categories kept (e.g. "cs.LG"); their archives ("cs") are fetched. */
	categories: string[];
	/** Topic name → terms; a paper matching any term of a topic gets that topic. */
	topics: Record<string, string[]>;
	/** Where terms are matched: the abstract (default), the title, or both. */
	searchField: 'abs' | 'title' | 'all';
	/** Who the papers are scored for (sent to Claude with every batch). */
	profile: string;
	/** What P1–P5 mean ("1" … "5"). */
	rubric: Record<string, string>;
	/** Claude model for scoring ("sonnet", "opus", …). */
	model: string;
	batchSize: number;
	[extra: string]: unknown;
}

/** One paper of the feed, in `.xivly/feed/papers/<YYYY-MM>.json`. */
export interface FeedPaper {
	/** arXiv id without version, e.g. "2610.01234". */
	id: string;
	/** e.g. "v2". */
	version?: string;
	title: string;
	authors: string[];
	abstract: string;
	categories: string[];
	/** Topics of the config it matched (merged across checks). */
	topics: string[];
	/** Announcement day, YYYY-MM-DD (the month file it lives in). */
	published: string;
	/** P1 (read now) … P5 (not relevant); absent until scored. */
	priority?: number;
	/** Why that priority, in a sentence. */
	rationale?: string;
	/** ISO timestamp of scoring, and by which model. */
	scoredAt?: string;
	scorer?: string;
	/** ISO timestamp of the check that found it. */
	firstSeen: string;
	/** ISO timestamp when dismissed (hidden from the feed, kept so it never comes back). */
	dismissed?: string;
	/** Id of the library paper it was added as. */
	added?: string;
	[extra: string]: unknown;
}

/** A check of the feed (`state.json` keeps the recent ones). */
export interface FeedRun {
	started: string;
	finished?: string;
	/** The window checked, ISO timestamps. */
	from: string;
	to: string;
	found: number;
	new: number;
	scored: number;
	status: 'running' | 'ok' | 'failed' | 'cancelled';
	error?: string;
}

/** `.xivly/feed/state.json`. */
export interface FeedState {
	version: number;
	/** End of the last successful check's window: the next one starts there. */
	lastTo?: string;
	runs: FeedRun[];
	/** The last refresh from arxiv_fetch: when, and how many papers it brought that the feed didn't have. */
	refreshed?: { at: string; added: number };
	[extra: string]: unknown;
}
