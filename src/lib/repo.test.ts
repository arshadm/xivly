import { describe, expect, it } from 'vitest';
import { MemoryFs } from './onboarding/memory-fs';
import type { Platform } from './platform';
import { merge, normalizeLibrary, normalizePaper, RemovedError, Repo, slugify } from './repo';

const enc = new TextEncoder();
const dec = new TextDecoder();
const PDF = enc.encode('%PDF-1.7 test');
const platform = { kind: 'web', onDisk: false } as unknown as Platform;

async function repo() {
	const fs = new MemoryFs();
	const r = new Repo(fs, platform);
	await r.init();
	return { fs, r };
}
const json = async (fs: MemoryFs, path: string) => JSON.parse(dec.decode((await fs.read(path))!));

describe('merge', () => {
	it('deletes on null, ignores undefined', () => {
		expect(merge({ a: 1, b: 2, c: 3 }, { a: null, b: undefined, d: 4 })).toEqual({ b: 2, c: 3, d: 4 });
	});
});

describe('slugify', () => {
	it('folds accents and punctuation', () => {
		expect(slugify('2026 Éléments: Théorie & Pratique!')).toBe('2026-elements-theorie-pratique');
	});
	it('avoids Windows device names and empty slugs', () => {
		expect(slugify('CON')).toBe('con-paper');
		expect(slugify('com1', 'category')).toBe('com1-category');
		expect(slugify('???')).toBe('paper');
	});
	it('caps the length without a trailing dash', () => {
		const s = slugify('word '.repeat(40));
		expect(s.length).toBeLessThanOrEqual(80);
		expect(s.endsWith('-')).toBe(false);
	});
});

describe('normalizePaper', () => {
	it('keeps unknown fields and fixes bad types', () => {
		const p = normalizePaper('x', { title: 42, authors: 'A, B', tags: ['a', 3, 'b'], category: null, extra: { k: 1 } });
		expect(p.title).toBe('x');
		expect(p.authors).toBeUndefined();
		expect(p.tags).toEqual(['a', 'b']);
		expect(p.category).toBeUndefined();
		expect((p as unknown as Record<string, unknown>).extra).toEqual({ k: 1 });
	});
});

describe('normalizeLibrary', () => {
	it('repairs categories and tags written by hand', () => {
		const lib = normalizeLibrary({ categories: [{ id: 'a' }, { name: 'no id' }, 'junk', { id: 'b', name: 'B', color: '#112233', x: 1 }], tags: 'oops', extra: true });
		expect(lib.categories).toEqual([
			{ id: 'a', name: 'a', color: 'stone' },
			{ id: 'b', name: 'B', color: '#112233', x: 1 }
		]);
		expect(lib.tags).toEqual([]);
		expect(lib.version).toBe(1);
		expect((lib as unknown as Record<string, unknown>).extra).toBe(true);
	});
});

describe('Repo', () => {
	it('init never overwrites existing files', async () => {
		const fs = new MemoryFs();
		await fs.write('AGENTS.md', enc.encode('mine'));
		await fs.write('.xivly/library.json', enc.encode('{"categories":[],"tags":["t"]}'));
		await new Repo(fs, platform).init();
		expect(dec.decode((await fs.read('AGENTS.md'))!)).toBe('mine');
		expect(await json(fs, '.xivly/library.json')).toEqual({ categories: [], tags: ['t'] });
	});

	it('keeps unknown fields when updating paper.json', async () => {
		const { fs, r } = await repo();
		const p = await r.add(PDF, { title: 'A paper', year: 2026 });
		await fs.write(`papers/${p.id}/paper.json`, enc.encode(JSON.stringify({ ...(await json(fs, `papers/${p.id}/paper.json`)), agentNote: 'keep me' })));
		await r.update(p.id, { tags: ['x'] });
		const meta = await json(fs, `papers/${p.id}/paper.json`);
		expect(meta.agentNote).toBe('keep me');
		expect(meta.tags).toEqual(['x']);
		expect(meta.id).toBeUndefined();
	});

	it('applies a function patch to what is on disk', async () => {
		const { fs, r } = await repo();
		const p = await r.add(PDF, { title: 'T', tags: ['a'] });
		// Another window added a tag meanwhile.
		await r.update(p.id, { tags: ['a', 'b'] });
		await r.update(p.id, (cur) => ({ tags: [...(cur.tags ?? []), 'c'] }));
		expect((await json(fs, `papers/${p.id}/paper.json`)).tags).toEqual(['a', 'b', 'c']);
	});

	it('refuses to edit a corrupt paper.json (instead of wiping it)', async () => {
		const { fs, r } = await repo();
		const p = await r.add(PDF, { title: 'T' });
		await fs.write(`papers/${p.id}/paper.json`, enc.encode('{ not json'));
		await expect(r.update(p.id, { title: 'x' })).rejects.toThrow(/not valid JSON/);
		expect(dec.decode((await fs.read(`papers/${p.id}/paper.json`))!)).toBe('{ not json');
	});

	it('gives parallel adds of the same title distinct folders', async () => {
		const { r } = await repo();
		const papers = await Promise.all(Array.from({ length: 5 }, () => r.add(PDF, { title: 'Same title', year: 2026 })));
		expect(new Set(papers.map((p) => p.id)).size).toBe(5);
		expect(papers.map((p) => p.id)).toContain('2026-same-title-3');
		expect((await r.listPapers()).length).toBe(5);
	});

	it('writes the PDF first and cleans up when adding fails', async () => {
		const { fs, r } = await repo();
		const write = fs.write.bind(fs);
		fs.write = async (path, data) => {
			if (path.endsWith('paper.json') && path.startsWith('papers/')) throw new Error('disk full');
			return write(path, data);
		};
		await expect(r.add(PDF, { title: 'Broken' })).rejects.toThrow('disk full');
		expect(await r.listPapers()).toEqual([]);
		expect(await fs.exists('papers/broken')).toBe(false);
	});

	it('refuses writes once a paper is removed (no resurrection)', async () => {
		const { fs, r } = await repo();
		const p = await r.add(PDF, { title: 'Gone' });
		await r.remove(p.id);
		await expect(r.savePdf(p.id, PDF)).rejects.toBeInstanceOf(RemovedError);
		await expect(r.touch(p.id, { position: 3 })).rejects.toBeInstanceOf(RemovedError);
		await expect(r.update(p.id, { title: 'x' })).rejects.toBeInstanceOf(RemovedError);
		expect(await fs.exists(`papers/${p.id}`)).toBe(false);
		expect(await r.listPapers()).toEqual([]);
	});

	it('refuses to save something that is not a PDF', async () => {
		const { r } = await repo();
		const p = await r.add(PDF, { title: 'T' });
		await expect(r.savePdf(p.id, enc.encode('<html>'))).rejects.toThrow(/not a PDF/);
	});

	it('reserves a folder once', async () => {
		const { r } = await repo();
		expect(await r.reserve('example')).toBe(true);
		expect(await r.reserve('example')).toBe(false);
	});

	it('updates library.json lists from what is on disk', async () => {
		const { r } = await repo();
		await r.updateLibrary({ tags: ['a'] });
		const lib = await r.updateLibrary((cur) => ({ tags: [...cur.tags, 'b'] }));
		expect(lib.tags).toEqual(['a', 'b']);
		expect(lib.categories.map((c) => c.id)).toEqual(['vision', 'language', 'generative']);
	});
});
