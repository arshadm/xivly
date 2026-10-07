import { asset } from '$app/paths';
import type { AssetPath } from '$app/types';
import { configurePdf } from 'svelte-pdf-mini';
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
