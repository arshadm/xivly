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
