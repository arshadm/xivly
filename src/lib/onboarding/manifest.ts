// The example library's manifest: what it may write, and which papers it holds.
import type { Category } from '#lib/types.js';

export interface StarterManifest {
	version: number;
	created: string;
	categories: Category[];
	files: { path: string; size: number }[];
}

/** A manifest may only write paper files (never hooks, settings or anything else in the library). */
const STARTER_FILE = /^papers\/[a-z0-9-]+\/paper\.(pdf|json)$/;

/** Throws if a manifest would write anything but paper files. */
export function checkManifest(m: Pick<StarterManifest, 'files'>) {
	const bad = m.files.find((f) => !STARTER_FILE.test(f.path));
	if (bad) throw new Error(`Unexpected file in the example library: ${bad.path}`);
}

/** Paper ids (folder names) in a manifest. */
export const manifestIds = (m: Pick<StarterManifest, 'files'>) => [...new Set(m.files.map((f) => f.path.split('/')[1]))];
