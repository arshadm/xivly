import type { PaperColor } from 'svelte-pdf-mini';
import { broadcast } from './broadcast';
import { toast } from './components/Toasts.svelte';
import { forgetCover } from './covers';
import { parseArxiv } from './arxiv';
import { extractMetadata, tidyTitle } from './extract';
import { filterPapers, type View } from './filter';
import { fetchHfPaper } from './huggingface';
import { platform } from './platform';
import { isPdf, merge, Repo, slugify, type Patch } from './repo';
import { recentWindows, settings } from './settings.svelte';
import { betterAuthors, betterTitle, categoryColor, hfUnchanged, mapLimited, mergeLinks } from './library-utils';
import type { Category, CategoryColor, LibraryFile, Paper, PaperPatch } from './types';

export { betterAuthors, betterTitle, categoryColor } from './library-utils';

export type { View };

/** Always listed; hidden by default, so tagging a paper `archived` archives it. */
export const ARCHIVED = 'archived';
type TagMode = 'in' | 'out';

type Status = 'loading' | 'none' | 'needs-permission' | 'ready' | 'error';

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

	filtered = $derived(
		filterPapers(this.papers, {
			view: this.view,
			tagFilter: this.tagFilter,
			readFilter: settings.values.readFilter,
			recentSince: Date.now() - recentWindows[settings.values.recentWindow] * 864e5,
			query: this.query,
			sortBy: settings.values.sortBy,
			sortDesc: settings.values.sortDesc,
			isCategory: (id) => !!this.category(id)
		})
	);

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
			const [file, papers] = await Promise.all([this.repo.readLibrary(), this.repo.listPapers(new Map(this.papers.map((p) => [p.id, p])))]);
			this.#setFile(file);
			this.#setPapers(papers);
			this.error = null;
		} catch (e) {
			this.error = String(e);
		}
	}

	/** A reader window's refresh: its paper and the categories, not the whole library. */
	async reloadPaper(id: string) {
		if (!this.repo) return;
		try {
			const [file, paper] = await Promise.all([this.repo.readLibrary(), this.repo.readPaper(id, this.get(id))]);
			this.#setFile(file);
			this.#setPapers(paper ? [...this.papers.filter((p) => p.id !== id), paper] : this.papers.filter((p) => p.id !== id));
		} catch (e) {
			this.error = String(e);
		}
	}

	#setFile(file: LibraryFile) {
		if (JSON.stringify(file) !== JSON.stringify(this.file)) this.file = file;
	}

	/**
	 * Unchanged papers keep their objects, and an unchanged list isn't replaced:
	 * every window reloads on focus, which must not re-render (and re-measure)
	 * the whole grid when nothing changed.
	 */
	#setPapers(papers: Paper[]) {
		const old = new Map(this.papers.map((p) => [p.id, p]));
		let changed = papers.length !== this.papers.length;
		const next = papers.map((raw, i) => {
			// Shown tidied; written back only if the paper is edited.
			const p = { ...raw, title: tidyTitle(raw.title) };
			const before = old.get(p.id);
			if (before && JSON.stringify(before) === JSON.stringify(p)) {
				if (this.papers[i] !== before) changed = true;
				return before;
			}
			changed = true;
			return p;
		});
		if (changed) this.papers = next;
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

	/**
	 * Extract metadata, write the papers, then fire `paper-added`; returns their
	 * ids. A few at a time (a drop of 200 PDFs must not load them all at once);
	 * the ones that fail are listed in one message.
	 */
	async import(files: File[], hints: { arxiv?: string } = {}): Promise<string[]> {
		const repo = this.repo;
		if (!repo) return [];
		const category = this.view.kind === 'category' ? this.view.id : undefined;
		const tags = this.includedTags.length ? [...this.includedTags] : undefined;
		const pdfs = files.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
		const failed: string[] = [];
		this.importing += pdfs.length;
		const added = await mapLimited(pdfs, IMPORT_CONCURRENCY, async (file) => {
			try {
				const bytes = new Uint8Array(await file.arrayBuffer());
				// e.g. a paywall or login page downloaded under a .pdf name.
				if (!isPdf(bytes)) throw new Error('it isn’t a PDF, maybe a web page saved as .pdf');
				let meta: PaperPatch = { title: file.name.replace(/\.pdf$/i, '') };
				try {
					meta = { ...meta, ...(await extractMetadata(bytes, { filename: file.name, arxiv: hints.arxiv })) };
				} catch (e) {
					console.warn('metadata extraction failed', e);
				}
				return await repo.add(bytes, { ...meta, category, tags });
			} catch (e) {
				console.error(e);
				failed.push(`${file.name} (${e instanceof Error ? e.message : e})`);
			} finally {
				this.importing--;
			}
		});
		await this.reload();
		if (failed.length) toast(`${failed.length} of ${pdfs.length} PDF${pdfs.length > 1 ? 's' : ''} couldn’t be added: ${failed.join(', ')}`, 'error');
		const papers = added.filter((p): p is Paper => !!p);
		// Links from Hugging Face, in the background, one paper at a time.
		void (async () => {
			for (const p of papers) if (p.arxiv) await this.refreshHf(p.id).catch(() => {});
		})();
		return papers.map((p) => p.id);
	}

	/**
	 * Add an arXiv paper from a link (abs, pdf, html…) or id. Returns its id,
	 * the existing one when it's already in the library.
	 */
	async importArxiv(input: string): Promise<{ id: string; existed: boolean }> {
		const ref = parseArxiv(input);
		if (!ref) throw new Error('Not an arXiv link or id');
		// A reader window only knows its own paper: look at the library itself before adding a copy.
		let existing = this.papers.find((p) => p.arxiv === ref.id);
		if (!existing) {
			await this.reload();
			existing = this.papers.find((p) => p.arxiv === ref.id);
		}
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
		const gh = hf?.github?.replace(/\/+$/, '');
		const found = { project: hf?.project, github: gh ? [gh] : undefined };
		// Kept on the paper itself (title, authors); the rest under `hf`.
		const { title, authors, ...rest } = hf ?? {};
		const checked = new Date().toISOString();
		// Applied to the paper as it is on disk (under its lock): links added meanwhile stay.
		const patch = (cur: Paper) => ({ links: mergeLinks(cur.links, found), title: betterTitle(cur.title, title), authors: betterAuthors(cur.authors, authors) });
		const { checked: _, ...before } = p.hf ?? {};
		// Nothing new: just the date of the lookup (no `paper-updated` hook).
		if (hfUnchanged(p, patch(p), rest, before)) await this.touch(id, { hf: { ...rest, checked } });
		else await this.update(id, (cur) => ({ ...patch(cur), hf: { ...rest, checked } }));
	}

	/**
	 * Optimistic: the UI (and the next edit) sees the change before disk does. A
	 * function patch is applied to the paper as it is on disk, under its lock
	 * (lists such as tags: never overwrite an edit made meanwhile elsewhere).
	 */
	async update(id: string, patch: PaperPatch | ((current: Paper) => PaperPatch)) {
		const i = this.papers.findIndex((p) => p.id === id);
		const before = i >= 0 ? this.papers[i] : undefined;
		if (before) this.papers[i] = merge(before, (typeof patch === 'function' ? patch(before) : patch) as Record<string, unknown>);
		try {
			const updated = await this.repo!.update(id, patch as Patch<Paper>);
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
		const i = this.papers.findIndex((p) => p.id === id);
		if (i >= 0) this.papers[i] = merge(this.papers[i], patch as Record<string, unknown>);
		return this.repo!.touch(id, patch);
	}

	async remove(id: string) {
		await this.repo!.remove(id);
		forgetCover(id);
		this.papers = this.papers.filter((p) => p.id !== id);
		// Its reader window (if open) closes: it must not save into a folder that's gone.
		void broadcast('paper-removed', { id });
	}

	/** Add or remove a tag on a paper (from its tags on disk, so concurrent edits are kept). */
	toggleTag(id: string, tag: string) {
		return this.update(id, (cur) => {
			const tags = cur.tags?.includes(tag) ? cur.tags.filter((t) => t !== tag) : [...(cur.tags ?? []), tag];
			return { tags: tags.length ? tags : null };
		});
	}

	/** Remove a tag from every paper, and from library.json's declared tags. */
	async removeTag(tag: string) {
		const papers = this.papers.filter((p) => p.tags?.includes(tag));
		await Promise.all(
			papers.map((p) =>
				this.update(p.id, (cur) => {
					const tags = (cur.tags ?? []).filter((t) => t !== tag);
					return { tags: tags.length ? tags : null };
				})
			)
		);
		if (this.file.tags.includes(tag)) this.file = await this.repo!.updateLibrary((cur) => ({ tags: cur.tags.filter((t) => t !== tag) }));
		this.setTagFilter(tag, null);
	}

	/** Re-read the metadata from the PDF, then from Hugging Face (arXiv papers); keeps category and tags. */
	async refreshMetadata(id: string) {
		const bytes = await this.repo!.readPdf(id);
		if (!bytes) throw new Error('PDF not found');
		const meta = await extractMetadata(bytes, { arxiv: this.get(id)?.arxiv });
		// The links found in the PDF are added to the paper's, never replace them.
		await this.update(id, (cur) => ({ ...meta, links: mergeLinks(cur.links, meta.links ?? undefined) }));
		await this.refreshHf(id, { force: true });
	}

	// ── Categories & tags ─────────────────────────────────────────────────

	/** Change the category list as it is on disk (under its lock): other windows' or agents' edits are kept. */
	async saveCategories(change: (current: Category[]) => Category[]) {
		this.file = await this.repo!.updateLibrary((cur) => ({ categories: change(cur.categories) }));
	}

	async addCategory(name: string, color: CategoryColor) {
		let id = '';
		await this.saveCategories((cur) => {
			id = uniqueId(slugify(name, 'category'), new Set(cur.map((c) => c.id)));
			return [...cur, { id, name, color }];
		});
		return id;
	}

	async editCategory(id: string, patch: Partial<Omit<Category, 'id'>>) {
		await this.saveCategories((cur) => cur.map((c) => (c.id === id ? { ...c, ...patch } : c)));
	}

	/** Papers keep their files; they just become uncategorized (bookkeeping: no hook per paper). */
	async removeCategory(id: string) {
		await this.saveCategories((cur) => cur.filter((c) => c.id !== id));
		await Promise.all(this.papers.filter((p) => p.category === id).map((p) => this.touch(p.id, { category: null }).catch(() => {})));
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

function uniqueId(base: string, taken: Set<string>) {
	let id = base;
	for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
	return id;
}

export const library = new Library();

const HF_REFRESH_MS = 7 * 86_400_000;
const IMPORT_CONCURRENCY = 3;
