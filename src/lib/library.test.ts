import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HfLinks, PaperPatch } from './types';

const hf = vi.hoisted(() => ({ result: null as HfLinks | null }));
const extracted = vi.hoisted(() => ({ meta: {} as PaperPatch }));
vi.mock('./huggingface', () => ({ fetchHfPaper: async () => hf.result }));
vi.mock('./extract', async (original) => ({ ...(await original<typeof import('./extract')>()), extractMetadata: async () => extracted.meta }));

import { library } from './library.svelte';
import { MemoryFs } from './onboarding/memory-fs';
import type { Platform } from './platform';
import { Repo } from './repo';

const enc = new TextEncoder();
const dec = new TextDecoder();
const PDF = enc.encode('%PDF-1.7 test');
const platform = { kind: 'web', onDisk: false } as unknown as Platform;

let fs: MemoryFs;
let repo: Repo;
const json = async (path: string) => JSON.parse(dec.decode((await fs.read(path))!));
/** Another window, the extension or an agent edits paper.json behind the app's back. */
const editOnDisk = async (id: string, patch: Record<string, unknown>) => fs.write(`papers/${id}/paper.json`, enc.encode(JSON.stringify({ ...(await json(`papers/${id}/paper.json`)), ...patch })));

beforeEach(async () => {
	fs = new MemoryFs();
	repo = new Repo(fs, platform);
	await repo.init();
	library.repo = repo;
	library.papers = [];
	hf.result = null;
	extracted.meta = {};
});

describe('Hugging Face refresh', () => {
	it('adds its links to the ones on disk, never replacing them', async () => {
		const p = await repo.add(PDF, { title: 'A paper with a long title', arxiv: '2401.12345', links: { github: ['https://github.com/a/old'] } });
		await library.reload();
		// Added since the library loaded the paper (the extension, the user, an agent).
		await editOnDisk(p.id, { links: { github: ['https://github.com/a/old'], other: ['https://example.com/x.pdf'], project: 'https://mine.example' } });
		hf.result = { page: 'https://huggingface.co/papers/2401.12345', github: 'https://github.com/a/official/', project: 'https://theirs.example' };
		await library.refreshHf(p.id, { force: true });
		const links = (await json(`papers/${p.id}/paper.json`)).links;
		expect(links).toEqual({ github: ['https://github.com/a/official', 'https://github.com/a/old'], other: ['https://example.com/x.pdf'], project: 'https://mine.example' });
		expect(library.get(p.id)?.links).toEqual(links);
	});

	it('only dates the lookup when nothing is new', async () => {
		const p = await repo.add(PDF, { title: 'A paper with a long title', arxiv: '2401.12345', links: { github: ['https://github.com/a/b'] } });
		await library.reload();
		await editOnDisk(p.id, { links: { github: ['https://github.com/a/b'], other: ['https://x.example'] } });
		hf.result = { github: 'https://github.com/A/B/' };
		await library.refreshHf(p.id, { force: true });
		const meta = await json(`papers/${p.id}/paper.json`);
		expect(meta.links).toEqual({ github: ['https://github.com/a/b'], other: ['https://x.example'] });
		expect(meta.hf.checked).toBeTypeOf('string');
	});
});

describe('Refresh metadata', () => {
	it('merges the links found in the PDF into the paper’s', async () => {
		const p = await repo.add(PDF, { title: 'Old title', links: { other: ['https://kept.example'] } });
		await library.reload();
		await editOnDisk(p.id, { links: { other: ['https://kept.example'], huggingface: ['https://huggingface.co/m'] } });
		extracted.meta = { title: 'New title', links: { github: ['https://github.com/x/y'] } };
		await library.refreshMetadata(p.id);
		const meta = await json(`papers/${p.id}/paper.json`);
		expect(meta.title).toBe('New title');
		expect(meta.links).toEqual({ other: ['https://kept.example'], huggingface: ['https://huggingface.co/m'], github: ['https://github.com/x/y'] });
	});
});

describe('import', () => {
	const file = (name: string, text: string) => new File([enc.encode(text)], name, { type: 'application/pdf' });

	it('refuses a web page saved as .pdf, accepts a PDF with junk before its header', async () => {
		const ids = await library.import([file('paywall.pdf', '<!doctype html><html>Sign in</html>'), file('ok.pdf', '\n\n  %PDF-1.4 body')]);
		expect(ids).toHaveLength(1);
		const papers = await repo.listPapers();
		expect(papers.map((p) => p.title)).toEqual(['ok']);
	});
});

describe('reading a hand-edited paper.json', () => {
	it('survives wrong field types', async () => {
		const p = await repo.add(PDF, { title: 'T' });
		await editOnDisk(p.id, { date: 2017, year: '2017', opened: 5, links: { github: 'https://github.com/a/b', project: 3 } });
		await library.reload();
		const shown = library.get(p.id)!;
		expect(shown.date).toBe('2017');
		expect(shown.year).toBe(2017);
		expect(shown.opened).toBeUndefined();
		expect(shown.links).toEqual({ github: ['https://github.com/a/b'] });
		// Sorting by publication date compares strings.
		expect(library.filtered.map((x) => x.id)).toEqual([p.id]);
		// A function patch sees the normalized paper.
		await library.update(p.id, (cur) => ({ links: { ...cur.links, other: ['https://o.example'] } }));
		expect((await json(`papers/${p.id}/paper.json`)).links).toEqual({ github: ['https://github.com/a/b'], other: ['https://o.example'] });
	});
});
