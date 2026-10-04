import type { Annotation, ExportOptions } from 'svelte-pdf-mini/core';
import type { ExportRequest } from './export.worker';

let worker: Worker | null = null;
let next = 0;
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
	return worker;
}

/** `exportPdf` in a Web Worker. `bytes` is transferred (pass a copy you don't need). */
export function exportPdfInWorker(bytes: Uint8Array, annotations: Annotation[], options: ExportOptions = {}) {
	const id = next++;
	const req: ExportRequest = { id, bytes, annotations, options };
	return new Promise<Uint8Array>((resolve, reject) => {
		pending.set(id, { resolve, reject });
		getWorker().postMessage(req, [bytes.buffer]);
	});
}
