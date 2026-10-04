# χivly — papers without distraction

Read, annotate and organize research papers. A macOS app (Tauri) **and** a static web app (GitHub Pages) from the same codebase, built on [svelte-pdf-mini](https://github.com/julien-blanchon/svelte-pdf-mini).

```sh
brew install --cask julien-blanchon/tap/xivly   # install
brew upgrade --cask xivly                       # update (the only update channel)
```

## Your library is a folder

Pick any folder (iCloud Drive, Dropbox, a git repo…). Xivly only writes plain files there:

```
<library>/
  AGENTS.md / CLAUDE.md       explains the layout to Claude Code, Codex, …
  .xivly/library.json         categories (name + matte colour) and tags
  .xivly/hooks/               your scripts, run on events (desktop)
  papers/<year>-<title>/
    paper.pdf                 annotations are saved *inside* the PDF (standard PDF annotations)
    paper.json                title, authors, year, abstract, DOI, arXiv, GitHub / HF / project links, category, tags
```

Open the folder in Claude Code and ask it about your papers and highlights: it is all readable files. Unknown fields in `paper.json` are preserved, so agents and scripts can add their own.

### Hooks (desktop)

Drop an executable (or `.sh`) named after an event in `.xivly/hooks/`: `paper-added`, `paper-saved`, `paper-updated`, `paper-removed` (extensions allowed: `paper-added.py`). It runs through your login shell with the paper folder as cwd, `paper.json` on stdin and `XIVLY_*` env vars. See `.xivly/hooks/paper-added.sample`. Output goes to `.xivly/logs/hooks.log`.

## Two targets, one codebase

| | Desktop (Tauri) | Web (GitHub Pages) |
|---|---|---|
| Library folder | any folder (Rust, `src-tauri/src/library.rs`) | any folder via File System Access API (Chrome/Edge/Arc); browser storage (OPFS) elsewhere |
| Delete | macOS Trash | `.xivly/trash/` |
| Hooks | ✅ | — (browsers can't run scripts) |
| Show in Finder | ✅ | — |

Everything else (library logic, metadata extraction, reader, annotations) is shared TypeScript. The platform is detected at runtime (`src/lib/platform/`); the only build difference is the base path.

```
src/lib/platform/   LibraryFs + Platform interface; tauri.ts / web.ts adapters
src/lib/repo.ts     library layout, paper.json merge, import, save (shared)
src/lib/extract.ts  metadata extraction (svelte-pdf-mini analyzePaper + links/year)
src/lib/library.svelte.ts   app state (filters, search, categories, tags)
src/routes/         library (/) and reader (/read?id=…)
src-tauri/          thin Rust: fs primitives confined to the library, hooks
```

## Develop

```sh
bun install
bun run tauri dev        # desktop
bun run dev              # web, http://localhost:1420
bun run check            # svelte-check
bun run build:web        # static build for Pages (BASE_PATH=/xivly)
```

To hack on svelte-pdf-mini at the same time: `cd ../svelte-pdf-mini/packages/svelte-pdf-mini && bun link`, then `bun link svelte-pdf-mini` here.

## Release

```sh
bun run release 0.2.0 && git push --follow-tags
```

The `release` workflow builds a universal (Apple Silicon + Intel) app, signs and notarizes it when the Apple secrets are set (ad-hoc otherwise), publishes the GitHub Release and bumps `Casks/xivly.rb` in `julien-blanchon/homebrew-tap`. The `pages` workflow deploys the web version on every push to `main`.
