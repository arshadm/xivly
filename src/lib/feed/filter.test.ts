import { describe, expect, it } from 'vitest';
import type { FeedPaper } from '#lib/types.js';
import { byDay, feedTopics, filterFeed, priorityCounts, toTriage, type FeedFilter } from './filter';

const p = (id: string, published: string, priority: number | undefined, more: Partial<FeedPaper> = {}): FeedPaper => ({ id, title: `Paper ${id}`, authors: ['Ada Lovelace'], abstract: 'About fusion.', categories: ['cs.PL'], topics: ['mlir'], published, priority, firstSeen: '', ...more });
const papers = [
	p('2610.00001', '2026-10-02', 3),
	p('2610.00002', '2026-10-02', 1, { topics: ['risc-v'], rationale: 'Vector codegen' }),
	p('2610.00003', '2026-10-01', 2),
	p('2610.00004', '2026-10-01', 5),
	p('2610.00005', '2026-10-01', undefined),
	p('2610.00006', '2026-09-30', 1, { dismissed: 'x' }),
	p('2610.00007', '2026-09-30', 2, { added: 'lib-paper' })
];
const f = (o: Partial<FeedFilter> = {}): FeedFilter => ({ priorities: new Set([1, 2, 3]), topics: new Set(), query: '', sort: 'date', dismissed: false, ...o });
const ids = (ps: FeedPaper[]) => ps.map((x) => x.id.slice(-1));

describe('filterFeed', () => {
	it('P1–P3, newest day first, then by priority; dismissed hidden', () => {
		expect(ids(filterFeed(papers, f()))).toEqual(['2', '1', '3', '7']);
	});
	it('by priority, then newest', () => {
		expect(ids(filterFeed(papers, f({ sort: 'priority', priorities: new Set([1, 2, 3, 4, 5, 0]) })))).toEqual(['2', '3', '7', '1', '4', '5']);
	});
	it('topics, and every word of the search (reason and authors too)', () => {
		expect(ids(filterFeed(papers, f({ topics: new Set(['risc-v']) })))).toEqual(['2']);
		expect(ids(filterFeed(papers, f({ query: 'VECTOR codegen' })))).toEqual(['2']);
		expect(ids(filterFeed(papers, f({ query: 'lovelace fusion' })))).toHaveLength(4);
	});
	it('the dismissed list: all priorities', () => {
		expect(ids(filterFeed(papers, f({ dismissed: true, priorities: new Set() })))).toEqual(['6']);
	});
});

describe('feed helpers', () => {
	it('groups by day', () => {
		expect(byDay(filterFeed(papers, f())).map((g) => [g.day, g.papers.length])).toEqual([['2026-10-02', 2], ['2026-10-01', 1], ['2026-09-30', 1]]);
	});
	it('counts per priority, topics, and what is left to look at', () => {
		expect(priorityCounts(papers)).toEqual({ 1: 1, 2: 2, 3: 1, 5: 1, 0: 1 });
		expect(feedTopics(papers)).toEqual(['mlir', 'risc-v']);
		expect(toTriage(papers)).toEqual(3);
	});
});
