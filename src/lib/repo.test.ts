import { describe, expect, it } from 'vitest';
import { MemoryFs } from './onboarding/memory-fs';
import type { Platform } from './platform';
import { filterPapers } from './filter';
import { isPdf, merge, normalizeLibrary, normalizePaper, RemovedError, Repo, slugify } from './repo';

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

describe('normalizePaper: fields written with the wrong type', () => {
	it('reads dates, years and timestamps', () => {
		expect(normalizePaper('x', { date: 2017, year: '2017', opened: 5, added: 3, position: '4' })).toMatchObject({ date: '2017', year: 2017, opened: undefined, added: '', position: undefined });
		expect(normalizePaper('x', { date: { y: 1 }, year: 2017.5 })).toMatchObject({ date: undefined, year: undefined });
		expect(normalizePaper('x', { read: true }).read).toBeTruthy();
		expect(normalizePaper('x', { read: false }).read).toBeUndefined();
	});
	it('reads links: a single URL as a list, keeps unknown kinds', () => {
		const p = normalizePaper('x', { links: { github: 'https://github.com/a/b', huggingface: [1, 'https://huggingface.co/m'], project: ['no'], mine: 'kept' } });
		expect(p.links).toEqual({ github: ['https://github.com/a/b'], huggingface: ['https://huggingface.co/m'], mine: 'kept' });
		expect(normalizePaper('x', { links: 'https://a.example' }).links).toBeUndefined();
		expect(normalizePaper('x', { links: ['https://a.example'] }).links).toBeUndefined();
	});
	it('reads Hugging Face data', () => {
		const p = normalizePaper('x', { hf: { page: 1, upvotes: '3', models: { total: 2, top: 'a' }, datasets: { top: [] }, spaces: { total: 1, top: ['s', 2] } } });
		expect(p.hf).toEqual({ spaces: { total: 1, top: ['s'] }, models: { total: 2, top: [] } });
		expect(normalizePaper('x', { hf: 'nope' }).hf).toBeUndefined();
	});
	it('keeps the library sortable', () => {
		const papers = [normalizePaper('a', { date: 2017 }), normalizePaper('b', { date: '2020-01-01' }), normalizePaper('c', { year: '1999' })];
		const o = { view: { kind: 'all' } as const, tagFilter: {}, readFilter: 'all' as const, recentSince: 0, query: '1999', sortDesc: true, isCategory: () => false };
		expect(filterPapers(papers, { ...o, query: '', sortBy: 'published' }).map((p) => p.id)).toEqual(['b', 'a', 'c']);
		expect(filterPapers(papers, { ...o, sortBy: 'opened' }).map((p) => p.id)).toEqual(['c']);
	});
});

