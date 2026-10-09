import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryFs } from '#lib/onboarding/memory-fs.js';
import type { FeedPaper, Paper } from '#lib/types.js';

const lib = vi.hoisted(() => ({
	repo: null as { fs: unknown } | null,
	papers: [] as Paper[],
	get: (id: string) => lib.papers.find((p) => p.id === id),
	importArxiv: vi.fn(),
	update: vi.fn()
}));
const toasts = vi.hoisted(() => [] as { text: string; kind?: string; action?: { label: string } }[]);
vi.mock('#lib/library.svelte.js', () => ({ library: lib }));
vi.mock('#lib/components/Toasts.svelte', () => ({ toast: (text: string, kind?: string, action?: { label: string }) => toasts.push({ text, kind, action }) }));
vi.mock('#lib/windows.js', () => ({ openPaper: vi.fn() }));
const plat = vi.hoisted(() => ({ pickArxivFetchDir: vi.fn(), readArxivFetch: vi.fn() }));
vi.mock('#lib/platform/index.js', () => ({ platform: plat }));

import { settings } from '#lib/settings.svelte.js';
import type { ArxivFetchExport } from './import';
import { feed } from './feed.svelte';
import { FeedStore } from './store';

const paper: FeedPaper = { id: '2610.00001', title: 'Fusing kernels', authors: [], abstract: '', categories: ['cs.PL'], topics: ['mlir', 'operator-fusion'], published: '2026-10-01', priority: 1, firstSeen: '' };

beforeEach(async () => {
	const fs = new MemoryFs();
	lib.repo = { fs };
	lib.papers = [];
	lib.importArxiv.mockReset();
	lib.update.mockReset();
	toasts.length = 0;
	plat.pickArxivFetchDir.mockReset();
	plat.readArxivFetch.mockReset();
	settings.set('feedToolDir', '');
	await new FeedStore(fs as never).upsert([paper]);
	feed.loaded = false;
	await feed.load();
});

describe('feed actions', () => {
	it('add: into the library, its topics as tags, the feed links to it', async () => {
		lib.importArxiv.mockResolvedValue({ id: 'fusing-kernels', existed: false });
		await feed.add(feed.papers[0]);
		expect(lib.importArxiv).toHaveBeenCalledWith('2610.00001');
		const patch = lib.update.mock.calls[0][1] as (cur: Partial<Paper>) => Partial<Paper>;
		expect(patch({ tags: ['mlir', 'mine'] }).tags).toEqual(['mlir', 'mine', 'operator-fusion']);
		expect(feed.papers[0].added).toBe('fusing-kernels');
		expect((await feed.store!.readAll())[0].added).toBe('fusing-kernels');
		expect(toasts.at(-1)).toMatchObject({ text: 'Added to your library', action: { label: 'Open' } });
		expect(feed.adding.size).toBe(0);
	});

	it('add: a failed download says so, and links nothing', async () => {
		lib.importArxiv.mockRejectedValue(new Error('arXiv 2610.00001: HTTP 503'));
		await feed.add(feed.papers[0]);
		expect(feed.papers[0].added).toBeUndefined();
		expect(toasts.at(-1)).toMatchObject({ kind: 'error' });
		expect(toasts.at(-1)!.text).toContain('HTTP 503');
	});

	it('dismiss, then undo', async () => {
		await feed.dismiss(feed.papers[0]);
		expect(feed.papers[0].dismissed).toBeTruthy();
		expect(feed.visible).toHaveLength(0);
		expect(toasts.at(-1)).toMatchObject({ text: 'Dismissed', action: { label: 'Undo' } });
		await feed.restore(feed.papers[0]);
		expect(feed.papers[0].dismissed).toBeUndefined();
		expect((await feed.store!.readAll())[0].dismissed).toBeUndefined();
	});

	it('a paper already in the library (by arXiv id) counts as added', () => {
		lib.papers = [{ id: 'mine', title: 'x', added: '', arxiv: '2610.00001' } as Paper];
		expect(feed.inLibrary(feed.papers[0])?.id).toBe('mine');
	});
});

describe('refresh from arxiv_fetch', () => {
	const row = (arxivId: string, priority: number) => ({ arxivId, version: 'v1', title: `Paper ${arxivId}`, authors: 'Ada Lovelace', abstract: '', categories: 'cs.PL', topics: 'mlir', published: '2026-10-08T00:00:00Z', priority, rationale: 'why', scoredAt: null, scorerModel: 'sonnet', firstSeen: '2026-10-09T00:00:00Z', dismissed: false, dismissedAt: null });
	const run: ArxivFetchExport = { config: { profile: 'compilers' }, papers: [row('2610.00001', 4), row('2610.00009', 1)], runs: [] };

	it('the first time asks for the folder (kept), then brings in the new papers and settings', async () => {
		plat.pickArxivFetchDir.mockResolvedValue('/tools/arxiv');
		plat.readArxivFetch.mockResolvedValue(run);
		await feed.dismiss(feed.papers[0]);
		await feed.refresh();
		expect(plat.readArxivFetch).toHaveBeenCalledWith('/tools/arxiv');
		expect(settings.values.feedToolDir).toBe('/tools/arxiv');
		expect(feed.papers.map((p) => p.id).sort()).toEqual(['2610.00001', '2610.00009']);
		// Decided here: kept (the tool's own score of a known paper doesn't replace ours either).
		const known = feed.papers.find((p) => p.id === '2610.00001')!;
		expect(known.dismissed).toBeTruthy();
		expect(known.priority).toBe(1);
		expect(feed.config?.profile).toBe('compilers');
		expect(feed.state?.refreshed?.added).toBe(1);
		expect(toasts.at(-1)?.text).toBe('1 new paper from arxiv_fetch');

		// Next time: no question.
		await feed.refresh();
		expect(plat.pickArxivFetchDir).toHaveBeenCalledTimes(1);
		expect(toasts.at(-1)?.text).toBe('No new papers from arxiv_fetch');
	});

	it('nothing happens when the folder isn’t chosen; a read error offers to choose another', async () => {
		plat.pickArxivFetchDir.mockResolvedValue(null);
		await feed.refresh();
		expect(plat.readArxivFetch).not.toHaveBeenCalled();
		settings.set('feedToolDir', '/gone');
		plat.readArxivFetch.mockRejectedValue('No arxiv.db in /gone');
		await feed.refresh();
		expect(toasts.at(-1)).toMatchObject({ kind: 'error', action: { label: 'Choose folder' } });
		expect(feed.refreshing).toBe(false);
	});
});
