import { paperColors, type PaperColor } from 'svelte-pdf-mini';
import { toast } from './components/Toasts.svelte';
import { forgetCover } from './covers';
import { parseArxiv } from './arxiv';
import { extractMetadata, tidyTitle } from './extract';
import { fetchHfPaper } from './huggingface';
import { platform } from './platform';
import { merge, Repo, slugify } from './repo';
import { recentWindows, settings, type SortKey } from './settings.svelte';
import type { Category, CategoryColor, LibraryFile, Paper, PaperPatch } from './types';

/** Always listed; hidden by default, so tagging a paper `archived` archives it. */
export const ARCHIVED = 'archived';
type TagMode = 'in' | 'out';

export type View =
	| { kind: 'all' }
	| { kind: 'recent' }
	| { kind: 'uncategorized' }
	| { kind: 'category'; id: string };

type Status = 'loading' | 'none' | 'needs-permission' | 'ready' | 'error';

const stone = paperColors.find((c) => c.name === 'stone')!;

/** Mix two `#rrggbb` colors (t = share of `b`). */
function mix(a: string, b: string, t: number) {
	const ch = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
	return '#' + [0, 1, 2].map((i) => Math.round(ch(a, i) * (1 - t) + ch(b, i) * t).toString(16).padStart(2, '0')).join('');
}

