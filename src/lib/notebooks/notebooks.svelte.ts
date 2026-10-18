// The notebooks of the open library, as the sidebar and notebook windows show
// them. Every change is written to the item's own notebook.json (see tree.ts),
// then the list is updated in place.
import { library } from '#lib/library.svelte.js';
import type { Repo } from '#lib/repo.js';
import { canMove, childrenOf, parents, rankIn, ranksBetween, subtree, type NotebookKind, type NotebookNode } from './tree';

class Notebooks {
	nodes = $state<NotebookNode[]>([]);
	error = $state<string | null>(null);
	/** Each item's parent as shown (a missing parent or a loop reads as the top level). */
	#shown = $derived(parents(this.nodes));
	#repo: Repo | null = null;

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
		if (repo !== this.#repo) [this.#repo, this.nodes] = [repo, []];
		try {
			const nodes = await repo.listNotebooks(new Map(this.nodes.map((n) => [n.id, n])));
			if (repo === library.repo && JSON.stringify(nodes) !== JSON.stringify(this.nodes)) this.nodes = nodes;
			this.error = null;
		} catch (e) {
			this.error = String(e);
		}
	}

	get(id: string) {
		return this.nodes.find((n) => n.id === id);
	}

	/** The items in a folder (none: the top level), in order. */
	children(parent?: string) {
		return childrenOf(this.nodes, parent, this.#shown);
	}

	/** The folder an item shows in (none: the top level). */
	parentOf(id: string) {
		return this.#shown.get(id);
	}

	/** A new folder or notebook at the end of `parent` (none: the top level). */
	async create(kind: NotebookKind, title: string, parent?: string) {
		if (parent !== undefined && this.get(parent)?.kind !== 'folder') throw new Error('Only a folder can hold notebooks');
		const node = await this.#need().createNotebook(kind, title.trim() || (kind === 'folder' ? 'New folder' : 'Untitled'), { parent, rank: rankIn(this.nodes, '', parent, Infinity) });
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
				this.nodes = this.nodes.filter((x) => x.id !== n);
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
		this.nodes = this.nodes.filter((n) => n.id !== id);
	}

	#put(node: NotebookNode) {
		this.nodes = this.nodes.map((n) => (n.id === node.id ? node : n));
	}
}

export const notebooks = new Notebooks();
