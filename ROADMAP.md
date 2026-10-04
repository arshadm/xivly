# Roadmap

How svelte-pdf-mini's features compose into Xivly. Guiding rule: **two screens (Library, Reader), one panel each, everything else on a keystroke.**

## v0.1 — scaffold (this commit)
- Library folder (desktop + web), categories with matte colours, tags, search, drag & drop import
- Metadata extraction on import: title, authors, abstract, arXiv, DOI, year, GitHub / Hugging Face / project links
- Reader: category-tinted page theme (`paperTheme`), contents (`Toc`), find, highlights & notes saved into the PDF (`exportPdf`, incremental), reading position restored, citation cards, cross-ref previews, link previews
- Hooks (desktop), release → GitHub Release → Homebrew cask, Pages deploy

## v0.2 — reader polish (all already in svelte-pdf-mini, mostly UI wiring)
- [ ] Port the docs demo UI kit (`apps/docs/src/lib/demos/components/pdf/*`): `PdfContextMenu`, `ShortcutsDialog`, `ThemePopover`, `AnnotationFilters`, `NoteHoverCard`
- [ ] Side-panel tabs: Figures (`Paper.Figures`), References (`Paper.References` + BibTeX copy), Pages (`Thumbnails`)
- [ ] `Minimap` heatmap of highlights, `Toc.Rail` already in
- [ ] Export notes to `papers/<id>/notes.md` on save (`store.toMarkdown()`), so agents read notes without parsing the PDF
- [ ] Night mode per category (`paperColors[].dark`), strength slider

## v0.3 — library
- [ ] First-page covers (docs `library/Cover.svelte`), cached as `papers/<id>/cover.webp`
- [ ] Quick look (space) with the docs crossfade dialog
- [ ] Command palette (⌘K): open paper, move to category, add tag, run hook
- [ ] Full-text search: index page text into `.xivly/index/` (svelte-pdf-mini `text-index`)
- [ ] Add by arXiv id / URL (desktop: fetch in Rust; web: arXiv has CORS)
- [ ] File watching on desktop (`notify` crate → `library-changed` event); today we reload on window focus

## v0.4 — metadata
- [ ] Upstream link extraction (`extractResourceLinks`) and year detection into `svelte-pdf-mini/core/paper/meta.ts`
- [ ] Enrichment via `openAlex` / `semanticScholar` providers (venue, citation count, tldr); Hugging Face Papers API for models/datasets/spaces
- [ ] Newer-version detection for arXiv papers + `reanchor` highlights onto v2

## Open questions
- Sync conflicts on iCloud: `paper.json` is merged per-key; PDFs are last-writer-wins. Good enough?