/** A category's palette entry; a custom `#rrggbb` gets matte shades made like the palette's. */
export function categoryColor(color: CategoryColor | undefined): PaperColor {
	if (color && /^#[0-9a-f]{6}$/i.test(color)) return { name: color, accent: color, light: mix(color, '#ffffff', 0.84), dark: mix(color, '#151413', 0.86) };
	return paperColors.find((c) => c.name === color) ?? stone;
}

class Library {
	status = $state<Status>('loading');
	/** Folder name, for display. */
	name = $state('');
	repo = $state.raw<Repo | null>(null);

	file = $state<LibraryFile>({ version: 1, categories: [], tags: [] });
	papers = $state<Paper[]>([]);
	importing = $state(0);
	error = $state<string | null>(null);

	view = $state<View>({ kind: 'all' });
	/** Tag filter: 'in' shows only papers with the tag, 'out' hides them. Archived papers start hidden. */
	tagFilter = $state<Record<string, TagMode>>({ [ARCHIVED]: 'out' });
	/** Tags shown only ('in'), e.g. given to papers added while filtering. */
	includedTags = $derived(Object.keys(this.tagFilter).filter((t) => this.tagFilter[t] === 'in'));
	query = $state('');

	categories = $derived(this.file.categories);

	/** Every tag in use, plus the ones declared in library.json; `archived` always, last. */
	allTags = $derived([...new Set([...this.file.tags, ...this.papers.flatMap((p) => p.tags ?? [])])].filter((t) => t !== ARCHIVED).sort().concat(ARCHIVED));

	filtered = $derived.by(() => {
		const q = this.query.trim().toLowerCase();
		const v = this.view;
		const recentSince = Date.now() - recentWindows[settings.values.recentWindow] * 864e5;
		const list = this.papers.filter((p) => {
			if (v.kind === 'category' && p.category !== v.id) return false;
			// Includes ids missing from library.json (deleted elsewhere, set by an agent).
			if (v.kind === 'uncategorized' && this.category(p.category)) return false;
			if (v.kind === 'recent' && !(p.opened && Date.parse(p.opened) >= recentSince)) return false;
			for (const [t, mode] of Object.entries(this.tagFilter)) if (!!p.tags?.includes(t) !== (mode === 'in')) return false;
			const rf = settings.values.readFilter;
			if (rf !== 'all' && !!p.read !== (rf === 'read')) return false;
			return !q || haystack(p).includes(q);
		});
		// Recent is always most recently opened first.
		const recent = v.kind === 'recent';
		const key = sortKeys[recent ? 'opened' : settings.values.sortBy] ?? sortKeys.added;
		const dir = recent || settings.values.sortDesc ? -1 : 1;
		// Papers without the value (never opened, no date…) go last either way.
		return list.toSorted((a, b) => {
			const x = key(a), y = key(b);
			if (!x || !y) return x ? -1 : y ? 1 : a.title.localeCompare(b.title);
			return dir * x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' }) || a.title.localeCompare(b.title);
		});
	});

	/** Mark read (now) or unread. */
	setRead(id: string, read: boolean) {
		return this.update(id, { read: read ? new Date().toISOString() : null });
	}

	/** Flip read / unread (buttons and menus; a failure is shown, not thrown). */
	toggleRead(p: Pick<Paper, 'id' | 'read'>) {
		return this.setRead(p.id, !p.read).catch((e) => toast(String(e), 'error'));
	}

	// ── Opening a library ────────────────────────────────────────────────

	async init() {
		try {
			const r = await platform.restore();
			if (!r) this.status = 'none';
			else if ('needsPermission' in r) {
				this.name = r.needsPermission;
				this.status = 'needs-permission';
			} else await this.#open(r);
		} catch (e) {
			// e.g. the library folder was moved or unmounted: let the user pick again.
			console.error(e);
			this.error = String(e);
			this.status = 'error';
		}
	}

	async choose() {
		try {
			const r = await platform.pick();
			if (r) await this.#open(r);
		} catch (e) {
			this.error = String(e);
			this.status = 'error';
		}
	}

	/** Web: re-grant folder access after a reload (needs a click). */
	async reconnect() {
		try {
			const r = await platform.reconnect();
			if (r) await this.#open(r);
		} catch (e) {
			this.error = String(e);
			this.status = 'error';
		}
	}

	async #open({ fs, name }: { fs: Repo['fs']; name: string }) {
		const repo = new Repo(fs, platform);
		await repo.init();
		this.repo = repo;
		this.name = name;
		this.view = { kind: 'all' };
		this.tagFilter = { [ARCHIVED]: 'out' };
		await this.reload();
		this.status = 'ready';
	}

	async reload() {
		if (!this.repo) return;
		try {
			const [file, papers] = await Promise.all([this.repo.readLibrary(), this.repo.listPapers()]);
			// Shown tidied; written back only if the paper is edited.
			[this.file, this.papers] = [file, papers.map((p) => ({ ...p, title: tidyTitle(p.title) }))];
			this.error = null;
		} catch (e) {
			this.error = String(e);
		}
	}

	/** A reader window's refresh: its paper and the categories, not the whole library. */
	async reloadPaper(id: string) {
		if (!this.repo) return;
		try {
			const [file, paper] = await Promise.all([this.repo.readLibrary(), this.repo.readPaper(id)]);
			this.file = file;
			this.papers = paper ? [...this.papers.filter((p) => p.id !== id), { ...paper, title: tidyTitle(paper.title) }] : this.papers.filter((p) => p.id !== id);
		} catch (e) {
			this.error = String(e);
		}
	}

	get(id: string) {
		return this.papers.find((p) => p.id === id);
	}

	category(id?: string): Category | undefined {
		return this.file.categories.find((c) => c.id === id);
	}

	/** Matte color for a paper (its category's), used for covers and the reader. */
	color(paper?: Pick<Paper, 'category'>): PaperColor {
		return categoryColor(this.category(paper?.category)?.color);
	}

	// ── Papers ────────────────────────────────────────────────────────────

	/** Native file picker (PDFs); works the same in Tauri's webview and browsers. */
	pickFiles(): Promise<File[]> {
		return new Promise((resolve) => {
			const input = document.createElement('input');
			input.type = 'file';
			input.accept = 'application/pdf,.pdf';
			input.multiple = true;
			input.onchange = () => resolve([...(input.files ?? [])]);
			input.oncancel = () => resolve([]);
			input.click();
		});
	}

	/** Extract metadata, write the papers, then fire `paper-added`; returns their ids. */
	async import(files: File[], hints: { arxiv?: string } = {}): Promise<string[]> {
		const repo = this.repo;
		if (!repo) return [];
		const category = this.view.kind === 'category' ? this.view.id : undefined;
		const tags = this.includedTags.length ? [...this.includedTags] : undefined;
		const pdfs = files.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
		const added = await Promise.all(
			pdfs.map(async (file) => {
				this.importing++;
				try {
					const bytes = new Uint8Array(await file.arrayBuffer());
					let meta: PaperPatch = { title: file.name.replace(/\.pdf$/i, '') };
					try {
						meta = { ...meta, ...(await extractMetadata(bytes, { filename: file.name, arxiv: hints.arxiv })) };
					} catch (e) {
						console.warn('metadata extraction failed', e);
					}
					return await repo.add(bytes, { ...meta, category, tags });
				} catch (e) {
					this.error = String(e);
				} finally {
					this.importing--;
				}
			})
		);
		await this.reload();
		const papers = added.filter((p): p is Paper => !!p);
		// Links from Hugging Face, in the background.
		for (const p of papers) if (p.arxiv) void this.refreshHf(p.id).catch(() => {});
		return papers.map((p) => p.id);
	}

	/**
	 * Add an arXiv paper from a link (abs, pdf, html…) or id. Returns its id,
	 * the existing one when it's already in the library.
	 */
	async importArxiv(input: string): Promise<{ id: string; existed: boolean }> {
		const ref = parseArxiv(input);
		if (!ref) throw new Error('Not an arXiv link or id');
		const existing = this.papers.find((p) => p.arxiv === ref.id);
		if (existing) return { id: existing.id, existed: true };
		this.importing++;
		let file: File;
		try {
			const res = await fetch(`https://arxiv.org/pdf/${ref.id}${ref.version ?? ''}`);
			if (!res.ok) throw new Error(`arXiv ${ref.id}: HTTP ${res.status}`);
			file = new File([await res.blob()], `${ref.id.replace('/', '_')}.pdf`, { type: 'application/pdf' });
		} finally {
			this.importing--;
		}
		const [id] = await this.import([file], { arxiv: ref.id });
		if (!id) throw new Error(`Could not add arXiv ${ref.id}`);
		return { id, existed: false };
	}

	/**
	 * Hugging Face paper page, project page, GitHub and citing models /
	 * datasets / Spaces (arXiv papers). Skipped when looked up this week.
	 */
	async refreshHf(id: string, { force = false } = {}) {
		const p = this.get(id);
		if (!p?.arxiv) return;
		if (!force && p.hf?.checked && Date.now() - Date.parse(p.hf.checked) < HF_REFRESH_MS) return;
		const hf = await fetchHfPaper(p.arxiv);
		const links = { ...p.links };
		if (hf?.project && !links.project) links.project = hf.project;
		const gh = hf?.github?.replace(/\/+$/, '');
		if (gh && !links.github?.some((u) => u.replace(/\/+$/, '').toLowerCase() === gh.toLowerCase())) links.github = [gh, ...(links.github ?? [])];
		// Kept on the paper itself (title, authors); the rest under `hf`.
		const { title, authors, ...rest } = hf ?? {};
		const checked = new Date().toISOString();
		const patch = { links, title: betterTitle(p.title, title), authors: betterAuthors(p.authors, authors) };
		const { checked: _, ...before } = p.hf ?? {};
		const same = JSON.stringify(rest) === JSON.stringify(before) && JSON.stringify(patch) === JSON.stringify({ links: { ...p.links }, title: p.title, authors: p.authors });
		// Nothing new: just the date of the lookup (no `paper-updated` hook).
		if (same) await this.touch(id, { hf: { ...rest, checked } });
		else await this.update(id, { ...patch, hf: { ...rest, checked } });
	}

	/** Optimistic: the UI (and the next edit) sees the change before disk does. */
	async update(id: string, patch: PaperPatch) {
		const i = this.papers.findIndex((p) => p.id === id);
		const before = i >= 0 ? this.papers[i] : undefined;
		if (before) this.papers[i] = merge(before, patch as Record<string, unknown>);
		try {
			const updated = await this.repo!.update(id, patch);
			const j = this.papers.findIndex((p) => p.id === id);
			if (j >= 0) this.papers[j] = { ...updated, title: tidyTitle(updated.title) };
			return updated;
		} catch (e) {
			const j = this.papers.findIndex((p) => p.id === id);
			if (before && j >= 0) this.papers[j] = before;
			throw e;
		}
	}

	/** Bookkeeping (last opened, position): no hook, no reload. */
	touch(id: string, patch: PaperPatch) {
		const p = this.get(id);
		if (p) Object.assign(p, patch);
		return this.repo!.touch(id, patch);
	}

	async remove(id: string) {
		await this.repo!.remove(id);
		forgetCover(id);
		this.papers = this.papers.filter((p) => p.id !== id);
	}

	/** Re-read the metadata from the PDF, then from Hugging Face (arXiv papers); keeps category and tags. */
	async refreshMetadata(id: string) {
		const bytes = await this.repo!.readPdf(id);
		if (!bytes) throw new Error('PDF not found');
		await this.update(id, await extractMetadata(bytes, { arxiv: this.get(id)?.arxiv }));
		await this.refreshHf(id, { force: true });
	}

	// ── Categories & tags ─────────────────────────────────────────────────

	async saveCategories(categories: Category[]) {
		this.file = await this.repo!.updateLibrary({ categories });
	}

	async addCategory(name: string, color: CategoryColor) {
		const id = uniqueId(slugify(name, 'category'), new Set(this.file.categories.map((c) => c.id)));
		await this.saveCategories([...this.file.categories, { id, name, color }]);
		return id;
	}

	async editCategory(id: string, patch: Partial<Omit<Category, 'id'>>) {
		await this.saveCategories(this.file.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)));
	}

	/** Papers keep their files; they just become uncategorized. */
	async removeCategory(id: string) {
		await this.saveCategories(this.file.categories.filter((c) => c.id !== id));
		for (const p of this.papers.filter((p) => p.category === id)) await this.update(p.id, { category: null });
		if (this.view.kind === 'category' && this.view.id === id) this.view = { kind: 'all' };
	}

	/** Filter by a tag: none → only these ('in') → hide these ('out') → none. */
	cycleTag(tag: string) {
		const mode = this.tagFilter[tag];
		this.setTagFilter(tag, mode === 'in' ? 'out' : mode === 'out' ? null : 'in');
	}

	setTagFilter(tag: string, mode: TagMode | null) {
		const { [tag]: _, ...rest } = this.tagFilter;
		this.tagFilter = mode ? { ...rest, [tag]: mode } : rest;
	}
}

