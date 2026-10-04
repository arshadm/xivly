import { asset } from '$app/paths';
import { configurePdf } from 'svelte-pdf-mini';

// Serve pdf.js assets locally (copied by scripts/copy-pdfjs-assets.js) so
// reading works offline. `asset()` adds the GitHub Pages base path.
configurePdf({
	cMapUrl: asset('/pdfjs/cmaps/'),
	standardFontDataUrl: asset('/pdfjs/standard_fonts/'),
	wasmUrl: asset('/pdfjs/wasm/'),
	iccUrl: asset('/pdfjs/iccs/')
});
