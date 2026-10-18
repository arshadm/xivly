// What this device had open, so a relaunch picks up where you were: the papers
// whose windows were open (in the order they were opened), and the library's view.
// Kept on this device (localStorage, shared by the app's windows), not in the
// library: another device has its own.
import type { View } from './filter';

const PAPERS = 'xivly:session-papers';
const NOTEBOOKS = 'xivly:session-notebooks';
const USED = 'xivly:recent-notebooks';
const VIEW = 'xivly:session-view';

function read<T>(key: string): T | null {
	try {
		return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
	} catch {
		return null;
	}
}
function write(key: string, value: unknown) {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// Storage unavailable: nothing is remembered.
	}
}

/** The papers open when the app last quit (or now), oldest first. */
export const openPapers = (): string[] => (read<unknown[]>(PAPERS) ?? []).filter((id): id is string => typeof id === 'string');

/** A reader window shows this paper. */
export function rememberOpen(id: string) {
	write(PAPERS, [...openPapers().filter((p) => p !== id), id]);
}

/** Its window was closed (not by quitting the app: those are reopened). */
export function forgetOpen(id: string) {
	write(PAPERS, openPapers().filter((p) => p !== id));
}

/** The notebooks open when the app last quit (or now), oldest first. */
export const openNotebooks = (): string[] => (read<unknown[]>(NOTEBOOKS) ?? []).filter((id): id is string => typeof id === 'string');

/** A window shows this notebook. */
export function rememberNotebook(id: string) {
	write(NOTEBOOKS, [...openNotebooks().filter((n) => n !== id), id]);
}

/** Its window was closed by hand. */
export function forgetNotebook(id: string) {
	write(NOTEBOOKS, openNotebooks().filter((n) => n !== id));
}

/** Notebooks opened or linked to lately on this device, most recent first. */
export const recentNotebooks = (): string[] => (read<unknown[]>(USED) ?? []).filter((id): id is string => typeof id === 'string');

/** A notebook was opened, or a paper linked to it. */
export function usedNotebook(id: string) {
	write(USED, [id, ...recentNotebooks().filter((n) => n !== id)].slice(0, 20));
}

export function rememberView(view: View) {
	write(VIEW, view);
}

/** The library's last view, if it still exists (`isCategory`: the category is still there). */
export function lastView(isCategory: (id: string) => boolean): View | null {
	const v = read<View>(VIEW);
	if (!v || typeof v !== 'object') return null;
	if (v.kind === 'category') return typeof v.id === 'string' && isCategory(v.id) ? v : null;
	return ['all', 'recent', 'uncategorized', 'feed', 'reading'].includes(v.kind) ? ({ kind: v.kind } as View) : null;
}
