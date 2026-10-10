import { describe, expect, it } from 'vitest';
import { conflictKind, conflictsIn, isConflictCopy, mayBeConflictCopy, mergeJson, mergeNotesDocs } from './conflicts';

describe('conflict copies', () => {
	it('known by the names sync clients give them', () => {
		for (const name of ['paper (1).json', 'paper 2.json', 'paper (conflicted copy 2026-10-10).json', 'paper [Conflict].json', 'paper_conflict-20261010.json', 'paper (Arshad’s MacBook conflicted copy).json'])
			expect(isConflictCopy(name, 'paper.json'), name).toBe(true);
		for (const name of ['paper.json', 'papers.json', 'paper.pdf', 'paper-notes.json', '.paper.json.1-2.xivly-tmp', 'paper.json (1)'])
			expect(isConflictCopy(name, 'paper.json'), name).toBe(false);
	});

	it('found beside their file, with their paper', () => {
		expect(conflictsIn('papers/2024-a', ['paper.json', 'paper (1).json', 'paper.pdf', 'paper (1).pdf', 'notes.json', 'notes-assets'])).toEqual([
			{ path: 'papers/2024-a/paper (1).json', original: 'papers/2024-a/paper.json', paperId: '2024-a' },
			{ path: 'papers/2024-a/paper (1).pdf', original: 'papers/2024-a/paper.pdf', paperId: '2024-a' }
		]);
		// Without the file itself, it's no copy of anything.
		expect(conflictsIn('.xivly', ['library 2.json'])).toEqual([]);
	});

	it('what can be merged', () => {
		const kind = (original: string) => conflictKind({ path: '', original });
		expect(kind('papers/a/notes.json')).toBe('notes');
		expect(kind('papers/a/paper.json')).toBe('json');
		expect(kind('.xivly/library.json')).toBe('json');
		expect(kind('.xivly/feed/papers/2026-10.json')).toBe('json');
		expect(kind('papers/a/notes.md')).toBe('derived');
		expect(kind('papers/a/paper.pdf')).toBe('file');
		expect(kind('papers/a/chats/x.json')).toBe('file');
	});
});

describe('merging two versions', () => {
	it('JSON: ours wins, both kept, lists joined', () => {
		const ours = { title: 'Ours', tags: ['a', 'b'], bookmarks: [{ id: '1', name: 'Mine' }], links: { github: ['x'] } };
		const theirs = { title: 'Theirs', year: 2024, tags: ['b', 'c'], bookmarks: [{ id: '1', name: 'Theirs', page: 3 }, { id: '2', name: 'New' }], links: { github: ['y'], project: 'p' } };
		expect(mergeJson(ours, theirs)).toEqual({
			title: 'Ours',
			year: 2024,
			tags: ['a', 'b', 'c'],
			bookmarks: [
				{ id: '1', name: 'Mine', page: 3 },
				{ id: '2', name: 'New' }
			],
			links: { github: ['x', 'y'], project: 'p' }
		});
	});

	it('notes: ours, then what only theirs has', () => {
		const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
		const ours = { type: 'doc' as const, content: [p('shared'), p('mine')] };
		const theirs = { type: 'doc' as const, content: [p('shared'), p('theirs')] };
		expect(mergeNotesDocs(ours, theirs).content).toEqual([p('shared'), p('mine'), { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'From the other copy' }] }, p('theirs')]);
		expect(mergeNotesDocs(ours, { type: 'doc', content: [p('mine')] })).toBe(ours);
	});
});

describe('a change worth looking again for copies', () => {
	it('names like a copy', () => {
		for (const p of ['papers/a/paper (1).json', 'papers/a/notes 2.json', '.xivly/library (conflicted copy).json', 'papers/a/paper [Conflict].pdf']) expect(mayBeConflictCopy(p), p).toBe(true);
		for (const p of ['papers/a/paper.json', 'papers/2024-a', '.xivly/devices/9f1c.json', 'papers/a/notes.md']) expect(mayBeConflictCopy(p), p).toBe(false);
	});
});
