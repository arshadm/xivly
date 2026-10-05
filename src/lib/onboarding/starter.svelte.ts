// The example library: a ready-made folder of annotated papers (built by
// /dev/starter, served next to the web app on GitHub Pages) that a new user
// can download into their library on first start.
import { asset } from '$app/paths';
import { dev } from '$app/environment';
import { library } from '$lib/library.svelte';
import { platform } from '$lib/platform';
import type { Category } from '$lib/types';

const STARTER_FILE = /^papers\/[a-z0-9-]+\/paper\.(pdf|json)$/;

/** Every example paper carries this tag (filter, or remove them all at once). */
export const STARTER_TAG = 'demo';

/** Generative, Language and Vision are a new library's own categories (same ids). */
export const STARTER_CATEGORIES: Category[] = [
	{ id: 'generative', name: 'Generative', color: 'rose' },
	{ id: 'language', name: 'Language', color: 'sky' },
	{ id: 'vision', name: 'Vision', color: 'sage' },
	{ id: 'robotics', name: 'Robotics', color: 'mint' },
	{ id: 'classics', name: 'Classics', color: 'clay' }
];

export interface StarterManifest {
	version: number;
	created: string;
	categories: Category[];
	files: { path: string; size: number }[];
}

/**
 * The released desktop app downloads from the web app's site, the web build from
 * its own origin (the Pages deploy adds it), and dev from `starter/build/` (unzip
 * starter.zip there: it stays out of `static/`, so builds never ship it).
 */
const base = () => (dev ? '/starter/build/' : platform.kind === 'desktop' ? 'https://julien-blanchon.github.io/xivly/starter/' : asset('/starter/'));

export const starter = $state({ running: false, done: 0, total: 0, error: null as string | null });

export const hasStarter = () => library.papers.some((p) => p.tags?.includes(STARTER_TAG));

/** Size of the download, for the offer ("about 14 MB"). */
export async function starterManifest(): Promise<StarterManifest | null> {
	try {
		const res = await fetch(`${base()}manifest.json`);
		return res.ok ? ((await res.json()) as StarterManifest) : null;
	} catch {
		return null;
	}
}

/** Download the example papers into the library (skipping papers already there). */
export async function downloadStarter() {
	const repo = library.repo;
	if (!repo || starter.running) return;
	Object.assign(starter, { running: true, done: 0, total: 0, error: null });
	try {
		const manifest = await starterManifest();
		if (!manifest) throw new Error('The example library is not available right now.');
		// Only paper files: a manifest must never write elsewhere in the library (hooks, settings).
		const bad = manifest.files.find((f) => !STARTER_FILE.test(f.path));
		if (bad) throw new Error(`Unexpected file in the example library: ${bad.path}`);
		const folders = Map.groupBy(manifest.files, (f) => f.path.split('/').slice(0, 2).join('/'));
		const todo = [...folders].filter(([dir]) => !library.papers.some((p) => `papers/${p.id}` === dir));
		starter.total = todo.length;
		const queue = [...todo];
		const worker = async () => {
			for (let item = queue.shift(); item; item = queue.shift()) {
				const [, files] = item;
				for (const f of files) {
					const res = await fetch(`${base()}${f.path}`);
					if (!res.ok) throw new Error(`${f.path}: HTTP ${res.status}`);
					const bytes = new Uint8Array(await res.arrayBuffer());
					if (bytes.length !== f.size) throw new Error(`${f.path}: incomplete download`);
					await repo.fs.write(f.path, bytes);
				}
				starter.done++;
			}
		};
		await Promise.all([worker(), worker(), worker()]);
		const missing = manifest.categories.filter((c) => !library.categories.some((x) => x.id === c.id));
		if (missing.length) await library.saveCategories([...library.categories, ...missing]);
		await library.reload();
	} catch (e) {
		starter.error = String(e instanceof Error ? e.message : e);
	} finally {
		starter.running = false;
	}
}

/** Move every example paper to the Trash; drop the example-only categories left empty. */
export async function removeStarter() {
	for (const p of library.papers.filter((p) => p.tags?.includes(STARTER_TAG))) await library.remove(p.id);
	for (const id of ['robotics', 'classics'])
		if (library.category(id) && !library.papers.some((p) => p.category === id)) await library.removeCategory(id);
}
