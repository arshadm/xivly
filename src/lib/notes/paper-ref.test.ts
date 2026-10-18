import { describe, expect, it } from 'vitest';
import { normalizePaper } from '#lib/repo.js';
import type { NotesDoc } from '#lib/types.js';
import { notesToMarkdown } from './markdown';
import { paperRefMarkdown, paperRefNode, paperRefsIn, refLabel, searchPapers } from './paper-ref';

const paper = (id: string, meta: Record<string, unknown>) => normalizePaper(id, meta);
const attention = paper('2017-attention', { title: 'Attention Is All You Need', authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar'], year: 2017, arxiv: '1706.03762' });
const bert = paper('2018-bert', { title: 'BERT: Pre-training of Deep Bidirectional Transformers', authors: ['Jacob Devlin', 'Ming-Wei Chang'], year: 2018 });
const resnet = paper('2015-resnet', { title: 'Deep Residual Learning for Image Recognition', authors: ['Kaiming He'], year: 2015 });
const untitled = paper('x', { title: 'A very long title that goes on and on beyond forty characters' });

describe('refLabel', () => {
	it('names the paper by its authors and year, else its title', () => {
		expect(refLabel(attention)).toBe('Vaswani et al. 2017');
		expect(refLabel(bert)).toBe('Devlin & Chang 2018');
		expect(refLabel(resnet)).toBe('He 2015');
		expect(refLabel(untitled)).toBe('A very long title that goes on and on…');
	});
});

describe('searchPapers', () => {
	const all = [resnet, attention, bert];
	it('finds by words in any order, linked papers first, then the newest', () => {
		expect(searchPapers(all, '', new Set()).map((p) => p.id)).toEqual(['2018-bert', '2017-attention', '2015-resnet']);
		expect(searchPapers(all, '', new Set(['2015-resnet'])).map((p) => p.id)).toEqual(['2015-resnet', '2018-bert', '2017-attention']);
		expect(searchPapers(all, 'vaswani 2017', new Set()).map((p) => p.id)).toEqual(['2017-attention']);
		expect(searchPapers(all, '1706.03762', new Set()).map((p) => p.id)).toEqual(['2017-attention']);
		expect(searchPapers(all, 'deep', new Set()).map((p) => p.id)).toEqual(['2018-bert', '2015-resnet']);
		expect(searchPapers(all, '', new Set(), 1)).toHaveLength(1);
	});
});

describe('chips in a document', () => {
	const doc: NotesDoc = {
		type: 'doc',
		content: [
			{ type: 'paragraph', content: [paperRefNode(attention), { type: 'text', text: ' and ' }, paperRefNode(bert, 5.5)] },
			{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [paperRefNode(attention, 3)] }] }] }
		]
	};

	it('counts the chips per paper, in order of first mention', () => {
		expect([...paperRefsIn(doc)]).toEqual([['2017-attention', 2], ['2018-bert', 1]]);
		expect(paperRefsIn(null).size).toBe(0);
	});

	it('are links to the papers’ PDFs in notes.md', () => {
		expect(paperRefMarkdown(paperRefNode(bert, 5.5).attrs)).toBe('[Devlin & Chang 2018, p. 5](../../papers/2018-bert/paper.pdf#page=5)');
		expect(notesToMarkdown(doc)).toContain('[Vaswani et al. 2017](../../papers/2017-attention/paper.pdf) and [Devlin & Chang 2018, p. 5]');
	});
});
