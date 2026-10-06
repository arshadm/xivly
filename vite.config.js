/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

/**
 * Dev only: never let the browser (or the desktop webview's disk cache) keep
 * svelte-pdf-mini's files. A rebuilt local copy keeps its version, so Vite
 * serves it as cacheable, and a stale module then asks for component styles
 * that no longer exist (500s on `?svelte&type=style`).
 */
/** @type {import("vite").Plugin} */
const noStoreLibrary = {
  name: "no-store-svelte-pdf-mini",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (/** @type {{ url?: string }} */ (req).url?.includes("/node_modules/svelte-pdf-mini/")) {
        const setHeader = res.setHeader.bind(res);
        res.setHeader = (/** @type {string} */ name, /** @type {any} */ value) =>
          setHeader(name, name.toLowerCase() === "cache-control" ? "no-store" : value);
        res.setHeader("Cache-Control", "no-store");
      }
      next();
    });
  },
};

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [noStoreLibrary, tailwindcss(), sveltekit()],

  // Unit tests (bun run test): pure logic and the library folder over an in-memory fs.
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },

  optimizeDeps: {
    // svelte-pdf-mini loads the pdf.js worker via `pdfjs-dist/...?url`, which
    // the dependency pre-bundler can't load: leave pdfjs-dist (pure ESM) to
    // the normal pipeline.
    // svelte-pdf-mini isn't pre-bundled either: pre-bundles are cached forever
    // under a hash of the package *version*, so a rebuilt local copy (same
    // version) kept being served stale, by the webview's disk cache too.
    exclude: ["pdfjs-dist", "svelte-pdf-mini"],
    // Its lazily imported deps, declared up front: discovered on first use,
    // they'd trigger a re-optimisation that breaks in-flight dynamic imports
    // (e.g. the first save's PDF writer).
    include: [
      "svelte-pdf-mini > @cantoo/pdf-lib",
      "svelte-pdf-mini > dompurify",
      "svelte-pdf-mini > katex",
      "svelte-pdf-mini > marked",
      "svelte-pdf-mini > perfect-freehand",
      "svelte-pdf-mini > @floating-ui/dom",
      // Zip writer of the starter builder (/dev/starter).
      "fflate",
    ],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
    // The starter builder (/dev/starter) reads starter/pdfs/.
    fs: { allow: ["starter"] },
  },
}));
