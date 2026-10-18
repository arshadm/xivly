// Notebooks found from their text (notes.md, as written beside notes.json): searched
// like papers (the phrase typed, in the title or the text), and the papers each one
// mentions (a chip is a link to the paper's PDF there).
import type { NotebookNode } from './tree';

const PAPER_LINK = /\]\(\.\.\/\.\.\/papers\/([^/)\s]+)\/paper\.pdf[^)]*\)/g;

/** The papers a notebook's notes.md links to, with how many times. */
export function mentionedPapers(md: string): Map<string, number> {
	const out = new Map<string, number>();
	for (const [, raw] of md.matchAll(PAPER_LINK)) {
		let id = raw;
		try {
			id = decodeURI(raw);
		} catch {
			// Kept as written.
		}
		out.set(id, (out.get(id) ?? 0) + 1);
	}
	return out;
}

/** notes.md as text to read in a line: links and images by their text, no Markdown marks. */
export function plainText(md: string): string {
	return md
		.replace(/^<!--[\s\S]*?-->\s*/, '')
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/\\([\\[\]*_#`>~|-])/g, '$1')
		.replace(/^\s*(#{1,6}|>|[-*+]|\d+\.|- \[[ x]\])\s+/gm, '')
		.replace(/[*_`~]{1,3}/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

export interface NotebookMatch {
	node: NotebookNode;
	/** Where the phrase is in the text: the words around it (none: only in the title). */
	snippet?: { before: string; match: string; after: string };
}

/** Notebooks with the phrase in their title or text (none for an empty phrase): title matches first, then the latest changed. */
export function searchNotebooks(nodes: readonly NotebookNode[], texts: ReadonlyMap<string, string>, query: string, around = 48): NotebookMatch[] {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	const out: (NotebookMatch & { inTitle: boolean })[] = [];
	for (const node of nodes) {
		if (node.kind !== 'notebook') continue;
		const inTitle = node.title.toLowerCase().includes(q);
		const text = plainText(texts.get(node.id) ?? '');
		const at = text.toLowerCase().indexOf(q);
		if (!inTitle && at < 0) continue;
		const snippet =
			at < 0
				? undefined
				: {
						before: (at > around ? '…' : '') + text.slice(Math.max(0, at - around), at).replace(/^\S*\s/, (w) => (at > around ? '' : w)),
						match: text.slice(at, at + q.length),
						after: text.slice(at + q.length, at + q.length + around * 2) + (at + q.length + around * 2 < text.length ? '…' : '')
					};
		out.push({ node, snippet, inTitle });
	}
	return out.sort((a, b) => Number(b.inTitle) - Number(a.inTitle) || b.node.updated.localeCompare(a.node.updated)).map(({ node, snippet }) => ({ node, snippet }));
}
