// First-page covers for the library grid: rendered once with pdf.js, kept as
// WebP in IndexedDB (per device, never in the library folder), two at a time.
import { assetUrls, getSharedWorker, loadPdfJs } from 'svelte-pdf-mini';
import { broadcast, onBroadcast } from './broadcast';
import { coverVersions } from './cover-versions.svelte';
import { idb } from './idb';
import { library } from './library.svelte';

const WIDTH = 360;
const store = idb('covers');
const urls = new Map<string, Promise<string | null>>();

/** Object URL of the paper's first page (null if it can't be rendered). */
export function coverUrl(id: string): Promise<string | null> {
	let url = urls.get(id);
	if (!url) {
		url = load(id).catch(() => null);
		urls.set(id, url);
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
	void url?.then((u) => u && URL.revokeObjectURL(u));
	coverVersions.bump(id);
}

// Another window saved the paper (or removed it): show the new cover.
if (typeof window !== 'undefined') onBroadcast('cover-changed', ({ id }) => drop(id));

async function load(id: string) {
	const cached = await store.get<Blob>(id);
	if (cached) return URL.createObjectURL(cached);
	const blob = await queue(() => render(id));
	if (!blob) return null;
	void store.set(id, blob);
	return URL.createObjectURL(blob);
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
		return await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.82));
	} finally {
		await task.destroy();
	}
}

// Rendering competes with the reader for the shared worker: keep it to two.
let running = 0;
const waiting: (() => void)[] = [];
async function queue<T>(job: () => Promise<T>): Promise<T> {
	if (running >= 2) await new Promise<void>((r) => waiting.push(r));
	running++;
	try {
		return await job();
	} finally {
		running--;
		waiting.shift()?.();
	}
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
