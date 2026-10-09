import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';
import { PaperLink, quoteContent, toAnchor } from './paper-link';

// The notes schema, without an editor (no DOM in unit tests).
const schema = getSchema([StarterKit, PaperLink]);
const chip = (attrs: object) => schema.nodeFromJSON({ type: 'paperLink', attrs });
/** What the chip renders: [tag, attributes, text]. */
const rendered = (attrs: object) => {
	const node = chip(attrs);
	return node.type.spec.toDOM!(node) as [string, Record<string, string>, string];
};

describe('PaperLink', () => {
	it('round-trips through notes.json', () => {
		const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'See ' }, { type: 'paperLink', attrs: { page: 5.25, label: null } }] }] };
		const node = schema.nodeFromJSON(doc);
		node.check();
		expect(node.toJSON()).toEqual(doc);
	});

	it('shows its page, or its label', () => {
		const [tag, attrs, text] = rendered({ page: 5.25 });
		expect(tag).toBe('span');
		expect(attrs['data-page']).toBe('5.25');
		expect(text).toBe('p. 5');
		expect(rendered({ page: 3, label: 'Fig. 2' })[2]).toBe('Fig. 2');
	});

	it('a quote: the text (whitespace tidied), its chip, then a line to write on', () => {
		const doc = schema.nodeFromJSON({ type: 'doc', content: quoteContent('  Reading papers\n should be calm. ', { page: 1.4 }) });
		doc.check();
		const [quote, after] = doc.toJSON().content;
		expect(quote.type).toBe('blockquote');
		expect(quote.content[0].content).toEqual([
			{ type: 'text', text: 'Reading papers should be calm. ' },
			{ type: 'paperLink', attrs: { page: 1.4, label: null } }
		]);
		expect(after.type).toBe('paragraph');
	});
});

describe('toAnchor', () => {
	it('falls back to page 1 for attributes edited into nonsense', () => {
		expect(toAnchor({ page: 4, label: 'x' })).toEqual({ page: 4, label: 'x' });
		expect(toAnchor({ page: 'four' })).toEqual({ page: 1 });
	});
});
