// The notebooks tree: folders (which hold notebooks and other folders) and
// notebooks, each in its own `notebooks/<id>/notebook.json` with its parent and
// a rank among its siblings (lower first). Moving one item changes only its own
// file, never a shared list (fewer sync conflicts). Files are edited by people
// and agents too: a parent that's missing or isn't a folder, or a loop, reads
// as the top level, so every item always shows somewhere.
import { rankBetween } from '#lib/reading.js';

export type NotebookKind = 'folder' | 'notebook';

export interface NotebookNode {
	/** The folder name in `notebooks/`. */
	id: string;
	kind: NotebookKind;
	title: string;
	/** The folder it's in; none: the top level. */
	parent?: string;
	rank: number;
	created: string;
	updated: string;
	/** Papers linked by hand (not only through chips in the text). */
	papers: string[];
	[extra: string]: unknown;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

/** notebook.json as the app needs it (a wrong type reads as absent; unknown fields are kept). */
export function normalizeNode(id: string, raw: unknown): NotebookNode {
	const meta = isObject(raw) ? raw : {};
	const papers = Array.isArray(meta.papers) ? [...new Set(meta.papers.filter((p): p is string => typeof p === 'string'))] : [];
	return {
		...meta,
		id,
		kind: meta.kind === 'folder' ? 'folder' : 'notebook',
		title: str(meta.title)?.trim() || id,
		parent: str(meta.parent) || undefined,
		rank: typeof meta.rank === 'number' && Number.isFinite(meta.rank) ? meta.rank : 0,
		created: str(meta.created) ?? '',
		updated: str(meta.updated) ?? str(meta.created) ?? '',
		papers
	};
}

/**
 * Each item's parent as shown: none when it's missing, not a folder, or the item
 * itself; in a loop, the item with the smallest id goes to the top level.
 */
export function parents(nodes: readonly NotebookNode[]): Map<string, string | undefined> {
	const byId = new Map(nodes.map((n) => [n.id, n]));
	const out = new Map<string, string | undefined>();
	for (const n of nodes) out.set(n.id, n.parent && n.parent !== n.id && byId.get(n.parent)?.kind === 'folder' ? n.parent : undefined);
	const done = new Set<string>();
	for (const n of nodes) {
		const path: string[] = [];
		let at: string | undefined = n.id;
		while (at !== undefined && !done.has(at) && !path.includes(at)) {
			path.push(at);
			at = out.get(at);
		}
		if (at !== undefined && path.includes(at)) {
			const loop = path.slice(path.indexOf(at));
			out.set(loop.toSorted()[0], undefined);
		}
		path.forEach((id) => done.add(id));
	}
	return out;
}

const order = (a: NotebookNode, b: NotebookNode) => a.rank - b.rank || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);

/** The items in a folder (none: the top level), in order. */
export function childrenOf(nodes: readonly NotebookNode[], parent?: string, shown = parents(nodes)): NotebookNode[] {
	return nodes.filter((n) => shown.get(n.id) === parent).toSorted(order);
}

/** An item and everything inside it, outermost first. */
export function subtree(nodes: readonly NotebookNode[], id: string, shown = parents(nodes)): string[] {
	const out = [id];
	for (let i = 0; i < out.length; i++) for (const n of nodes) if (shown.get(n.id) === out[i]) out.push(n.id);
	return out;
}

/** Whether `id` may go into `parent` (none: the top level): only into a folder, never into itself or one inside it. */
export function canMove(nodes: readonly NotebookNode[], id: string, parent?: string): boolean {
	if (parent === undefined) return true;
	if (nodes.find((n) => n.id === parent)?.kind !== 'folder') return false;
	return !subtree(nodes, id).includes(parent);
}

/** The rank that puts `id` at `index` of `parent`'s items (counted without it). */
export function rankIn(nodes: readonly NotebookNode[], id: string, parent: string | undefined, index: number): number {
	const others = childrenOf(nodes, parent).filter((n) => n.id !== id);
	const i = Math.max(0, Math.min(index, others.length));
	return rankBetween(others[i - 1]?.rank, others[i]?.rank);
}

/** `count` ranks in order between two neighbors (either may be missing). */
export function ranksBetween(before: number | undefined, after: number | undefined, count: number): number[] {
	if (before === undefined && after === undefined) return Array.from({ length: count }, (_, i) => i);
	if (before === undefined) return Array.from({ length: count }, (_, i) => after! - count + i);
	if (after === undefined) return Array.from({ length: count }, (_, i) => before + 1 + i);
	return Array.from({ length: count }, (_, i) => before + ((after - before) * (i + 1)) / (count + 1));
}
