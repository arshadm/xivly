// Copy pdf.js runtime assets (CJK cMaps, standard fonts, WASM decoders, ICC
// profiles) into static/ so the app works offline instead of hitting jsDelivr.
// Not the `*_nowasm_fallback.js` decoders (JPEG 2000, JBIG2): pdf.js only loads
// them when WebAssembly is unavailable, and every target runs it.
import { cpSync, existsSync, rmSync } from "node:fs";

const src = "node_modules/pdfjs-dist";
const dest = "static/pdfjs";
rmSync(dest, { recursive: true, force: true });
for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  if (existsSync(`${src}/${dir}`))
    cpSync(`${src}/${dir}`, `${dest}/${dir}`, { recursive: true, filter: (path) => !path.endsWith("_nowasm_fallback.js") });
}
console.log(`pdf.js assets copied to ${dest}`);