function haystack(p: Paper) {
	return [p.title, p.authors?.join(' '), p.abstract, p.year, p.arxiv, p.doi, p.tags?.join(' ')]
		.filter(Boolean)
		.join(' ')
		.toLowerCase();
}

function uniqueId(base: string, taken: Set<string>) {
	let id = base;
	for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
	return id;
}

export const library = new Library();

/** Comparable string per sort order ('' when the paper has no value for it). */
const sortKeys: Record<SortKey, (p: Paper) => string> = {
	added: (p) => p.added ?? '',
	opened: (p) => p.opened ?? '',
	// Full date when known (YYYY-MM-DD sorts as text), else the year.
	published: (p) => p.date ?? (p.year ? String(p.year) : ''),
	title: (p) => p.title
};

const HF_REFRESH_MS = 7 * 86_400_000;

/**
 * arXiv's title (via Hugging Face) when the one read from the PDF is worse:
 * the same words in the wrong case ("Bdh-Cq" for "BDH-CQ"), or not a title at
 * all ("working", a file name). Otherwise undefined: keep the user's title.
 */
export function betterTitle(current: string, official?: string) {
	if (!official || official === current) return undefined;
	// Same letters once case, spaces and punctuation are ignored ("Lan- guage" = "Language").
	const letters = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
	if (letters(official) === letters(current)) return official;
	if (current.length < 12 || !current.includes(' ')) return official;
	return undefined;
}

/** arXiv's author list when the one read from the PDF is missing or garbled (names in capitals, fragments). */
export function betterAuthors(current: string[] | undefined, official?: string[]) {
	if (!official?.length) return undefined;
	const garbled = !current?.length || current.some((a) => !/\p{Ll}/u.test(a));
	return garbled ? official : undefined;
}
