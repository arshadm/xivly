import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [tailwindcss(), sveltekit()],

  optimizeDeps: {
    // svelte-pdf-mini loads the pdf.js worker via `pdfjs-dist/...?url`, which
    // the dependency pre-bundler can't load: leave pdfjs-dist (pure ESM) to
    // the normal pipeline.
    exclude: ["pdfjs-dist"],
    // Its lazily imported deps, declared up front: discovered on first use,
    // they'd trigger a re-optimisation that breaks in-flight dynamic imports
    // (e.g. the first save's PDF writer).
    include: [
      "svelte-pdf-mini > @cantoo/pdf-lib",
      "svelte-pdf-mini > dompurify",
      "svelte-pdf-mini > katex",
      "svelte-pdf-mini > marked",
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
  },
}));
