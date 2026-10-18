// The notebooks of the open library, as the sidebar and notebook windows show
// them. Every change is written to the item's own notebook.json (see tree.ts),
// then the list is updated in place.
import { broadcast } from '#lib/broadcast.js';
import { library } from '#lib/library.svelte.js';
import type { Repo } from '#lib/repo.js';
import { mentionedPapers, searchNotebooks } from './search';
import { canMove, childrenOf, loopCuts, parents, rankIn, ranksBetween, subtree, type NotebookKind, type NotebookNode } from './tree';

class Notebooks {
	nodes = $state<NotebookNode[]>([]);
	error = $state<string | null>(null);
	/** Read at least once from the open library. */
	loaded = $state(false);
	/** Each item's parent as shown (a missing parent or a loop reads as the top level). */
	#shown = $derived(parents(this.nodes));
	#repo: Repo | null = null;
	/** Bumped by every change made here: a reload that read the folder before it reads again. */
	#changes = 0;
	/** Each notebook's text (notes.md), for search and the papers it mentions: read once asked for (`loadTexts`). */
	texts = $state.raw<ReadonlyMap<string, string>>(new Map());
	#textsAt = 0;
	#textsWanted = false;
	#textsTimer: ReturnType<typeof setTimeout> | undefined;

	#need(): Repo {
		const repo = library.repo;
		if (!repo) throw new Error('No library is open');
		return repo;
	}

	/** Read them all again (on opening a library, on focus, after changes on disk). */
	async reload() {
		const repo = library.repo;
		if (!repo) return;
		// Another library: nothing of the old one is kept.
		if (repo !== this.#repo) [this.#repo, this.nodes, this.loaded, this.texts, this.#textsAt] = [repo, [], false, new Map(), 0];
		// Their texts too, once something reads them (a search, a paper's Notebooks tab).
		if (this.#textsWanted) void this.loadTexts(1000);
		try {
			let nodes: NotebookNode[];
			let before: number;
			do {
				before = this.#changes;
				nodes = await repo.listNotebooks(new Map(this.nodes.map((n) => [n.id, n])));
			} while (before !== this.#changes);
			if (repo !== library.repo) return;
			if (JSON.stringify(nodes) !== JSON.stringify(this.nodes)) this.nodes = nodes;
			this.loaded = true;
			this.error = null;
			// A loop (from two devices): its files say where it shows now.
			for (const id of loopCuts(nodes)) this.#put(await repo.updateNotebook(id, { parent: null }));
		} catch (e) {
			this.error = String(e);
		}
	}

	get(id: string) {
		return this.nodes.find((n) => n.id === id);
	}

	/** Read every notebook's text, unless done within `maxAge` ms (a search runs it as you type). */
	async loadTexts(maxAge = 10_000) {
		const repo = library.repo;
		this.#textsWanted = true;
		if (!repo || Date.now() - this.#textsAt < maxAge) return;
		this.#textsAt = Date.now();
		try {
			const texts = await repo.readAllNotebookTexts();
			if (repo === library.repo) this.texts = texts;
		} catch (e) {
			console.warn('notebooks not searchable', e);
		}
	}

	/** A notebook's text changed on disk: read again a moment later (saves come every few seconds while typing), if anything here reads them. */
	textsChanged() {
		if (!this.#textsWanted) return;
		clearTimeout(this.#textsTimer);
		this.#textsTimer = setTimeout(() => void this.loadTexts(0), 400);
	}

	/** Notebooks with the phrase in their title or text (see `loadTexts`). */
	search(query: string) {
		return searchNotebooks(this.nodes, this.texts, query);
	}

	/** The notebooks that link a paper (by hand, or chips in the text: how many), by title. */
	linking(paperId: string): { node: NotebookNode; byHand: boolean; mentions: number }[] {
		return this.nodes
			.filter((n) => n.kind === 'notebook')
			.map((node) => ({ node, byHand: node.papers.includes(paperId), mentions: mentionedPapers(this.texts.get(node.id) ?? '').get(paperId) ?? 0 }))
			.filter((l) => l.byHand || l.mentions)
			.sort((a, b) => a.node.title.localeCompare(b.node.title));
	}

	/** The items in a folder (none: the top level), in order. */
	children(parent?: string) {
		return childrenOf(this.nodes, parent, this.#shown);
	}

	/** The folders an item is in, outermost first. */
	path(id: string): NotebookNode[] {
		const out: NotebookNode[] = [];
		for (let p = this.parentOf(id); p; p = this.parentOf(p)) out.unshift(this.get(p)!);
		return out;
	}

	/** The folder an item shows in (none: the top level). */
	parentOf(id: string) {
		return this.#shown.get(id);
	}

	/** A new folder or notebook at the end of `parent` (none: the top level). */
	async create(kind: NotebookKind, title: string, parent?: string) {
		if (parent !== undefined && this.get(parent)?.kind !== 'folder') throw new Error('Only a folder can hold notebooks');
		const node = await this.#need().createNotebook(kind, title.trim() || (kind === 'folder' ? 'New folder' : 'Untitled'), { parent, rank: rankIn(this.nodes, '', parent, Infinity) });
		this.#changes++;
		this.nodes = [...this.nodes, node];
		return node;
	}

	async rename(id: string, title: string) {
		const name = title.trim();
		if (!name || name === this.get(id)?.title) return;
		this.#put(await this.#need().updateNotebook(id, { title: name }));
	}

	/** Put an item at `index` of `parent` (none: the top level). */
	async move(id: string, parent: string | undefined, index: number) {
		if (!canMove(this.nodes, id, parent)) throw new Error('A folder can’t go inside itself');
		this.#put(await this.#need().updateNotebook(id, { parent: parent ?? null, rank: rankIn(this.nodes, id, parent, index) }));
	}

	/**
	 * Trash an item. A folder's contents move up a level, where it was (`keep`), or go
	 * to the trash with it.
	 */
	async remove(id: string, contents: 'keep' | 'trash' = 'keep') {
		const repo = this.#need();
		const parent = this.parentOf(id);
		if (contents === 'trash') {
			for (const n of subtree(this.nodes, id, this.#shown).toReversed()) {
				await repo.removeNotebook(n);
				this.#gone(n);
			}
			return;
		}
		const inside = this.children(id);
		if (inside.length) {
			const siblings = this.children(parent);
			const i = siblings.findIndex((n) => n.id === id);
			const ranks = ranksBetween(siblings[i - 1]?.rank, siblings[i + 1]?.rank, inside.length);
			for (const [k, n] of inside.entries()) this.#put(await repo.updateNotebook(n.id, { parent: parent ?? null, rank: ranks[k] }));
		}
		await repo.removeNotebook(id);
		this.#gone(id);
	}

	/** Link a paper to a notebook by hand (`on`), or not any more (chips in its text still link it). */
	async link(id: string, paperId: string, on = true) {
		const node = await this.#need().updateNotebook(id, (cur) => ({ papers: on ? [...new Set([...cur.papers, paperId])] : cur.papers.filter((p) => p !== paperId) }));
		this.#put(node);
		// An open notebook window shows it at once.
		void broadcast('notebook-changed', { id });
		return node;
	}

	/** The notebooks a paper is linked to by hand. */
	withPaper(paperId: string) {
		return this.nodes.filter((n) => n.kind === 'notebook' && n.papers.includes(paperId));
	}

	/** Trashed: off the list, and its window (if open) closes. */
	#gone(id: string) {
		this.#changes++;
		this.nodes = this.nodes.filter((n) => n.id !== id);
		library.devices?.forgetNotebook(id);
		void broadcast('notebook-removed', { id });
	}

	#put(node: NotebookNode) {
		this.#changes++;
		this.nodes = this.nodes.map((n) => (n.id === node.id ? node : n));
	}
}

export const notebooks = new Notebooks();
