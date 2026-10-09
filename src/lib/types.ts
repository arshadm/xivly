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
