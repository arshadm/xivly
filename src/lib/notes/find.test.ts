import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';
import { findMatches } from './find';
import { PaperLink } from './paper-link';

const schema = getSchema([StarterKit, PaperLink]);
const t = (text: string, ...marks: string[]) => ({ type: 'text', text, ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}) });
const p = (...content: unknown[]) => ({ type: 'paragraph', content });
const doc = (...content: unknown[]) => schema.nodeFromJSON({ type: 'doc', content });
/** The text each match covers. */
const found = (d: ReturnType<typeof doc>, q: string) => findMatches(d, q).map((m) => d.textBetween(m.from, m.to));

describe('findMatches', () => {
	it('finds every occurrence, any case, in order', () => {
		const d = doc(p(t('Attention is all you need.')), p(t('attention, again: ATTENTION')));
		expect(found(d, 'attention')).toEqual(['Attention', 'attention', 'ATTENTION']);
	});

	it('across marks, and inside headings, lists and quotes', () => {
		const d = doc(
			{ type: 'heading', attrs: { level: 2 }, content: [t('Self-'), t('attention', 'bold')] },
			{ type: 'bulletList', content: [{ type: 'listItem', content: [p(t('self-att'), t('ention', 'italic'))] }] },
			{ type: 'blockquote', content: [p(t('no self attention here'))] }
		);
		expect(found(d, 'self-attention')).toEqual(['Self-attention', 'self-attention']);
	});

	it('never matches across a page chip, or across blocks', () => {
		const d = doc(p(t('see '), { type: 'paperLink', attrs: { page: 2 } }, t(' here')), p(t('end')), p(t('ing')));
		expect(findMatches(d, 'see  here')).toEqual([]);
		expect(findMatches(d, 'ending')).toEqual([]);
		expect(found(d, 'here')).toEqual(['here']);
	});

	it('nothing for an empty query; overlapping repeats counted once each', () => {
		const d = doc(p(t('aaaa')));
		expect(findMatches(d, '')).toEqual([]);
		expect(found(d, 'aa')).toEqual(['aa', 'aa']);
	});
});
