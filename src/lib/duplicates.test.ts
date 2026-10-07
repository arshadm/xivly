import { describe, expect, it } from 'vitest';
import { findDuplicate, sha256 } from './duplicates';
import type { Paper } from './types';

const paper = (id: string, extra: Partial<Paper> = {}): Paper => ({ id, title: id, added: '2026-01-01', ...extra });

describe('findDuplicate', () => {
	const papers = [paper('a', { sha256: 'abc' }), paper('b', { arxiv: '2401.12345' }), paper('c', { doi: '10.1000/XYZ' })];
	it('matches by file hash, arXiv id or DOI (any case)', () => {
		expect(findDuplicate(papers, { sha256: 'abc' })?.id).toBe('a');
		expect(findDuplicate(papers, { arxiv: '2401.12345' })?.id).toBe('b');
		expect(findDuplicate(papers, { doi: '10.1000/xyz' })?.id).toBe('c');
	});
	it('needs a value to match on', () => {
		expect(findDuplicate([paper('d')], {})).toBeUndefined();
		expect(findDuplicate(papers, { sha256: 'other', arxiv: '2401.00000' })).toBeUndefined();
	});
});

describe('sha256', () => {
	it('hashes bytes as hex', async () => {
		expect(await sha256(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
	});
});
