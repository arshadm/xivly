// A link from the notes to a place in the paper: an inline chip ("p. 5")
// that jumps there when clicked. In notes.json: { type: 'paperLink', attrs: { page, label } }.
import { Node } from '@tiptap/core';
import { anchorLabel, parseAnchor } from '#lib/anchor.js';
import type { PaperAnchor } from '#lib/types.js';

export const PaperLink = Node.create({
	name: 'paperLink',
	group: 'inline',
	inline: true,
	atom: true,
	selectable: true,

	addAttributes() {
		return { page: { default: 1 }, label: { default: null } };
	},

	parseHTML() {
		return [{ tag: 'span[data-paper-link]', getAttrs: (el) => ({ page: Number((el as HTMLElement).dataset.page) || 1, label: (el as HTMLElement).dataset.label ?? null }) }];
	},

	renderHTML({ node }) {
		const anchor = toAnchor(node.attrs);
		return ['span', { 'data-paper-link': '', 'data-page': String(anchor.page), ...(anchor.label ? { 'data-label': anchor.label } : {}), class: 'paper-link', title: `Go to page ${Math.floor(anchor.page)}`, role: 'link' }, anchorLabel(anchor)];
	}
});

/** The anchor a chip points at (attributes edited by hand fall back to page 1). */
export const toAnchor = (attrs: Record<string, unknown>): PaperAnchor => parseAnchor(attrs) ?? { page: 1 };

/** A chip for an anchor, as editor content. */
export const paperLinkNode = (anchor: PaperAnchor) => ({ type: 'paperLink', attrs: { page: anchor.page, label: anchor.label ?? null } });

/** A quote from the paper with a chip to where it is, then an empty line to go on writing. */
export const quoteContent = (text: string, anchor: PaperAnchor) => [
	{ type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: `${text.replace(/\s+/g, ' ').trim()} ` }, paperLinkNode(anchor)] }] },
	{ type: 'paragraph' }
];
