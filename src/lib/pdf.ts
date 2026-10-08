import { asset } from '$app/paths';
import type { AssetPath } from '$app/types';
import { configurePdf, getSharedWorker } from 'svelte-pdf-mini';
import { indexedDbStore, type PaperModel } from 'svelte-pdf-mini/core';
import './ui/clipboard'; // installs the native clipboard for the viewer (desktop)

// Serve pdf.js assets locally (copied by scripts/copy-pdfjs-assets.js) so
// reading works offline. `asset()` adds the GitHub Pages base path (it types
// files only: these are folders).
const folder = (path: string) => asset(path as AssetPath);
configurePdf({
	cMapUrl: folder('pdfjs/cmaps/'),
	standardFontDataUrl: folder('pdfjs/standard_fonts/'),
	wasmUrl: folder('pdfjs/wasm/'),
	iccUrl: folder('pdfjs/iccs/'),
	// The desktop CSP has no 'unsafe-eval': don't let pdf.js try (it would only log a violation).
	documentOptions: { isEvalSupported: false }
});

/** Paper analyses (references, figures, equations…), per device: a paper opened again isn't analyzed again. */
export const paperCache = indexedDbStore<PaperModel>('xivly-papers', 'analysis');

/** Start pdf.js and its worker while the PDF is being read (they're needed right after). */
export const warmPdf = () => void getSharedWorker().catch(() => {});
