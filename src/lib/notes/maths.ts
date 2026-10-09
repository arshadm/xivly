// Maths in the notes (KaTeX), typed as in a paper: $x$ inline, $$x$$ alone on a
// line for a block. (TipTap's own rules are $$x$$ and $$$x$$$.)
import { InputRule } from '@tiptap/core';
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics';

/** `$x$` just typed: the `$` signs hug the formula, so "$5 and $6" stays text. */
export const INLINE_MATH = /(?<![$\\\w])\$(?=[^\s$])([^$\n]*?[^\s$\\])\$$/;
/** `$$x$$` alone in a paragraph. */
export const BLOCK_MATH = /^\$\$([^$]+)\$\$$/;

export const NotesInlineMath = InlineMath.extend({
	addInputRules() {
		return [
			new InputRule({
				find: INLINE_MATH,
				handler: ({ state, range, match }) => {
					state.tr.replaceWith(range.from, range.to, this.type.create({ latex: match[1] }));
				}
			})
		];
	}
});

export const NotesBlockMath = BlockMath.extend({
	addInputRules() {
		return [
			new InputRule({
				find: BLOCK_MATH,
				handler: ({ state, range, match }) => {
					const $from = state.doc.resolve(range.from);
					// The whole paragraph becomes the block (it held only the formula).
					state.tr.replaceWith($from.before(), $from.after(), this.type.create({ latex: match[1].trim() }));
				}
			})
		];
	}
});
