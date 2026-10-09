// Named bookmarks (`paper.json` › `bookmarks`): kept in page order. Every
// change returns a new list, applied to the paper as it is on disk (see
// `library.addBookmark`), so edits from another window are never lost.
import { anchorAt, parseAnchor } from './anchor';
import type { Bookmark } from './types';

/** Bookmarks from paper.json (edited by people and agents): broken entries are left out. */
export function parseBookmarks(raw: unknown): Bookmark[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	const out: Bookmark[] = [];
	for (const b of raw) {
		const anchor = parseAnchor(b);
		if (!anchor) continue;
		const { id, name, created } = b as Record<string, unknown>;
		if (typeof id !== 'string' || !id) continue;
		out.push({ ...(b as object), ...anchor, id, name: typeof name === 'string' && name.trim() ? name.trim() : `Page ${Math.floor(anchor.page)}`, created: typeof created === 'string' ? created : '' });
	}
	return sorted(out);
}

/** A new bookmark at a reader position. */
export function newBookmark(name: string, position: number): Bookmark {
	const { page } = anchorAt(position);
	return { id: crypto.randomUUID().slice(0, 8), name: name.trim() || `Page ${Math.floor(page)}`, page, created: new Date().toISOString() };
}

export const addBookmark = (list: Bookmark[] | undefined, bookmark: Bookmark) => sorted([...(list ?? []), bookmark]);

export const renameBookmark = (list: Bookmark[] | undefined, id: string, name: string) =>
	(list ?? []).map((b) => (b.id === id && name.trim() ? { ...b, name: name.trim() } : b));

export const removeBookmark = (list: Bookmark[] | undefined, id: string) => (list ?? []).filter((b) => b.id !== id);

/** Bookmarks whose name contains every word of `query` (any case), in page order. */
export function filterBookmarks(list: Bookmark[] | undefined, query: string) {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	return (list ?? []).filter((b) => words.every((w) => b.name.toLowerCase().includes(w)));
}

const sorted = (list: Bookmark[]) => list.sort((a, b) => a.page - b.page || a.created.localeCompare(b.created));
