// Writes annotations into PDF bytes off the main thread (pdf-lib on a large
// paper takes long enough to stutter the UI).
// Only the PDF codec: the full `svelte-pdf-mini/core` would pull pdf.js (and a
// second copy of its worker) into this bundle.
import { exportPdf, type ExportOptions } from 'svelte-pdf-mini/pdf-codec';
import type { Annotation } from 'svelte-pdf-mini/core';

export interface ExportRequest {
	id: number;
	bytes: Uint8Array;
	annotations: Annotation[];
	options: ExportOptions;
}

self.onmessage = async ({ data }: MessageEvent<ExportRequest>) => {
	try {
		const out = await exportPdf(data.bytes, data.annotations, data.options);
		(self as unknown as Worker).postMessage({ id: data.id, bytes: out }, [out.buffer]);
	} catch (e) {
		(self as unknown as Worker).postMessage({ id: data.id, error: String(e) });
	}
};
