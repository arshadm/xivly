import { describe, expect, it } from 'vitest';
import { rankAt, rankBetween, readingNow, upNext } from './reading';
import type { Paper } from './types';

const paper = (id: string, extra: Partial<Paper> = {}): Paper => ({ id, title: id, added: '2026-01-01', ...extra });

describe('the reading list', () => {
	it('reading now: marked, not read, most recently opened first', () => {
		const papers = [paper('a', { reading: '2026-10-01', opened: '2026-10-02' }), paper('b', { reading: '2026-10-05' }), paper('c', { reading: '2026-10-01', read: '2026-10-06' }), paper('d', { opened: '2026-10-09' })];
		expect(readingNow(papers).map((p) => p.id)).toEqual(['b', 'a']);
	});

	it('up next: in queue order, without the ones being read or read', () => {
		const papers = [paper('a', { queue: 2 }), paper('b', { queue: -1 }), paper('c', { queue: 0, reading: 'x' }), paper('d', { queue: 1, read: 'x' }), paper('e')];
		expect(upNext(papers).map((p) => p.id)).toEqual(['b', 'a']);
	});

	it('ranks: at the top, at the end, between', () => {
		expect(rankBetween(undefined, undefined)).toBe(0);
		expect(rankBetween(undefined, 3)).toBe(2);
		expect(rankBetween(3, undefined)).toBe(4);
		expect(rankBetween(1, 2)).toBe(1.5);
		const queue = [paper('a', { queue: 0 }), paper('b', { queue: 1 }), paper('c', { queue: 2 })];
		expect(rankAt(queue, 'c', 0)).toBe(-1);
		expect(rankAt(queue, 'a', 1)).toBe(1.5);
		expect(rankAt(queue, 'a', 9)).toBe(3);
		expect(rankAt(queue, 'new', 3)).toBe(3);
	});
});
