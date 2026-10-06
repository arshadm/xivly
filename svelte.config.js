// One codebase, three targets:
//   bun run build            -> build/ for Tauri (desktop)
//   bun run build:web        -> build/ for GitHub Pages (XIVLY_WEB=1, BASE_PATH=/xivly)
//   bun run build:extension  -> build-extension/ for Chrome (XIVLY_EXTENSION=1, see scripts/build-extension.ts)
// The platform (Tauri vs browser) is detected at runtime, see src/lib/platform.
// SPA mode: Tauri has no Node server, and GitHub Pages is static.
import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

const base = process.env.BASE_PATH ?? "";
const web = process.env.XIVLY_WEB === "1";
const extension = process.env.XIVLY_EXTENSION === "1";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      // GitHub Pages serves 404.html for unknown paths (deep links like /read?id=…).
      fallback: web ? "404.html" : "index.html",
      ...(extension && { pages: "build-extension", assets: "build-extension" }),
    }),
    paths: { base },
    // Chrome reserves file names starting with "_" in an extension.
    appDir: extension ? "app" : "_app",
    // An extension is plain files with no fallback page: every route lives in
    // index.html, after the `#` (index.html#/read?id=…).
    router: { type: extension ? "hash" : "pathname" },
    // The hash router rejects page options: it skips the route .ts files, whose
    // only options (ssr / prerender off) are what it does anyway.
    ...(extension && { moduleExtensions: [".js"] }),
  },
};

export default config;
