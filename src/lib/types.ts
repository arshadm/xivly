// Schema of the files in a library folder. Rust treats them as opaque JSON
// and only merges patches, so this file is the source of truth.

export type ColorName = 'sage' | 'lavender' | 'sand' | 'sky' | 'clay' | 'rose' | 'mint' | 'stone';

export interface Category {
	id: string;
	name: string;
	/** Key of svelte-pdf-mini's `paperColors` matte palette. */
	color: ColorName;
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
	links?: PaperLinks;
	category?: string;
	tags?: string[];
	/** ISO timestamp of import. */
	added: string;
	/** Last opened, used for "Recent". */
	opened?: string;
	/** Reading position (fractional page) restored on open. */
	position?: number;
	[extra: string]: unknown;
}

export type PaperPatch = { [K in keyof Paper]?: Paper[K] | null };
