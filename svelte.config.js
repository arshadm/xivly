// One codebase, two targets:
//   bun run build      -> build/ for Tauri (desktop)
//   bun run build:web  -> build/ for GitHub Pages (XIVLY_WEB=1, BASE_PATH=/xivly)
// The platform (Tauri vs browser) is detected at runtime, see src/lib/platform.
// SPA mode: Tauri has no Node server, and GitHub Pages is static.
import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

const base = process.env.BASE_PATH ?? "";
const web = process.env.XIVLY_WEB === "1";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      // GitHub Pages serves 404.html for unknown paths (deep links like /read?id=…).
      fallback: web ? "404.html" : "index.html",
    }),
    paths: { base },
  },
};

export default config;
