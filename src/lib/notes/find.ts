// Find in the notes: every match highlighted, the current one stronger.
// Matching ignores case and works across marks (a word half bold still matches).
import { Extension, type Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface Match {
	from: number;
	to: number;
}

/** Where `query` occurs in the document (case-insensitive), in order. */
export function findMatches(doc: PMNode, query: string): Match[] {
	const q = query.toLowerCase();
	if (!q) return [];
	const out: Match[] = [];
	doc.descendants((node, pos) => {
		if (!node.isTextblock) return true;
		// The block's text, and the document position of each of its characters.
		let text = '';
		const at: number[] = [];
		node.forEach((child, offset) => {
			if (child.isText) {
				for (let i = 0; i < child.text!.length; i++) at.push(pos + 1 + offset + i);
				text += child.text;
			} else {
				// An inline atom (page chip, maths): one character no query matches.
				at.push(pos + 1 + offset);
				text += '￼';
			}
		});
		const lower = text.toLowerCase();
		// Lower-casing can change a string's length (rare letters): positions would drift.
		if (lower.length !== text.length) return false;
		for (let i = lower.indexOf(q); i !== -1; i = lower.indexOf(q, i + q.length)) out.push({ from: at[i], to: at[i + q.length - 1] + 1 });
		return false;
	});
	return out;
}

interface FindState {
	query: string;
	/** Index of the current match (-1: none). */
	current: number;
	decorations: DecorationSet;
}

const key = new PluginKey<FindState>('notesFind');

function decorate(doc: PMNode, query: string, current: number): DecorationSet {
	const matches = findMatches(doc, query);
	return DecorationSet.create(
		doc,
		matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === current ? 'notes-match notes-match-current' : 'notes-match' }))
	);
}

export const NotesFind = Extension.create({
	name: 'notesFind',
	addProseMirrorPlugins() {
		return [
			new Plugin<FindState>({
				key,
				state: {
					init: () => ({ query: '', current: -1, decorations: DecorationSet.empty }),
					apply(tr, prev, _old, state) {
						const meta = tr.getMeta(key) as Partial<Pick<FindState, 'query' | 'current'>> | undefined;
						if (!meta && !tr.docChanged) return prev;
						const query = meta?.query ?? prev.query;
						const current = meta?.current ?? prev.current;
						return { query, current, decorations: query ? decorate(state.doc, query, current) : DecorationSet.empty };
					}
				},
				props: { decorations: (state) => key.getState(state)?.decorations }
			})
		];
	}
});

/** Show this query's matches (none: ''). Returns how many there are. */
export function setFindQuery(editor: Editor, query: string): number {
	const matches = findMatches(editor.state.doc, query);
	editor.view.dispatch(editor.state.tr.setMeta(key, { query, current: matches.length ? 0 : -1 }));
	return matches.length;
}

/**
 * Go to the next (1) or previous (-1) match, after the current one or from the cursor.
 * Selects it and scrolls to it; returns its index and the count.
 */
export function findStep(editor: Editor, dir: 1 | -1): { index: number; count: number } {
	const st = key.getState(editor.state);
	const matches = st ? findMatches(editor.state.doc, st.query) : [];
	if (!matches.length) return { index: -1, count: 0 };
	let index: number;
	if (st && st.current >= 0 && st.current < matches.length) index = (st.current + dir + matches.length) % matches.length;
	else {
		const head = editor.state.selection.from;
		index = dir === 1 ? Math.max(0, matches.findIndex((m) => m.from >= head)) : matches.findLastIndex((m) => m.to <= head);
		if (index < 0) index = matches.length - 1;
	}
	const m = matches[index];
	editor.view.dispatch(editor.state.tr.setMeta(key, { current: index }).setSelection(TextSelection.create(editor.state.doc, m.from, m.to)).scrollIntoView());
	return { index, count: matches.length };
}