describe('isPdf', () => {
	it('finds the header within the first KB only', () => {
		expect(isPdf(enc.encode('%PDF-1.7'))).toBe(true);
		expect(isPdf(enc.encode(' '.repeat(1000) + '%PDF-1.4'))).toBe(true);
		expect(isPdf(enc.encode(' '.repeat(1100) + '%PDF-1.4'))).toBe(false);
		expect(isPdf(enc.encode('<!doctype html>'))).toBe(false);
		expect(isPdf(new Uint8Array())).toBe(false);
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
	it('keeps what was shown when a paper.json can\'t be read for a moment', async () => {
		const { fs, r } = await repo();
		const p = await r.add(PDF, { title: 'A real title', tags: ['x'] });
		const shown = (await r.readPaper(p.id))!;
		// A read failing while another process rewrites the file (twice: the retry fails too).
		const read = fs.read.bind(fs);
		let fails = 2;
		fs.read = async (path: string) => (path.endsWith('paper.json') && fails-- > 0 ? Promise.reject(new Error('busy')) : read(path));
		expect(await r.readPaper(p.id, shown)).toEqual(shown);
		fails = 2;
		expect((await r.listPapers(new Map([[p.id, shown]])))[0].title).toBe('A real title');
		// One transient failure: the retry reads the file.
		fails = 1;
		expect((await r.readPaper(p.id))!.tags).toEqual(['x']);
	});

	it('lists every paper in one read, reusing unchanged ones', async () => {
		const { fs, r } = await repo();
		const a = await r.add(PDF, { title: 'A' });
		const b = await r.add(PDF, { title: 'B' });
		const c = await r.add(PDF, { title: 'C' });
		await fs.write(`papers/${c.id}/paper.json`, enc.encode('{ not json'));
		await fs.write('papers/only-a-pdf/paper.pdf', PDF);
		// Like the desktop: one call for every paper.json.
		Object.assign(fs, {
			readEach: async (dir: string, file: string) =>
				Promise.all(
					(await fs.list(dir)).filter((e) => e.dir).map(async ({ name }) => {
						const bytes = await fs.read(`${dir}/${name}/${file}`);
						return { name, text: bytes && dec.decode(bytes), error: false };
					})
				)
		});
		const shownC = { ...(await r.readPaper(a.id))!, id: c.id, title: 'C as shown' };
		const first = await r.listPapers(new Map([[c.id, shownC]]));
		const byId = (list: typeof first, id: string) => list.find((p) => p.id === id)!;
		expect(first.map((p) => p.title).sort()).toEqual(['A', 'B', 'C as shown', 'only-a-pdf']);
		await r.update(b.id, { title: 'B2' });
		const second = await r.listPapers();
		// Unchanged paper.json: the very same object, not parsed again.
		expect(byId(second, a.id)).toBe(byId(first, a.id));
		expect(byId(second, b.id).title).toBe('B2');
	});

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
		// Some junk before the header is fine (PDF readers allow up to 1 KB).
		await r.savePdf(p.id, enc.encode('\r\n%PDF-1.7 saved'));
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

describe('notes', () => {
	const doc = { type: 'doc' as const, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Key idea' }] }] };

	it('none until saved, then read back as written', async () => {
		const { r } = await repo();
		const p = await r.add(PDF, { title: 'Noted' });
		expect(await r.readNotes(p.id)).toBeNull();
		await r.saveNotes(p.id, doc);
		const notes = await r.readNotes(p.id);
		expect(notes?.doc).toEqual(doc);
		expect(notes?.version).toBe(1);
		expect(Date.parse(notes!.updated!)).not.toBeNaN();
	});

	it('writes notes.md next to it, the same notes as Markdown', async () => {
		const { fs, r } = await repo();
		const p = await r.add(PDF, { title: 'Noted' });
		await r.saveNotes(p.id, doc);
		const md = dec.decode((await fs.read(`papers/${p.id}/notes.md`))!);
		expect(md).toMatch(/^<!-- Written by Xivly from notes.json/);
		expect(md.endsWith('\n\nKey idea\n')).toBe(true);
	});

	it('keeps fields added by others, and replaces the document', async () => {
		const { fs, r } = await repo();
		const p = await r.add(PDF, { title: 'Noted' });
		await fs.write(`papers/${p.id}/notes.json`, enc.encode(JSON.stringify({ version: 1, doc: { type: 'doc' }, summary: 'by an agent' })));
		await r.saveNotes(p.id, doc);
		const file = await json(fs, `papers/${p.id}/notes.json`);
		expect(file.summary).toBe('by an agent');
		expect(file.doc).toEqual(doc);
	});

	it('refuses a notes.json that isn’t notes, rather than saving over it', async () => {
		const { fs, r } = await repo();
		const p = await r.add(PDF, { title: 'Noted' });
		await fs.write(`papers/${p.id}/notes.json`, enc.encode('{ not json'));
		await expect(r.readNotes(p.id)).rejects.toThrow(/not valid JSON/);
		await fs.write(`papers/${p.id}/notes.json`, enc.encode(JSON.stringify({ doc: 'text' })));
		await expect(r.readNotes(p.id)).rejects.toThrow(/doesn’t hold notes/);
	});

	it('never brings back a removed paper', async () => {
		const { fs, r } = await repo();
		const p = await r.add(PDF, { title: 'Noted' });
		await r.remove(p.id);
		await expect(r.saveNotes(p.id, doc)).rejects.toThrow(RemovedError);
		expect(await fs.exists(`papers/${p.id}`)).toBe(false);
	});
});

describe('readAllNotesText', () => {
	const doc = (text: string) => ({ type: 'doc' as const, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

	it('each paper’s notes, lower-cased, without the header; papers without notes left out', async () => {
		const { r } = await repo();
		const a = await r.add(PDF, { title: 'One' });
		await r.add(PDF, { title: 'Two' });
		await r.saveNotes(a.id, doc('The KEY idea'));
		const text = await r.readAllNotesText();
		expect([...text.keys()]).toEqual([a.id]);
		expect(text.get(a.id)).toBe('the key idea');
	});

	it('in one call where the platform can (desktop)', async () => {
		const fs = new MemoryFs();
		const calls: string[] = [];
		const withEach = Object.assign(fs, {
			readEach: async (dir: string, file: string) => {
				calls.push(`${dir}/*/${file}`);
				const names = (await fs.list(dir)).filter((e) => e.dir).map((e) => e.name);
				return Promise.all(names.map(async (name) => ({ name, text: ((b) => (b ? dec.decode(b) : null))(await fs.read(`${dir}/${name}/${file}`)), error: false })));
			}
		});
		const r = new Repo(withEach, platform);
		await r.init();
		const a = await r.add(PDF, { title: 'One' });
		await r.saveNotes(a.id, doc('Desktop'));
		expect((await r.readAllNotesText()).get(a.id)).toBe('desktop');
		expect(calls).toEqual(['papers/*/notes.md']);
	});
});
