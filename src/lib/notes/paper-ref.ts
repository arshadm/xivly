// A link from a notebook to a paper of the library: an inline chip ("Vaswani 2017",
// or "Vaswani 2017, p. 5" for a place in it), typed with @. In notes.json:
// { type: 'paperRef', attrs: { paperId, page, label } }; `label` is the chip's text when
// it was made, shown if the paper is gone. In notes.md: a link to the paper's PDF.
import { Extension, Node, type Editor, type Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion, { exitSuggestion, type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion';
import type { Paper } from '#lib/types.js';

/** What the editor needs from the library for paper chips. */
export interface PaperRefs {
	/** Papers matching what's typed after @: linked ones first. */
	search(query: string): Paper[];
	/** The paper a chip points at (null: no longer in the library). */
	get(id: string): Paper | null;
	/** A chip was clicked. */
	open(id: string, page?: number): void;
}

/** A chip's text: the first author's surname and the year, else the title, shortened. */
export function refLabel(p: Pick<Paper, 'title' | 'authors' | 'year'>): string {
	const first = p.authors?.[0]?.trim().split(/\s+/).at(-1);
	if (first) return [`${first}${(p.authors?.length ?? 0) > 2 ? ' et al.' : (p.authors?.length ?? 0) === 2 ? ` & ${p.authors![1].trim().split(/\s+/).at(-1)}` : ''}`, p.year].filter(Boolean).join(' ');
	return p.title.length > 40 ? `${p.title.slice(0, 38).trimEnd()}…` : p.title;
}

const withPage = (label: string, page: number | null | undefined) => (page ? `${label}, p. ${Math.floor(page)}` : label);

/** A chip for a paper (at a page), as editor content. */
export const paperRefNode = (p: Paper, page?: number) => ({ type: 'paperRef', attrs: { paperId: p.id, page: page ?? null, label: refLabel(p) } });

/** Papers for what's typed after @ (words in any order, in the title, authors, year or arXiv id): linked ones first, then the rest, newest first. */
export function searchPapers(papers: readonly Paper[], query: string, linked: ReadonlySet<string>, limit = 8): Paper[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	const text = (p: Paper) => [p.title, ...(p.authors ?? []), p.year ?? '', p.arxiv ?? '', p.id].join(' ').toLowerCase();
	const found = papers.filter((p) => words.every((w) => text(p).includes(w)));
	const rank = (p: Paper) => (linked.has(p.id) ? 0 : 1);
	return found.toSorted((a, b) => rank(a) - rank(b) || (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title)).slice(0, limit);
}

interface Node_ {
	type?: string;
	attrs?: Record<string, unknown>;
	content?: Node_[];
}

/** The papers a document's chips point at, with how many chips each has, in order of first mention. */
export function paperRefsIn(doc: { content?: unknown[] } | null | undefined): Map<string, number> {
	const out = new Map<string, number>();
	const walk = (n: Node_) => {
		if (n.type === 'paperRef' && typeof n.attrs?.paperId === 'string' && n.attrs.paperId) out.set(n.attrs.paperId, (out.get(n.attrs.paperId) ?? 0) + 1);
		n.content?.forEach(walk);
	};
	if (doc) walk(doc as Node_);
	return out;
}

/** A chip in notes.md: a link to the paper's PDF from the notebook's folder. */
export function paperRefMarkdown(attrs: Record<string, unknown>): string {
	const id = typeof attrs.paperId === 'string' ? attrs.paperId : '';
	const page = typeof attrs.page === 'number' ? attrs.page : null;
	const label = withPage(typeof attrs.label === 'string' && attrs.label ? attrs.label : id, page);
	return `[${label.replace(/([\\[\]])/g, '\\$1')}](../../papers/${encodeURI(id)}/paper.pdf${page ? `#page=${Math.floor(page)}` : ''})`;
}

export const PaperRef = Node.create<{ refs: PaperRefs | null }>({
	name: 'paperRef',
	group: 'inline',
	inline: true,
	atom: true,
	selectable: true,

	addOptions() {
		return { refs: null };
	},

	addAttributes() {
		return { paperId: { default: '' }, page: { default: null }, label: { default: null } };
	},

	parseHTML() {
		return [
			{
				tag: 'span[data-paper-ref]',
				getAttrs: (el) => {
					const d = (el as HTMLElement).dataset;
					return { paperId: d.paperRef ?? '', page: Number(d.page) || null, label: d.label ?? null };
				}
			}
		];
	},

	renderHTML({ node }) {
		const { paperId, page, label } = node.attrs;
		return ['span', { 'data-paper-ref': paperId, ...(page ? { 'data-page': String(page) } : {}), ...(label ? { 'data-label': label } : {}), class: 'paper-ref' }, withPage(label || paperId, page)];
	},

	addNodeView() {
		return ({ node }) => {
			const dom = document.createElement('span');
			const { paperId, page, label } = node.attrs;
			const paper = this.options.refs?.get(paperId) ?? null;
			dom.className = 'paper-ref';
			dom.dataset.paperRef = paperId;
			dom.setAttribute('role', 'link');
			if (!paper && this.options.refs) dom.dataset.missing = '';
			dom.textContent = withPage(paper ? refLabel(paper) : label || paperId, page);
			dom.title = paper ? `${paper.title}${page ? ` (p. ${Math.floor(page)})` : ''}` : 'This paper is no longer in the library';
			return { dom };
		};
	}
});

/** The @ menu's state, for the editor to draw. */
export interface MentionMenu {
	items: Paper[];
	index: number;
	rect: DOMRect | null;
	choose: (p: Paper) => void;
}

/**
 * @ in the text: a menu of papers (see PaperRefs.search); ↑ ↓ to choose, ↵ or Tab to insert
 * the chip, Esc to close. `show` gets the menu to draw (null: closed).
 */
export function paperMention(refs: () => PaperRefs | null, show: (menu: MentionMenu | null) => void) {
	let menu: MentionMenu | null = null;
	const set = (m: MentionMenu | null) => show((menu = m));
	const key = new PluginKey('paperMention');
	return Extension.create({
		name: 'paperMention',
		addProseMirrorPlugins() {
			return [
				Suggestion<Paper, Paper>({
					editor: this.editor as Editor,
					pluginKey: key,
					char: '@',
					allowSpaces: true,
					items: ({ query }) => refs()?.search(query) ?? [],
					command: ({ editor, range, props }: { editor: Editor; range: Range; props: Paper }) => {
						editor.chain().focus().insertContentAt(range, [paperRefNode(props), { type: 'text', text: ' ' }]).run();
					},
					render: () => ({
						onStart: (props: SuggestionProps<Paper, Paper>) => set({ items: props.items, index: 0, rect: props.clientRect?.() ?? null, choose: (p) => props.command(p) }),
						onUpdate: (props: SuggestionProps<Paper, Paper>) => set({ items: props.items, index: Math.min(menu?.index ?? 0, Math.max(0, props.items.length - 1)), rect: props.clientRect?.() ?? null, choose: (p) => props.command(p) }),
						onKeyDown: ({ event, view }: SuggestionKeyDownProps) => {
							if (!menu) return false;
							if (event.key === 'Escape') return (exitSuggestion(view, key), set(null), true);
							if (!menu.items.length) return false;
							if (event.key === 'ArrowDown') return (set({ ...menu, index: (menu.index + 1) % menu.items.length }), true);
							if (event.key === 'ArrowUp') return (set({ ...menu, index: (menu.index - 1 + menu.items.length) % menu.items.length }), true);
							if (event.key === 'Enter' || event.key === 'Tab') return (menu.choose(menu.items[menu.index]), true);
							return false;
						},
						onExit: () => set(null)
					})
				})
			];
		}
	});
}
