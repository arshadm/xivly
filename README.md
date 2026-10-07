<p align="center"><img src="src-tauri/icons/icon.png" width="128" height="128" alt=""></p>

<h1 align="center">Xivly</h1>
<p align="center"><em>Papers, without distraction.</em></p>

Read, annotate and organize research papers. A desktop app (Tauri: macOS, Windows, Linux) **and** a static web app (GitHub Pages) from the same codebase, built on [svelte-pdf-mini](https://github.com/julien-blanchon/svelte-pdf-mini).

- **macOS** (26.2 or later): `brew install --cask julien-blanchon/tap/xivly` (update with `brew upgrade --cask xivly`), or the `.dmg` from [Releases](https://github.com/julien-blanchon/xivly/releases). Signed and notarized.
- **Windows**: the `.exe` (or `.msi`) installer from [Releases](https://github.com/julien-blanchon/xivly/releases). Not code-signed yet (SmartScreen asks once): signing is pending approval by the SignPath Foundation. Once it lands: free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org) ([code signing policy](CODE_SIGNING.md)).
- **Linux** (x86_64, glibc 2.39+: Ubuntu 24.04, Debian 13, Fedora 40 or newer): the `.AppImage`, `.deb` or `.rpm` from [Releases](https://github.com/julien-blanchon/xivly/releases). The `.deb` and `.rpm` use your system's WebKitGTK, which must be recent enough to run the PDF engine (Xivly says so on start if it isn't); the AppImage bundles its own.
- **Web**: [julien-blanchon.github.io/xivly](https://julien-blanchon.github.io/xivly), in a recent Chrome, Edge, Arc or Safari 26.2.
- **Chrome extension** (Chrome, Edge, Brave, Arc; version 145+): the web app, installed, plus *Open in Xivly* on arXiv pages and PDF links. The `_chrome.zip` from [Releases](https://github.com/julien-blanchon/xivly/releases): unzip it, turn on *Developer mode* at `chrome://extensions` and *Load unpacked*. See [Chrome extension](#chrome-extension).

There is no auto-update: Homebrew updates the Mac app; elsewhere, download the new release.

## Your library is a folder

Pick any folder (iCloud Drive, Dropbox, a git repo…). Xivly only writes plain files there:

```
<library>/
  AGENTS.md / CLAUDE.md       explains the layout to Claude Code, Codex, …
  .xivly/library.json         categories (name + matte color) and tags
  .xivly/hooks/               your scripts, run on events (desktop)
  papers/<year>-<title>/
    paper.pdf                 annotations are saved *inside* the PDF (standard PDF annotations)
    paper.json                title, authors, year, abstract, DOI, arXiv, GitHub / HF / project links, category, tags
```

Open the folder in Claude Code and ask it about your papers and highlights: it is all readable files. Unknown fields in `paper.json` are preserved, so agents and scripts can add their own.

### Hooks (desktop)

Drop a script named after an event in `.xivly/hooks/`: `paper-added`, `paper-saved`, `paper-updated`, `paper-removed` (extensions allowed: `paper-added.py`). It runs with the paper folder as cwd, `paper.json` on stdin and `XIVLY_*` env vars; output goes to `.xivly/logs/hooks.log`. See `.xivly/hooks/paper-added.sample`.

- **macOS**: executables (or `.sh`), through your login shell, so `PATH` matches your terminal.
- **Linux**: executables (or `.sh`), through `/bin/sh`.
- **Windows**: `.ps1` (PowerShell) or `.cmd` / `.bat`.

The app never writes hook scripts itself (only the `.sample`): enabling one is always your own act.

## Three targets, one codebase

| | Desktop (Tauri) | Web (GitHub Pages) and Chrome extension |
|---|---|---|
| Library folder | any folder (Rust, `src-tauri/src/library.rs`) | any folder via File System Access API (Chrome/Edge/Arc); browser storage (OPFS) elsewhere |
| Delete | Trash / Recycle Bin | `.xivly/trash/` |
| Hooks | ✅ | — (browsers can't run scripts) |
| Show in Finder / Explorer / Files | ✅ | — |

Everything else (library logic, metadata extraction, reader, annotations) is shared TypeScript. The platform is detected at runtime (`src/lib/platform/`); the web build differs only by its base path, the extension by its build flag (below).

```
src/lib/platform/   LibraryFs + Platform interface; tauri.ts / web.ts adapters
src/lib/extension/  Chrome extension only: service worker, "Open in Xivly"
src/lib/repo.ts     library layout, paper.json merge, import, save (shared)
src/lib/extract.ts  metadata extraction (svelte-pdf-mini analyzePaper + links/year)
src/lib/library.svelte.ts   app state (filters, search, categories, tags)
src/routes/         library (/) and reader (/read?id=…)
src-tauri/          thin Rust: fs primitives confined to the library, hooks, quit handshake
```

The desktop webview runs under a strict Content Security Policy (`src-tauri/tauri.conf.json`): only the services Xivly talks to (arXiv, Hugging Face, Semantic Scholar, OpenAlex, Crossref, the example library on Pages) are reachable.

## Develop

```sh
bun install
bun run tauri dev        # desktop
bun run dev              # web, http://localhost:1420
bun run check            # svelte-check
bun run test             # unit tests (Vitest)
bun run test:e2e         # end-to-end smoke test: the web build in Chromium (Playwright)
cargo test --manifest-path src-tauri/Cargo.toml   # Rust tests
bun run build:web        # static build for Pages (BASE_PATH=/xivly)
bun run build:extension  # Chrome extension: build-extension/ (unpacked) + dist/Xivly_<version>_chrome.zip
bun run dev:extension    # the same, unpacked, rebuilt on every change (live reload)
```

The e2e test (`tests/`) runs in Playwright's Chromium (`bunx playwright install chromium` once), or in another Chromium 145+ given by `XIVLY_E2E_BROWSER`, e.g. `XIVLY_E2E_BROWSER="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"`. The Rust side embeds the built frontend: `cargo test` and `cargo clippy` need a `build/` (`bun run build`).

To hack on svelte-pdf-mini at the same time: `cd ../svelte-pdf-mini/packages/svelte-pdf-mini && bun link`, then `bun link svelte-pdf-mini` here. Vite caches dependencies in memory: restart the dev server after rebuilding the library.

On macOS, `tauri dev` runs the app inside a small `Xivly Dev.app` wrapper (`scripts/dev-app.sh`) so it has a bundle identifier (`cc.blanchon.xivly.dev`): clipboard history apps then record its copies, and its data stays apart from the installed app.

## Chrome extension

The web app as an extension page (`chrome-extension://<id>/index.html`), from the same code: `bun run build:extension` builds it with `XIVLY_EXTENSION=1`, which

- switches SvelteKit to its hash router (`index.html#/read?id=…`: an extension is plain files, with no fallback page for `/read`) and its app folder to `app/` (Chrome reserves names starting with `_`), in `vite.config.js`;
- sets `__XIVLY_EXTENSION__` (`vite.config.js`), which gates the extension's own code (`src/lib/extension/`): the web and desktop bundles leave it out;
- then `scripts/build-extension.ts` moves SvelteKit's inline bootstrap script to `boot.js` (extension pages only run scripts from the package), bundles the service worker, renders the icons from `src-tauri/icons/icon.svg`, writes `manifest.json` from `package.json`'s version and zips it all.

What it adds to the web app:

- The toolbar button opens the library, or focuses the tab that shows it.
- **Open in Xivly** (right-click an arXiv abstract / PDF page or link, an alphaXiv or Hugging Face paper page, or any `.pdf` link; or the toolbar button's menu, *Open this tab in Xivly*, e.g. on a PDF open in Chrome): adds the paper (arXiv papers the same way as pasting their link) and opens it in the reader. An arXiv paper or a link already in the library just opens.

Permissions: `contextMenus` and `activeTab` (no install warning). Sites that let other sites download their PDFs (arXiv, most hosts with CORS) need nothing else; for the others Xivly asks first, then Chrome asks for that one site (`optional_host_permissions`). Nothing is read from pages, and no PDF is opened in Xivly unless you ask.

To try it: `bun run dev:extension`, then `chrome://extensions` → *Developer mode* → *Load unpacked* → `build-extension/`, once. It rebuilds on every change in `src/` or `static/` (about 5 s): open Xivly tabs reload by themselves, and the whole extension reloads (its tabs reopened) when the service worker or the manifest changes. After `bun run build:extension`, use the reload button on the extension's card instead. Inspect the service worker from that card, the app with the usual DevTools. The library folder is picked as on the web; Chrome keeps the extension's library (and its folder access) apart from the website's.

Publishing to the Chrome Web Store is part of the release workflow once set up (a one-time $5 developer fee): see [RELEASING.md](RELEASING.md#chrome-web-store-one-time-setup).

## Example library

On first start, Xivly offers a ready-made library of annotated papers (all tagged `#demo`). Its source is `starter/papers.json`: per paper, a category, tags, read state, and annotations anchored by quote or by figure / table / equation label. To rebuild it:

```sh
scripts/starter-pdfs.sh        # download + safely compress the PDFs into starter/pdfs/
bun run dev                    # then open /dev/starter and click "Build starter.zip"
gh release upload starter starter.zip --clobber   # the Pages deploy serves it at /xivly/starter/
```

In dev, the app reads the example library from `starter/build/` (unzip `starter.zip` there); it is never part of the app bundle.

## Release

```sh
bun run release 0.2.0 && git push --follow-tags
```

The `release` workflow builds the macOS (universal; app and DMG signed, notarized and stapled), Windows (`.exe`, `.msi`) and Linux (`.AppImage`, `.deb`, `.rpm`) apps and the Chrome extension (`_chrome.zip`) into one GitHub Release, publishes it once every build is there, then bumps `Casks/xivly.rb` in `julien-blanchon/homebrew-tap` and, once set up, submits the extension to the Chrome Web Store. Release svelte-pdf-mini first when Xivly needs a new version of it. Details, secrets and troubleshooting: [RELEASING.md](RELEASING.md). The `pages` workflow deploys the web version on every push to `main`; `ci` checks the web app (and builds the Chrome extension) and the Rust side on macOS, Windows and Linux; `cache` keeps the release builds' Rust cache warm.
