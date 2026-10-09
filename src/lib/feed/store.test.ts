import { describe, expect, it } from 'vitest';
import { MemoryFs } from '#lib/onboarding/memory-fs.js';
import type { FeedPaper } from '#lib/types.js';
import { mergeFeedPaper, normalizeFeedConfig, normalizeFeedPaper, withRun } from './model';
import { FeedStore } from './store';

const enc = new TextEncoder();
const dec = new TextDecoder();
const paper = (id: string, published: string, more: Partial<FeedPaper> = {}): FeedPaper => ({ id, title: `Paper ${id}`, authors: ['A. Author'], abstract: 'About compilers.', categories: ['cs.PL'], topics: ['mlir'], published, firstSeen: '2026-10-01T00:00:00Z', ...more });
const json = async (fs: MemoryFs, path: string) => JSON.parse(dec.decode((await fs.read(path))!));

describe('feed files', () => {
	it('config: defaults when missing; hand edits normalized', () => {
		const c = normalizeFeedConfig(null);
		expect(c).toMatchObject({ categories: [], topics: {}, searchField: 'abs', model: 'sonnet', batchSize: 20 });
		expect(Object.keys(c.rubric)).toEqual(['1', '2', '3', '4', '5']);
		const e = normalizeFeedConfig({ categories: ['cs.PL', 3, ' '], topics: { mlir: ['MLIR', 1], ' ': ['x'] }, searchField: 'nope', batchSize: 0, rubric: { '1': 'Read now', '9': 'x' }, mine: true });
		expect(e).toMatchObject({ categories: ['cs.PL'], topics: { mlir: ['MLIR'] }, searchField: 'abs', batchSize: 20, mine: true });
		expect(e.rubric['1']).toBe('Read now');
	});

	it('papers: invalid entries are refused, wrong types read as absent', () => {
		expect(normalizeFeedPaper({ id: 'not an id', title: 'x', published: '2026-10-01' })).toBeNull();
		expect(normalizeFeedPaper({ id: '2610.01234', title: '', published: '2026-10-01' })).toBeNull();
		expect(normalizeFeedPaper({ id: '2610.01234', title: 'T', published: 'Oct 1' })).toBeNull();
		expect(normalizeFeedPaper({ id: '2610.01234', title: 'T', published: '2026-10-01T00:00:00Z', priority: 7, authors: 'x' })).toMatchObject({ published: '2026-10-01', priority: undefined, authors: [] });
	});

	it('a paper found again keeps its score, dismissal and library link; topics merge', () => {
		const stored = paper('2610.00001', '2026-10-01', { topics: ['mlir'], priority: 2, rationale: 'why', dismissed: '2026-10-02', added: 'lib-id', firstSeen: 'first' });
		const found = paper('2610.00001', '2026-10-01', { topics: ['risc-v'], version: 'v2', title: 'Retitled', firstSeen: 'later' });
		expect(mergeFeedPaper(stored, found)).toMatchObject({ topics: ['mlir', 'risc-v'], version: 'v2', title: 'Retitled', priority: 2, rationale: 'why', dismissed: '2026-10-02', added: 'lib-id', firstSeen: 'first' });
	});

	it('runs: the last successful window end is where the next check starts', () => {
		let s = withRun({ version: 1, runs: [] }, { started: 'a', from: '2026-10-01', to: '2026-10-05', found: 3, new: 3, scored: 3, status: 'ok' });
		s = withRun(s, { started: 'b', from: '2026-10-05', to: '2026-10-07', found: 0, new: 0, scored: 0, status: 'failed' });
		expect(s.lastTo).toBe('2026-10-05');
		expect(s.runs.map((r) => r.started)).toEqual(['a', 'b']);
	});
});

describe('FeedStore', () => {
	it('papers by month; upsert counts new ones and merges known ones', async () => {
		const fs = new MemoryFs();
		const store = new FeedStore(fs);
		const first = await store.upsert([paper('2609.00001', '2026-09-30'), paper('2610.00001', '2026-10-01')]);
		expect(first.added).toBe(2);
		expect(await store.months()).toEqual(['2026-10', '2026-09']);
		await store.update({ id: '2610.00001', published: '2026-10-01' }, { priority: 1, rationale: 'on point' });
		const again = await store.upsert([paper('2610.00001', '2026-10-01', { topics: ['risc-v'] })]);
		expect(again.added).toBe(0);
		const [p] = await store.readMonth('2026-10');
		expect(p).toMatchObject({ priority: 1, rationale: 'on point', topics: ['mlir', 'risc-v'] });
		expect((await store.readAll()).map((x) => x.id)).toEqual(['2610.00001', '2609.00001']);
	});

	it('dismiss and restore; entries it can’t read stay in the file untouched', async () => {
		const fs = new MemoryFs();
		const store = new FeedStore(fs);
		await fs.write('.xivly/feed/papers/2026-10.json', enc.encode(JSON.stringify({ version: 1, papers: { odd: { title: 'hand-written' } } })));
		await store.upsert([paper('2610.00001', '2026-10-01')]);
		await store.update({ id: '2610.00001', published: '2026-10-01' }, { dismissed: '2026-10-09T10:00:00Z' });
		expect((await store.readMonth('2026-10'))[0].dismissed).toBe('2026-10-09T10:00:00Z');
		await store.update({ id: '2610.00001', published: '2026-10-01' }, { dismissed: undefined });
		const file = await json(fs, '.xivly/feed/papers/2026-10.json');
		expect('dismissed' in file.papers['2610.00001']).toBe(false);
		expect(file.papers.odd).toEqual({ title: 'hand-written' });
		expect(await store.update({ id: '2610.09999', published: '2026-10-01' }, { dismissed: 'x' })).toBeNull();
	});

	it('an unreadable file is never written over', async () => {
		const fs = new MemoryFs();
		const store = new FeedStore(fs);
		await fs.write('.xivly/feed/papers/2026-10.json', enc.encode('{ broken'));
		await expect(store.upsert([paper('2610.00001', '2026-10-01')])).rejects.toThrow(/not valid JSON/);
		expect(dec.decode((await fs.read('.xivly/feed/papers/2026-10.json'))!)).toBe('{ broken');
	});

	it('config and state round-trip, keeping unknown fields', async () => {
		const fs = new MemoryFs();
		const store = new FeedStore(fs);
		await fs.write('.xivly/feed/config.json', enc.encode(JSON.stringify({ note: 'mine' })));
		await store.writeConfig({ ...(await store.readConfig()), categories: ['cs.PL'] });
		expect(await json(fs, '.xivly/feed/config.json')).toMatchObject({ note: 'mine', categories: ['cs.PL'] });
		await store.updateState((s) => withRun(s, { started: 'a', from: 'f', to: 't', found: 1, new: 1, scored: 0, status: 'ok' }));
		expect((await store.readState()).lastTo).toBe('t');
		await store.updateState((s) => ({ ...s, refreshed: { at: '2026-10-09T12:00:00Z', added: 3 } }));
		expect((await store.readState()).refreshed).toEqual({ at: '2026-10-09T12:00:00Z', added: 3 });
	});
});
