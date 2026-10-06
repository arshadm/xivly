<p align="center"><img src="src-tauri/icons/icon.png" width="128" height="128" alt=""></p>

<h1 align="center">Xivly</h1>
<p align="center"><em>Papers, without distraction.</em></p>

Read, annotate and organize research papers. A desktop app (Tauri: macOS, Windows, Linux) **and** a static web app (GitHub Pages) from the same codebase, built on [svelte-pdf-mini](https://github.com/julien-blanchon/svelte-pdf-mini).

- **macOS**: `brew install --cask julien-blanchon/tap/xivly` (update with `brew upgrade --cask xivly`), or the `.dmg` from [Releases](https://github.com/julien-blanchon/xivly/releases). Signed and notarized.
- **Windows**: the `.exe` (or `.msi`) installer from [Releases](https://github.com/julien-blanchon/xivly/releases). Not code-signed yet (SmartScreen asks once): signing is pending approval by the SignPath Foundation. Once it lands: free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org) ([code signing policy](CODE_SIGNING.md)).
- **Linux** (x86_64, glibc 2.39+: Ubuntu 24.04, Debian 13, Fedora 40 or newer): the `.AppImage`, `.deb` or `.rpm` from [Releases](https://github.com/julien-blanchon/xivly/releases). The `.deb` and `.rpm` use your system's WebKitGTK, which must be recent enough to run the PDF engine (Xivly says so on start if it isn't); the AppImage bundles its own.
- **Web**: [julien-blanchon.github.io/xivly](https://julien-blanchon.github.io/xivly), in a recent Chrome, Edge, Arc or Safari 26.

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

## Two targets, one codebase

| | Desktop (Tauri) | Web (GitHub Pages) |
|---|---|---|
| Library folder | any folder (Rust, `src-tauri/src/library.rs`) | any folder via File System Access API (Chrome/Edge/Arc); browser storage (OPFS) elsewhere |
| Delete | Trash / Recycle Bin | `.xivly/trash/` |
| Hooks | ✅ | — (browsers can't run scripts) |
| Show in Finder / Explorer / Files | ✅ | — |

Everything else (library logic, metadata extraction, reader, annotations) is shared TypeScript. The platform is detected at runtime (`src/lib/platform/`); the only build difference is the base path.

```
src/lib/platform/   LibraryFs + Platform interface; tauri.ts / web.ts adapters
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
bun run build:web        # static build for Pages (BASE_PATH=/xivly)
```

To hack on svelte-pdf-mini at the same time: `cd ../svelte-pdf-mini/packages/svelte-pdf-mini && bun link`, then `bun link svelte-pdf-mini` here. Vite caches dependencies in memory: restart the dev server after rebuilding the library.

On macOS, `tauri dev` runs the app inside a small `Xivly Dev.app` wrapper (`scripts/dev-app.sh`) so it has a bundle identifier (`cc.blanchon.xivly.dev`): clipboard history apps then record its copies, and its data stays apart from the installed app.

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

The `release` workflow builds the macOS (universal; app and DMG signed, notarized and stapled), Windows (`.exe`, `.msi`) and Linux (`.AppImage`, `.deb`, `.rpm`) apps into one GitHub Release, publishes it once every build is there, then bumps `Casks/xivly.rb` in `julien-blanchon/homebrew-tap`. Release svelte-pdf-mini first when Xivly needs a new version of it. Details, secrets and troubleshooting: [RELEASING.md](RELEASING.md). The `pages` workflow deploys the web version on every push to `main`; `ci` checks the web app and the Rust side on macOS, Windows and Linux; `cache` keeps the release builds' Rust cache warm.
