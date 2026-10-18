import { describe, expect, it } from 'vitest';
import { normalizePaper } from '#lib/repo.js';
import { buildTurn, citationTarget, fingerprint, linkCitations, notebookSystemPrompt, notesAndHighlights, parseContext } from './chat';

const attention = normalizePaper('2017-attention', { title: 'Attention Is All You Need', authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar'], year: 2017 });
const resnet = normalizePaper('2015-resnet', { title: 'Deep Residual Learning', authors: ['Kaiming He'], year: 2015 });

describe('a question as sent', () => {
	it('is the question alone when nothing else is new', () => {
		expect(buildTurn({ question: 'And then?', added: [] })).toBe('And then?');
	});

	it('brings the notebook text, the papers added and a summary first', () => {
		const turn = buildTurn({
			question: 'Which is better?',
			summary: 'We compared two ideas.',
			notebookText: '# Idea\n\nSparse keys.',
			added: [
				{ item: { paperId: attention.id, kind: 'pdf' }, paper: attention },
				{ item: { paperId: resnet.id, kind: 'notes' }, paper: resnet, notes: '### Notes\n\nSkip connections.' }
			]
		});
		expect(turn.indexOf('## Summary')).toBeLessThan(turn.indexOf('## The notebook’s text'));
		expect(turn).toContain('Sparse keys.');
		expect(turn).toContain('## Paper added: “Attention Is All You Need” [Vaswani et al. 2017]');
		expect(turn).toContain('../../papers/2017-attention/paper.pdf');
		expect(turn).toContain('## My notes and highlights on “Deep Residual Learning” [He 2015]\n\n### Notes\n\nSkip connections.');
		expect(turn.endsWith('## Question\n\nWhich is better?')).toBe(true);
	});

	it('says when the notebook is empty, or a paper has no notes', () => {
		const turn = buildTurn({ question: 'Start?', notebookText: '  ', added: [{ item: { paperId: resnet.id, kind: 'notes' }, paper: resnet, notes: '' }] });
		expect(turn).toContain('## The notebook’s text (empty so far)');
		expect(turn).toContain('(none yet)');
	});

	it('tells Claude how to cite', () => {
		expect(notebookSystemPrompt('Sparse attention')).toContain('[Vaswani et al. 2017, p. 4]');
	});
});

describe('citations in answers', () => {
	it('link a paper in the conversation to its page', () => {
		const md = linkCitations('See [Vaswani et al. 2017, p. 4] and [He 2015, pp. 2–3], not [Someone 2020, p. 1] or [p. 5].', [attention, resnet]);
		expect(md).toContain('[Vaswani et al. 2017, p. 4](#xivly-paper-2017-attention-4)');
		expect(md).toContain('[He 2015, p. 2](#xivly-paper-2015-resnet-2)');
		expect(md).toContain('[Someone 2020, p. 1] or [p. 5]');
		expect(citationTarget('#xivly-paper-2017-attention-4')).toEqual({ paperId: '2017-attention', page: 4 });
		expect(citationTarget('#xivly-page-4')).toBeNull();
	});
});

describe('chat files', () => {
	it('keep only real context items', () => {
		expect(parseContext([{ paperId: 'a', kind: 'pdf' }, { paperId: 'b', kind: 'notes', summarized: true }, { paperId: 'c', kind: 'video' }, { kind: 'pdf' }, 'x'])).toEqual([
			{ paperId: 'a', kind: 'pdf' },
			{ paperId: 'b', kind: 'notes', summarized: true }
		]);
		expect(parseContext(undefined)).toEqual([]);
	});

	it('tell a changed notebook text by its fingerprint', () => {
		expect(fingerprint('abc')).toBe(fingerprint('abc'));
		expect(fingerprint('abc')).not.toBe(fingerprint('abd'));
	});

	it('join notes and highlights', () => {
		expect(notesAndHighlights('My view', '- “quote” (p. 2)')).toBe('### Notes\n\nMy view\n\n### Highlights\n\n- “quote” (p. 2)');
		expect(notesAndHighlights('', '')).toBe('');
	});
});
