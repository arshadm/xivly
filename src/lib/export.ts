import type { Annotation, ExportOptions } from 'svelte-pdf-mini/core';
import type { ExportRequest } from './export.worker';

let worker: Worker | null = null;
let next = 0;
/** A save never waits longer than this for the worker. */
const TIMEOUT = 120_000;
const pending = new Map<number, { resolve: (b: Uint8Array) => void; reject: (e: Error) => void }>();

function getWorker() {
	if (worker) return worker;
	worker = new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });
	worker.onmessage = ({ data }: MessageEvent<{ id: number; bytes?: Uint8Array; error?: string }>) => {
		const p = pending.get(data.id);
		pending.delete(data.id);
		if (data.error || !data.bytes) p?.reject(new Error(data.error ?? 'export failed'));
		else p?.resolve(data.bytes);
	};
	// A worker that fails to load or crashes must not leave saves (and quitting) waiting forever.
	const fail = (e: Event) => {
		const error = new Error(`export worker failed: ${(e instanceof ErrorEvent && e.message) || e.type}`);
		for (const p of pending.values()) p.reject(error);
		pending.clear();
		worker?.terminate();
		worker = null;
	};
	worker.onerror = fail;
	worker.onmessageerror = fail;
	return worker;
}

/** `exportPdf` in a Web Worker. `bytes` is transferred (pass a copy you don't need). */
export function exportPdfInWorker(bytes: Uint8Array, annotations: Annotation[], options: ExportOptions = {}) {
	const id = next++;
	const req: ExportRequest = { id, bytes, annotations, options };
	return new Promise<Uint8Array>((resolve, reject) => {
		const timer = setTimeout(() => {
			pending.delete(id);
			reject(new Error('export timed out'));
			// A hung worker would make every later save wait the full timeout too: start afresh.
			const hung = worker;
			worker = null;
			hung?.terminate();
			for (const p of pending.values()) p.reject(new Error('export restarted'));
			pending.clear();
		}, TIMEOUT);
		const done = <T,>(f: (v: T) => void) => (v: T) => (clearTimeout(timer), f(v));
		pending.set(id, { resolve: done(resolve), reject: done(reject) });
		getWorker().postMessage(req, [bytes.buffer]);
	});
}
