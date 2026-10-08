import { describe, expect, it } from 'vitest';
import { betterAuthors, betterTitle, categoryColor, hfUnchanged, mapLimited, mergeLinks, mix, tagsByUse } from './library-utils';

describe('colors', () => {
	it('mixes hex colors', () => {
		expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
		expect(mix('#102030', '#102030', 0.3)).toBe('#102030');
	});
	it('gives custom colors palette-like shades, and unknown names stone', () => {
		const c = categoryColor('#3366cc');
		expect(c.accent).toBe('#3366cc');
		expect(c.light).toMatch(/^#[0-9a-f]{6}$/);
		expect(categoryColor('sage').name).toBe('sage');
		expect(categoryColor('nope' as never).name).toBe('stone');
		expect(categoryColor(undefined).name).toBe('stone');
	});
});

describe('betterTitle / betterAuthors', () => {
	it('takes arXiv’s title for a mis-cased or non-title one only', () => {
		expect(betterTitle('Bdh-Cq: In-Context Learning', 'BDH-CQ: In-Context Learning')).toBe('BDH-CQ: In-Context Learning');
		expect(betterTitle('working', 'A Real Title')).toBe('A Real Title');
		expect(betterTitle('My own longer title here', 'A Different Official Title')).toBeUndefined();
		expect(betterTitle('Same', 'Same')).toBeUndefined();
	});
	it('takes arXiv’s authors when the PDF’s are missing or garbled', () => {
		expect(betterAuthors(undefined, ['Ada Lovelace'])).toEqual(['Ada Lovelace']);
		expect(betterAuthors(['ADA LOVELACE'], ['Ada Lovelace'])).toEqual(['Ada Lovelace']);
		expect(betterAuthors(['Ada Lovelace'], ['A. Lovelace'])).toBeUndefined();
	});
});

describe('hfUnchanged', () => {
	const p = { links: { project: 'https://x.y' } };
	it('is true when nothing but the lookup date changes', () => {
		expect(hfUnchanged(p, { links: { project: 'https://x.y' }, title: undefined, authors: undefined }, { page: 'u' }, { page: 'u' })).toBe(true);
		expect(hfUnchanged({ links: undefined }, { links: {}, title: undefined, authors: undefined }, {}, {})).toBe(true);
	});
	it('is false on a better title, new links or new data', () => {
		expect(hfUnchanged(p, { links: p.links, title: 'Better' }, {}, {})).toBe(false);
		expect(hfUnchanged(p, { links: { project: 'https://x.y', github: ['g'] } }, {}, {})).toBe(false);
		expect(hfUnchanged(p, { links: p.links }, { upvotes: 3 }, { upvotes: 2 })).toBe(false);
	});
});

describe('mapLimited', () => {
	it('keeps the order and never runs more than the limit', async () => {
		let running = 0;
		let peak = 0;
		const out = await mapLimited([5, 1, 4, 2, 3], 2, async (n) => {
			peak = Math.max(peak, ++running);
			await new Promise((r) => setTimeout(r, n));
			running--;
			return n * 10;
		});
		expect(out).toEqual([50, 10, 40, 20, 30]);
		expect(peak).toBe(2);
	});
});

describe('mergeLinks', () => {
	it('adds new links first, keeps every existing one', () => {
		const current = { github: ['https://github.com/a/b'], other: ['https://o.example'], project: 'https://mine.example' };
		expect(mergeLinks(current, { github: ['https://github.com/c/d', 'https://GitHub.com/a/b/'], project: 'https://theirs.example', huggingface: ['https://huggingface.co/m'] })).toEqual({
			github: ['https://github.com/c/d', 'https://github.com/a/b'],
			other: ['https://o.example'],
			project: 'https://mine.example',
			huggingface: ['https://huggingface.co/m']
		});
	});
	it('returns the same object when nothing is new', () => {
		const current = { github: ['https://github.com/a/b'] };
		expect(mergeLinks(current, { github: ['https://github.com/a/b/'] })).toBe(current);
		expect(mergeLinks(current, undefined)).toBe(current);
		expect(mergeLinks(undefined, undefined)).toBeUndefined();
		expect(mergeLinks(undefined, { project: 'https://p.example' })).toEqual({ project: 'https://p.example' });
	});
});

describe('tagsByUse', () => {
	it('puts the most used tags first, ties alphabetical, declared ones too', () => {
		const papers = [{ tags: ['b', 'c'] }, { tags: ['c', 'a'] }, { tags: ['c', 'b'] }, {}];
		expect(tagsByUse(papers, ['unused', 'a'])).toEqual(['c', 'b', 'a', 'unused']);
		expect(tagsByUse([])).toEqual([]);
	});
});
