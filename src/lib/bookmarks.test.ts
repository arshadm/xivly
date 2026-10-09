import { describe, expect, it } from 'vitest';
import { addBookmark, filterBookmarks, newBookmark, parseBookmarks, removeBookmark, renameBookmark } from './bookmarks';
import type { Bookmark } from './types';

const b = (id: string, page: number, name = id, created = '2026-10-09T00:00:00Z'): Bookmark => ({ id, name, page, created });

describe('parseBookmarks', () => {
	it('is undefined without a list', () => {
		expect(parseBookmarks(undefined)).toBeUndefined();
		expect(parseBookmarks({ id: 'a', page: 2 })).toBeUndefined();
	});
	it('leaves out broken entries, names nameless ones, keeps unknown fields, sorts by page', () => {
		const raw = [{ id: 'b', name: 'Results', page: 9, created: 'x', color: 'red' }, { id: 'a', page: 3.5 }, { page: 4 }, { id: 'c', page: 'two' }, null];
		expect(parseBookmarks(raw)).toEqual([
			{ id: 'a', name: 'Page 3', page: 3.5, created: '' },
			{ id: 'b', name: 'Results', page: 9, created: 'x', color: 'red' }
		]);
	});
});

describe('newBookmark', () => {
	it('rounds the position and names an unnamed bookmark after its page', () => {
		const bm = newBookmark('  ', 4.567);
		expect(bm).toMatchObject({ name: 'Page 4', page: 4.57 });
		expect(bm.id).toMatch(/^[0-9a-f]{8}$/);
		expect(Date.parse(bm.created)).not.toBeNaN();
	});
});

describe('changes', () => {
	const list = [b('a', 2), b('c', 8)];
	it('adds in page order', () => {
		expect(addBookmark(list, b('b', 5)).map((x) => x.id)).toEqual(['a', 'b', 'c']);
		expect(addBookmark(undefined, b('b', 5)).map((x) => x.id)).toEqual(['b']);
	});
	it('renames, but never to an empty name', () => {
		expect(renameBookmark(list, 'a', ' Intro ')[0].name).toBe('Intro');
		expect(renameBookmark(list, 'a', '  ')[0].name).toBe('a');
	});
	it('removes', () => {
		expect(removeBookmark(list, 'a').map((x) => x.id)).toEqual(['c']);
	});
	it('never changes the list it was given', () => {
		addBookmark(list, b('b', 5));
		renameBookmark(list, 'a', 'x');
		expect(list).toEqual([b('a', 2), b('c', 8)]);
	});
});

describe('filterBookmarks', () => {
	it('matches every word, any case', () => {
		const list = [b('a', 1, 'Main results'), b('b', 2, 'Results table'), b('c', 3, 'Method')];
		expect(filterBookmarks(list, 'RESULTS').map((x) => x.id)).toEqual(['a', 'b']);
		expect(filterBookmarks(list, 'table res').map((x) => x.id)).toEqual(['b']);
		expect(filterBookmarks(list, '  ').length).toBe(3);
	});
});
