import { beforeEach, describe, expect, it } from 'vitest';
import { library } from '#lib/library.svelte.js';
import { MemoryFs } from '#lib/onboarding/memory-fs.js';
import type { Platform } from '#lib/platform/index.js';
import { Repo } from '#lib/repo.js';
import { notebooks } from './notebooks.svelte';

const enc = new TextEncoder();
const dec = new TextDecoder();
const platform = { kind: 'web', onDisk: false } as unknown as Platform;

let fs: MemoryFs;
const json = async (path: string) => JSON.parse(dec.decode((await fs.read(path))!));
const titles = (parent?: string) => notebooks.children(parent).map((n) => n.title);

beforeEach(async () => {
	fs = new MemoryFs();
	library.repo = new Repo(fs, platform);
	await library.repo.init();
	await notebooks.reload();
});

describe('notebooks', () => {
	it('creates folders and notebooks, each at the end, in its own folder', async () => {
		const f = await notebooks.create('folder', 'Attention');
		await notebooks.create('notebook', 'Sparse variants', f.id);
		await notebooks.create('notebook', 'Linear attention', f.id);
		await notebooks.create('notebook', '  ');
		expect(titles()).toEqual(['Attention', 'Untitled']);
		expect(titles(f.id)).toEqual(['Sparse variants', 'Linear attention']);
		expect(await json('notebooks/sparse-variants/notebook.json')).toMatchObject({ kind: 'notebook', title: 'Sparse variants', parent: 'attention' });
		await expect(notebooks.create('notebook', 'x', 'sparse-variants')).rejects.toThrow();
	});

	it('keeps names apart', async () => {
		await notebooks.create('notebook', 'Ideas');
		const b = await notebooks.create('notebook', 'Ideas');
		expect(b.id).toBe('ideas-2');
	});

	it('moves between levels, and never a folder into itself', async () => {
		const f = await notebooks.create('folder', 'F');
		const g = await notebooks.create('folder', 'G', f.id);
		const a = await notebooks.create('notebook', 'A');
		await notebooks.move(a.id, g.id, 0);
		expect(titles(g.id)).toEqual(['A']);
		await notebooks.move(a.id, undefined, 0);
		expect(titles()).toEqual(['A', 'F']);
		expect((await json('notebooks/a/notebook.json')).parent).toBeUndefined();
		await expect(notebooks.move(f.id, g.id, 0)).rejects.toThrow();
		await notebooks.move(g.id, undefined, 1);
		expect(titles()).toEqual(['A', 'G', 'F']);
	});

	it('renames, keeping fields added by others', async () => {
		const a = await notebooks.create('notebook', 'A');
		await fs.write('notebooks/a/notebook.json', enc.encode(JSON.stringify({ ...(await json('notebooks/a/notebook.json')), mine: 1 })));
		await notebooks.rename(a.id, ' Better ');
		expect(await json('notebooks/a/notebook.json')).toMatchObject({ title: 'Better', mine: 1 });
		expect(notebooks.get(a.id)?.title).toBe('Better');
	});

	it('deletes a folder, its contents moved up where it was', async () => {
		await notebooks.create('notebook', 'Before');
		const f = await notebooks.create('folder', 'F');
		await notebooks.create('notebook', 'After');
		await notebooks.create('notebook', 'X', f.id);
		await notebooks.create('notebook', 'Y', f.id);
		await notebooks.remove(f.id);
		expect(titles()).toEqual(['Before', 'X', 'Y', 'After']);
		expect(await fs.exists('notebooks/f')).toBe(false);
		await notebooks.reload();
		expect(titles()).toEqual(['Before', 'X', 'Y', 'After']);
	});

	it('deletes a folder with its contents', async () => {
		const f = await notebooks.create('folder', 'F');
		const g = await notebooks.create('folder', 'G', f.id);
		await notebooks.create('notebook', 'X', g.id);
		await notebooks.create('notebook', 'Kept');
		await notebooks.remove(f.id, 'trash');
		expect(titles()).toEqual(['Kept']);
		expect([...fs.files.keys()].filter((p) => p.startsWith('notebooks/'))).toEqual(['notebooks/kept/notebook.json']);
	});

	it('picks up changes made on disk, and starts empty in another library', async () => {
		await fs.write('notebooks/by-hand/notebook.json', enc.encode(JSON.stringify({ title: 'By hand', parent: 'nowhere' })));
		await notebooks.reload();
		expect(titles()).toEqual(['By hand']);
		library.repo = new Repo(new MemoryFs(), platform);
		await notebooks.reload();
		expect(notebooks.nodes).toEqual([]);
	});

	it('refuses to write to a notebook trashed meanwhile', async () => {
		const a = await notebooks.create('notebook', 'A');
		await fs.trash('notebooks/a');
		await expect(notebooks.rename(a.id, 'B')).rejects.toThrow(/gone/);
		expect(await fs.exists('notebooks/a/notebook.json')).toBe(false);
	});
});

describe('a reload while something changes', () => {
	it('never drops what was created meanwhile', async () => {
		const reload = notebooks.reload();
		const created = notebooks.create('notebook', 'Fresh');
		await Promise.all([reload, created]);
		expect(notebooks.children().map((n) => n.title)).toEqual(['Fresh']);
	});
});
