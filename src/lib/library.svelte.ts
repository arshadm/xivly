import { paperColors, type PaperColor } from 'svelte-pdf-mini';
import { extractMetadata } from './extract';
import { platform } from './platform';
import { Repo } from './repo';
import { settings } from './settings.svelte';
import type { Category, ColorName, LibraryFile, Paper, PaperPatch } from './types';

export type View =
	| { kind: 'all' }
	| { kind: 'recent' }
	| { kind: 'uncategorized' }
	| { kind: 'category'; id: string };

type Status = 'loading' | 'none' | 'needs-permission' | 'ready' | 'error';

const stone = paperColors.find((c) => c.name === 'stone')!;

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
	tags = $state<string[]>([]);
	query = $state('');

	categories = $derived(this.file.categories);

	/** Every tag in use, plus the ones declared in library.json. */
	allTags = $derived([...new Set([...this.file.tags, ...this.papers.flatMap((p) => p.tags ?? [])])].sort());

	filtered = $derived.by(() => {
		const q = this.query.trim().toLowerCase();
		const v = this.view;
		const list = this.papers.filter((p) => {
			if (v.kind === 'category' && p.category !== v.id) return false;
			// Includes ids missing from library.json (deleted elsewhere, set by an agent).
			if (v.kind === 'uncategorized' && this.category(p.category)) return false;
			if (v.kind === 'recent' && !p.opened) return false;
			if (this.tags.length && !this.tags.every((t) => p.tags?.includes(t))) return false;
			return !q || haystack(p).includes(q);
		});
		const by = v.kind === 'recent' ? 'opened' : settings.values.sortBy;
		if (by === 'title') return list.toSorted((a, b) => a.title.localeCompare(b.title));
		if (by === 'year') return list.toSorted((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title));
		return list.toSorted((a, b) => String(b[by] ?? '').localeCompare(String(a[by] ?? '')));
	});

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
		const r = await platform.reconnect();
		if (r) await this.#open(r);
	}

	async #open({ fs, name }: { fs: Repo['fs']; name: string }) {
		const repo = new Repo(fs, platform);
		await repo.init();
		this.repo = repo;
		this.name = name;
		this.view = { kind: 'all' };
		this.tags = [];
		await this.reload();
		this.status = 'ready';
	}

	async reload() {
		if (!this.repo) return;
		try {
			[this.file, this.papers] = await Promise.all([this.repo.readLibrary(), this.repo.listPapers()]);
			this.error = null;
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

	/** Matte colour for a paper (its category's), used for covers and the reader. */
	color(paper?: Pick<Paper, 'category'>): PaperColor {
		const name = this.category(paper?.category)?.color;
		return paperColors.find((c) => c.name === name) ?? stone;
	}

	// ── Papers ────────────────────────────────────────────────────────────

	/** Native file picker; works the same in Tauri's webview and browsers. */
	pickAndImport() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'application/pdf,.pdf';
		input.multiple = true;
		input.onchange = () => input.files && this.import([...input.files]);
		input.click();
	}

	/** Extract metadata, write the paper, then fire `paper-added`. */
	async import(files: File[]) {
		const repo = this.repo;
		if (!repo) return;
		const category = this.view.kind === 'category' ? this.view.id : undefined;
		const tags = this.tags.length ? [...this.tags] : undefined;
		const pdfs = files.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
		await Promise.all(
			pdfs.map(async (file) => {
				this.importing++;
				try {
					const bytes = new Uint8Array(await file.arrayBuffer());
					let meta: PaperPatch = { title: file.name.replace(/\.pdf$/i, '') };
					try {
						meta = { ...meta, ...(await extractMetadata(bytes, { filename: file.name })) };
					} catch (e) {
						console.warn('metadata extraction failed', e);
					}
					await repo.add(bytes, { ...meta, category, tags });
				} catch (e) {
					this.error = String(e);
				} finally {
					this.importing--;
				}
			})
		);
		await this.reload();
	}

	/** Optimistic: the UI (and the next edit) sees the change before disk does. */
	/** Download an arXiv paper into the library; returns its id. */
	async importArxiv(arxivId: string): Promise<string | undefined> {
		const existing = this.papers.find((p) => p.arxiv === arxivId);
		if (existing) return existing.id;
		const res = await fetch(`https://arxiv.org/pdf/${arxivId}`);
		if (!res.ok) throw new Error(`arXiv ${arxivId}: HTTP ${res.status}`);
		const file = new File([await res.blob()], `${arxivId.replace('/', '_')}.pdf`, { type: 'application/pdf' });
		await this.import([file]);
		return this.papers.find((p) => p.arxiv === arxivId)?.id;
	}

	async update(id: string, patch: PaperPatch) {
		const i = this.papers.findIndex((p) => p.id === id);
		const before = i >= 0 ? this.papers[i] : undefined;
		if (before) this.papers[i] = applyPatch(before, patch);
		try {
			const updated = await this.repo!.update(id, patch);
			const j = this.papers.findIndex((p) => p.id === id);
			if (j >= 0) this.papers[j] = updated;
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
		this.papers = this.papers.filter((p) => p.id !== id);
	}

	/** Re-run extraction; overwrites extracted fields, keeps category/tags. */
	async refreshMetadata(id: string) {
		const bytes = await this.repo!.readPdf(id);
		if (!bytes) throw new Error('PDF not found');
		return this.update(id, await extractMetadata(bytes, { arxiv: this.get(id)?.arxiv }));
	}

	// ── Categories & tags ─────────────────────────────────────────────────

	async saveCategories(categories: Category[]) {
		this.file = await this.repo!.updateLibrary({ categories });
	}

	async addCategory(name: string, color: ColorName) {
		const id = uniqueId(slug(name), new Set(this.file.categories.map((c) => c.id)));
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

	toggleTag(tag: string) {
		this.tags = this.tags.includes(tag) ? this.tags.filter((t) => t !== tag) : [...this.tags, tag];
	}
}

function applyPatch(paper: Paper, patch: PaperPatch): Paper {
	const next: Record<string, unknown> = { ...paper };
	for (const [k, v] of Object.entries(patch)) {
		if (v === null) delete next[k];
		else if (v !== undefined) next[k] = v;
	}
	return next as Paper;
}

function haystack(p: Paper) {
	return [p.title, p.authors?.join(' '), p.abstract, p.year, p.arxiv, p.doi, p.tags?.join(' ')]
		.filter(Boolean)
		.join(' ')
		.toLowerCase();
}

function slug(s: string) {
	return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'category';
}

function uniqueId(base: string, taken: Set<string>) {
	let id = base;
	for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
	return id;
}

export const library = new Library();
