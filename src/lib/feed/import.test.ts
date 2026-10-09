import { describe, expect, it } from 'vitest';
import { MemoryFs } from '#lib/onboarding/memory-fs.js';
import { configFromArxivFetch, importArxivFetch, papersFromArxivFetch, type ArxivFetchExport } from './import';
import { FeedStore } from './store';

const row = (over: Partial<ArxivFetchExport['papers'][number]> = {}): ArxivFetchExport['papers'][number] => ({
	arxivId: '2610.00001',
	version: 'v2',
	title: 'Fusing kernels',
	authors: 'Ada Lovelace, Alan Turing',
	abstract: 'We fuse.',
	categories: 'cs.PL, cs.LG',
	topics: 'operator-fusion, mlir',
	published: '2026-10-01T00:00:00Z',
	priority: 1,
	rationale: 'On point.',
	scoredAt: '2026-10-02T00:00:00Z',
	scorerModel: 'sonnet',
	firstSeen: '2026-10-02T00:00:00Z',
	dismissed: false,
	dismissedAt: null,
	...over
});
const data = (papers: ArxivFetchExport['papers'], config: unknown = null): ArxivFetchExport => ({
	config,
	papers,
	runs: [{ startedAt: 's', finishedAt: 'f', windowFrom: '2026-09-25T00:00:00Z', windowTo: '2026-10-02T00:00:00Z', nFound: 5, nNew: 5, nScored: 5, status: 'ok' }]
});

describe('arxiv_fetch import', () => {
	it('rows become feed papers: lists split, topics sorted, day kept, dismissals dated', () => {
		const [p, d] = papersFromArxivFetch(data([row(), row({ arxivId: '2610.00002', dismissed: true, dismissedAt: null, priority: null })]), 'NOW');
		expect(p).toMatchObject({ id: '2610.00001', version: 'v2', authors: ['Ada Lovelace', 'Alan Turing'], categories: ['cs.PL', 'cs.LG'], topics: ['mlir', 'operator-fusion'], published: '2026-10-01', priority: 1, scorer: 'sonnet' });
		expect(d).toMatchObject({ dismissed: 'NOW', priority: undefined });
	});

	it('rows that aren’t papers are left out', () => {
		expect(papersFromArxivFetch(data([row({ arxivId: 'nonsense' }), row({ published: null })]))).toEqual([]);
	});

	it('the tool’s config.json as feed settings', () => {
		const c = configFromArxivFetch({ categories: ['cs.PL'], topics: { mlir: ['MLIR', 2] }, search_field: 'abs', profile: 'compilers', priority_rubric: { '1': 'now' }, scorer: { model: 'opus', batch_size: 10 } });
		expect(c).toEqual({ categories: ['cs.PL'], topics: { mlir: ['MLIR'] }, searchField: 'abs', profile: 'compilers', rubric: { '1': 'now' }, model: 'opus', batchSize: 10 });
		expect(configFromArxivFetch(null)).toBeNull();
	});

	it('into the feed: papers, the next window, and settings when asked; twice is harmless', async () => {
		const store = new FeedStore(new MemoryFs());
		const d = data([row(), row({ arxivId: '2609.00009', published: '2026-09-30T00:00:00Z', dismissed: true, dismissedAt: 'D' })], { categories: ['cs.PL'], profile: 'compilers' });
		expect(await importArxivFetch(store, d, true)).toEqual({ papers: 2, added: 2, scored: 2, dismissed: 1, config: true });
		expect(await store.months()).toEqual(['2026-10', '2026-09']);
		expect((await store.readState()).lastTo).toBe('2026-10-02T00:00:00Z');
		expect((await store.readConfig()).profile).toBe('compilers');
		expect((await importArxivFetch(store, d, false)).added).toBe(0);
		expect((await store.readState()).runs).toHaveLength(1);
	});
});
