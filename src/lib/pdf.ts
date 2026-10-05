import { asset } from '$app/paths';
import { configurePdf } from 'svelte-pdf-mini';
import './ui/clipboard'; // installs the native clipboard for the viewer (desktop)

// Serve pdf.js assets locally (copied by scripts/copy-pdfjs-assets.js) so
// reading works offline. `asset()` adds the GitHub Pages base path.
configurePdf({
	cMapUrl: asset('/pdfjs/cmaps/'),
	standardFontDataUrl: asset('/pdfjs/standard_fonts/'),
	wasmUrl: asset('/pdfjs/wasm/'),
	iccUrl: asset('/pdfjs/iccs/'),
	// The desktop CSP has no 'unsafe-eval': don't let pdf.js try (it would only log a violation).
	documentOptions: { isEvalSupported: false }
});
