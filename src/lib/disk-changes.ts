// Files of the library that changed on disk (a sync client bringing another
// device's edits, Finder, an agent), as the platform reports them: the layout
// listens once (see +layout.svelte) and hands them on to whoever shows them.
import { platform } from './platform';

type Listener = (paths: string[]) => void;
const listeners = new Set<Listener>();

/** Start listening (once per window); returns the stop function. */
export function watchLibrary(): () => void {
	return platform.watch?.((paths) => listeners.forEach((fn) => fn(paths))) ?? (() => {});
}

/** Called with the paths of each batch of changes; returns the stop function. */
export function onDiskChange(fn: Listener): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

/** Whether a change touches what the library shows: a paper's metadata, a paper added or removed, categories, where papers were read. */
export const touchesLibrary = (path: string) => /^papers\/[^/]+(\/paper\.(json|pdf))?$/.test(path) || path === '.xivly/library.json' || path.startsWith('.xivly/devices/');

/** Whether a change touches one paper as its reader shows it (its metadata, categories, where it was read). */
export const touchesPaper = (id: string, path: string) => path === `papers/${id}/paper.json` || path === '.xivly/library.json' || path.startsWith('.xivly/devices/');
