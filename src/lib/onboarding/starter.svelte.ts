// The example library: a ready-made folder of annotated papers (built by
// /dev/starter, served next to the web app on GitHub Pages) that a new user
// can download into their library on first start.
import { asset } from '$app/paths';
import { dev } from '$app/environment';
import { library } from '$lib/library.svelte';
import { platform } from '$lib/platform';
import type { Category } from '$lib/types';
import { checkManifest, manifestIds, type StarterManifest } from './manifest';

export type { StarterManifest };

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

/**
 * The released desktop app downloads from the web app's site, the web build from
 * its own origin (the Pages deploy adds it), and dev from `starter/build/` (unzip
 * starter.zip there: it stays out of `static/`, so builds never ship it).
 */
const base = () => (dev ? '/starter/build/' : platform.kind === 'desktop' ? 'https://julien-blanchon.github.io/xivly/starter/' : asset('/starter/'));

export const starter = $state({ running: false, done: 0, total: 0, error: null as string | null });

export const hasStarter = () => library.papers.some((p) => p.starter === true || p.tags?.includes(STARTER_TAG));

/** Size of the download, for the offer ("about 14 MB"). */
export async function starterManifest(): Promise<StarterManifest | null> {
	try {
		const res = await fetch(`${base()}manifest.json`);
		return res.ok ? ((await res.json()) as StarterManifest) : null;
	} catch {
		return null;
	}
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * Download the example papers into the library, skipping papers already there.
 * One failure stops every download; what was written stays consistent (a folder
 * gets its PDF before its paper.json), and the library is reloaded either way.
 */
export async function downloadStarter() {
	const repo = library.repo;
	if (!repo || starter.running) return;
	Object.assign(starter, { running: true, done: 0, total: 0, error: null });
	const abort = new AbortController();
	try {
		const manifest = await starterManifest();
		if (!manifest) throw new Error('The example library is not available right now.');
		checkManifest(manifest);
		// Categories first: papers never show up uncategorized, even if a download fails.
		const missing = manifest.categories.filter((c) => !library.categories.some((x) => x.id === c.id));
		if (missing.length) await library.saveCategories((cur) => [...cur, ...missing.filter((c) => !cur.some((x) => x.id === c.id))]);
		const folders = [...Map.groupBy(manifest.files, (f) => f.path.split('/')[1])];
		starter.total = folders.length;
		const queue = [...folders];
		const worker = async () => {
			for (let item = queue.shift(); item && !abort.signal.aborted; item = queue.shift()) {
				const [id, files] = item;
				// Reserved under the library's lock: a paper already there (or added meanwhile) is kept as is.
				if (!(await repo.reserve(id))) {
					starter.done++;
					continue;
				}
				try {
					for (const f of files.toSorted((a, b) => Number(a.path.endsWith('.json')) - Number(b.path.endsWith('.json')))) {
						const res = await fetch(`${base()}${f.path}`, { signal: abort.signal });
						if (!res.ok) throw new Error(`${f.path}: HTTP ${res.status}`);
						let bytes = new Uint8Array(await res.arrayBuffer());
						if (bytes.length !== f.size) throw new Error(`${f.path}: incomplete download`);
						// Marked as an example: "Remove" in Settings takes these only.
						if (f.path.endsWith('.json')) bytes = enc.encode(JSON.stringify({ ...JSON.parse(dec.decode(bytes)), starter: true }, null, 2) + '\n');
						abort.signal.throwIfAborted();
						await repo.fs.write(f.path, bytes);
					}
				} catch (e) {
					// A half-written example would show as a broken paper.
					await repo.fs.trash(`papers/${id}`).catch(() => {});
					throw e;
				}
				starter.done++;
			}
		};
		await Promise.all(
			[worker(), worker(), worker()].map((w) =>
				w.catch((e) => {
					abort.abort();
					throw e;
				})
			)
		);
	} catch (e) {
		starter.error = String(e instanceof Error ? e.message : e);
	} finally {
		await library.reload();
		starter.running = false;
	}
}

/**
 * Move the example papers to the Trash; drop the example-only categories left
 * empty. Examples are marked `starter: true` (older downloads: the manifest's
 * papers with the example tag), so the user's own papers tagged `demo` stay.
 */
export async function removeStarter() {
	const ids = new Set((await starterManifest().then((m) => (m ? manifestIds(m) : []))).filter(Boolean));
	const examples = library.papers.filter((p) => p.starter === true || (ids.has(p.id) && p.tags?.includes(STARTER_TAG)));
	for (const p of examples) await library.remove(p.id);
	for (const id of ['robotics', 'classics'])
		if (library.category(id) && !library.papers.some((p) => p.category === id)) await library.removeCategory(id);
}
