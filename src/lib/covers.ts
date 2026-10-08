// First-page covers for the library grid: rendered once with pdf.js, kept in
// IndexedDB (per device, never in the library folder). Covers on screen render
// first; new papers' covers, and every missing one with the "First page" style,
// render ahead of time when nothing on screen waits.
import { assetUrls, getSharedWorker, loadPdfJs } from 'svelte-pdf-mini';
import { broadcast, onBroadcast } from './broadcast';
import { coverVersions } from './cover-versions.svelte';
import { idb } from './idb';
import { library } from './library.svelte';

const WIDTH = 360;
const store = idb('covers');
const urls = new Map<string, Promise<string | null>>();
/** The covers loaded so far: a card scrolled back into view shows its cover at once. */
const loaded = new Map<string, string>();

/** The paper's cover if it's loaded already (else null: ask `coverUrl`). */
export const loadedCover = (id: string) => loaded.get(id) ?? null;

/** Object URL of the paper's first page (null if it can't be rendered). */
export function coverUrl(id: string): Promise<string | null> {
	let url = urls.get(id);
	if (!url) {
		url = load(id).catch(() => null);
		urls.set(id, url);
		void url.then((u) => u && urls.get(id) === url && loaded.set(id, u));
	}
	return url;
}

/**
 * Drop a paper's cover (its PDF changed, or it left the library): the next look
 * renders it again, here and in the other windows (the library shows the new one).
 */
export function forgetCover(id: string) {
	drop(id);
	void store.delete(id);
	void broadcast('cover-changed', { id });
}

function drop(id: string) {
	const url = urls.get(id);
	urls.delete(id);
	loaded.delete(id);
	rendering.delete(id);
	void url?.then((u) => u && URL.revokeObjectURL(u));
	coverVersions.bump(id);
}

// Another window saved the paper (or removed it): show the new cover.
if (typeof window !== 'undefined') onBroadcast('cover-changed', ({ id }) => drop(id));

async function load(id: string) {
	const cached = await store.get<Blob>(id);
	if (cached) return URL.createObjectURL(cached);
	const blob = await renderOnce(id, false);
	return blob && URL.createObjectURL(blob);
}

/**
 * Render (and keep) the covers of these papers that aren't cached yet, one at a
 * time and only when no card waits for one: a new paper's cover is ready before
 * its card shows, and the "First page" style fills in while the app is idle.
 */
export async function warmCovers(ids: string[]) {
	const cached = new Set(await store.keys());
	for (const id of ids) if (!cached.has(id) && !urls.has(id)) void renderOnce(id, true).catch(() => null);
}

async function render(id: string): Promise<Blob | null> {
	const bytes = await library.repo?.readPdf(id);
	if (!bytes) return null;
	const pdfjs = await loadPdfJs();
	const task = pdfjs.getDocument({ ...assetUrls(pdfjs.version), data: bytes, worker: await getSharedWorker() });
	try {
		const page = await (await task.promise).getPage(1);
		const viewport = page.getViewport({ scale: WIDTH / page.getViewport({ scale: 1 }).width });
		const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(viewport.width), height: Math.round(viewport.height) });
		await page.render({ canvas, viewport }).promise;
		return await encode(canvas);
	} finally {
		await task.destroy();
	}
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, quality));

/** WebP where the browser encodes it; JPEG elsewhere (WebKit would quietly give a PNG, ~50% larger). */
async function encode(canvas: HTMLCanvasElement) {
	const webp = await toBlob(canvas, 'image/webp', 0.82);
	return webp?.type === 'image/webp' ? webp : toBlob(canvas, 'image/jpeg', 0.8);
}

// Rendering competes with the reader for the shared worker: two at a time. Covers
// on screen go first, newest first (after a fast scroll, the ones on screen were
// asked last); covers rendered ahead of time only start when nothing else runs.
type Job = { start: () => void };
const onScreen: Job[] = [];
const ahead: Job[] = [];
const rendering = new Map<string, { promise: Promise<Blob | null>; job: Job }>();
let running = 0;

// Drawing a page takes the main thread (up to ~100 ms): ahead-of-time renders wait
// for a pause in scrolling, pointing and typing, so they never cost a frame of it.
const QUIET_MS = 800;
let lastInput = 0;
let retry: ReturnType<typeof setTimeout> | undefined;
if (typeof window !== 'undefined')
	for (const type of ['scroll', 'wheel', 'pointermove', 'keydown'])
		addEventListener(type, () => (lastInput = performance.now()), { capture: true, passive: true });

function next() {
	if (running >= 2) return;
	let job = onScreen.pop();
	if (!job && running === 0 && ahead.length) {
		const quiet = performance.now() - lastInput;
		if (quiet < QUIET_MS) {
			clearTimeout(retry);
			retry = setTimeout(next, QUIET_MS - quiet);
			return;
		}
		job = ahead.shift();
	}
	if (!job) return;
	running++;
	job.start();
}

/** The cover rendered once (and stored), whoever asks; a card asking moves it out of the ahead-of-time queue. */
function renderOnce(id: string, aheadOfTime: boolean): Promise<Blob | null> {
	const current = rendering.get(id);
	if (current) {
		const i = aheadOfTime ? -1 : ahead.indexOf(current.job);
		if (i >= 0) {
			ahead.splice(i, 1);
			onScreen.push(current.job);
			next();
		}
		return current.promise;
	}
	let job!: Job;
	const started = new Promise<void>((start) => (job = { start }));
	const latest = () => rendering.get(id)?.promise === promise;
	const promise: Promise<Blob | null> = started
		.then(() => render(id))
		.then((blob) => {
			// Not if the paper changed meanwhile (`forgetCover`): that render is stale.
			if (blob && latest()) void store.set(id, blob);
			return blob;
		})
		.finally(() => {
			running--;
			if (latest()) rendering.delete(id);
			next();
		});
	rendering.set(id, { promise, job });
	(aheadOfTime ? ahead : onScreen).push(job);
	next();
	return promise;
}

// One observer for every card (a library of 500 papers must not create 500).
const nearCallbacks = new Map<Element, () => void>();
let observer: IntersectionObserver | null = null;

/** Call `fn` once `node` comes within 400px of the viewport; returns the cleanup. */
export function whenNear(node: Element, fn: () => void): () => void {
	observer ??= new IntersectionObserver(
		(entries) => {
			for (const e of entries) {
				if (!e.isIntersecting) continue;
				const cb = nearCallbacks.get(e.target);
				nearCallbacks.delete(e.target);
				observer?.unobserve(e.target);
				cb?.();
			}
		},
		{ rootMargin: '400px' }
	);
	nearCallbacks.set(node, fn);
	observer.observe(node);
	return () => {
		nearCallbacks.delete(node);
		observer?.unobserve(node);
	};
}
