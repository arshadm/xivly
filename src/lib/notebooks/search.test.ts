import { describe, expect, it } from 'vitest';
import { mentionedPapers, plainText, searchNotebooks } from './search';
import { normalizeNode } from './tree';

const md = `<!-- Notes for the notebook. Edit in xivly. -->

# Sparse attention

See [Vaswani et al. 2017 · Attention…](../../papers/2017-attention/paper.pdf) and [He 2015, p. 3](../../papers/2015-resnet/paper.pdf#page=3), then **top-k** routing [again](../../papers/2017-attention/paper.pdf#page=4).

- a [link](https://example.com) and ![a figure](images/a.png)
`;

describe('mentionedPapers', () => {
	it('counts the links to papers’ PDFs', () => {
		expect([...mentionedPapers(md)]).toEqual([
			['2017-attention', 2],
			['2015-resnet', 1]
		]);
		expect(mentionedPapers('[x](../../papers/2401.00001v2%20b/paper.pdf)').get('2401.00001v2 b')).toBe(1);
		expect(mentionedPapers('no links').size).toBe(0);
	});
});

describe('plainText', () => {
	it('reads as a line of text', () => {
		expect(plainText(md)).toBe('Sparse attention See Vaswani et al. 2017 · Attention… and He 2015, p. 3, then top-k routing again. a link and a figure');
	});
});

describe('searchNotebooks', () => {
	const node = (id: string, title: string, updated: string, kind = 'notebook') => normalizeNode(id, { title, updated, kind });
	const nodes = [node('a', 'Routing ideas', '2026-01-01'), node('b', 'Sparse attention', '2026-03-01'), node('c', 'Old', '2026-02-01'), node('f', 'Top-k folder', '2026-04-01', 'folder')];
	const texts = new Map([
		['b', md],
		['c', 'Nothing about routing here, or top-K either.']
	]);

	it('finds the phrase in titles first, then text, latest changed first; folders never', () => {
		const found = searchNotebooks(nodes, texts, 'top-k');
		expect(found.map((m) => m.node.id)).toEqual(['b', 'c']);
		expect(found[0].snippet).toMatchObject({ match: 'top-k' });
		expect(found[1].snippet?.match).toBe('top-K');
		expect(searchNotebooks(nodes, texts, 'routing').map((m) => m.node.id)).toEqual(['a', 'b', 'c']);
		expect(searchNotebooks(nodes, texts, 'routing')[0].snippet).toBeUndefined();
		expect(searchNotebooks(nodes, texts, '  ')).toEqual([]);
	});

	it('shows the words around a match, shortened', () => {
		const long = new Map([['a', `${'word '.repeat(40)}needle ${'more '.repeat(60)}`]]);
		const [m] = searchNotebooks([node('a', 'A', '1')], long, 'needle', 20);
		expect(m.snippet?.before.startsWith('…')).toBe(true);
		expect(m.snippet?.before.length).toBeLessThanOrEqual(22);
		expect(m.snippet?.after.endsWith('…')).toBe(true);
	});
});
