import { describe, expect, it } from 'vitest';
import type { Reference } from 'svelte-pdf-mini';
import { referenceAt, referenceUrl } from './reference-url';

const ref = (parsed: Partial<Reference['parsed']>, fields: Partial<Reference> = {}) =>
	({ raw: 'A. Vaswani et al. Attention is all you need. NeurIPS 2017.', parsed: { authors: [], surnames: [], ...parsed }, page: 9, rect: [50, 100, 300, 120], quads: [], ...fields }) as Reference;

describe('referenceUrl', () => {
	it('arXiv first, then the DOI, then its own link', () => {
		expect(referenceUrl(ref({ arxivId: '1706.03762', doi: '10.5555/x', url: 'https://x.org' }))).toBe('https://arxiv.org/abs/1706.03762');
		expect(referenceUrl(ref({ arxivId: 'cs/0112017v1' }))).toBe('https://arxiv.org/abs/cs/0112017v1');
		expect(referenceUrl(ref({ doi: 'https://doi.org/10.1145/3292500.3330701', url: 'https://x.org' }))).toBe('https://doi.org/10.1145/3292500.3330701');
		expect(referenceUrl(ref({ url: 'https://github.com/a/b' }))).toBe('https://github.com/a/b');
	});

	it('else a search for its title and first authors, or its text', () => {
		const q = (u: string) => new URL(u).searchParams.get('q');
		const u = referenceUrl(ref({ title: 'Attention is all you need', surnames: ['Vaswani', 'Shazeer', 'Parmar', 'Uszkoreit'], url: 'ftp://nope' }));
		expect(u).toMatch(/^https:\/\/www\.google\.com\/search\?q=/);
		expect(q(u)).toBe('"Attention is all you need" Vaswani Shazeer Parmar');
		expect(q(referenceUrl(ref({ title: 'Untitled work', authors: ['Ada Lovelace'] })))).toBe('"Untitled work" Ada Lovelace');
		expect(q(referenceUrl(ref({})))).toBe('A. Vaswani et al. Attention is all you need. NeurIPS 2017.');
	});
});

describe('referenceAt', () => {
	it('finds the entry under a point of its page', () => {
		const refs = [ref({}, { id: 'a' }), ref({}, { id: 'b', rect: [50, 130, 300, 150] })];
		expect(referenceAt(refs, 9, [100, 140])?.id).toBe('b');
		expect(referenceAt(refs, 9, [100, 110])?.id).toBe('a');
		expect(referenceAt(refs, 8, [100, 110])).toBeUndefined();
		expect(referenceAt(refs, 9, [400, 110])).toBeUndefined();
	});
});
