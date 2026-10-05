# Roadmap

Guiding rule: **two screens (Library, Reader), one panel each, everything else on a keystroke.**

## Shipped (v0.1)
- Library folder (desktop + web), categories with matte colours, tags, search, drag & drop import, hooks (desktop)
- Metadata extraction on import: title, authors, arXiv, DOI, year, GitHub / Hugging Face / project links
- Reader in its own window / tab: category-tinted pages, page frames, layouts & spread, zoom slider, find, focus glow
- Side panel (⌘B): contents, figures, references, thumbnails; minimap (pages / spine / heatmap), progress bar, TOC rail
- Annotations saved into the PDF: highlight, notes, boxes (filled or outlined), "Box it" on figures / tables / algorithms / equations; autosave + ⌘S
- Link, citation and cross-ref previews, backlinks, custom context menus, shortcuts help (?)
- Release → signed & notarized DMG → Homebrew cask; Pages deploy of the web build

## Next — reader
- [ ] Write `papers/<id>/notes.md` on every save (today: manual export), so agents read notes without parsing the PDF
- [ ] Annotation filters (by colour / author / type)

## Next — library
- [ ] First-page covers, cached as `papers/<id>/cover.webp`
- [ ] Quick look (space)
- [ ] Command palette (⌘K): open paper, move to category, add tag, run hook
- [ ] Full-text search across papers (svelte-pdf-mini `text-index`)
- [ ] Add by arXiv id / URL
- [ ] File watching on desktop (`notify` crate → `library-changed`); today we reload on window focus

## Next — metadata
- [ ] Move link and year extraction upstream into svelte-pdf-mini `core/paper/meta.ts`
- [ ] Enrichment via OpenAlex / Semantic Scholar (venue, citation count, tldr); Hugging Face Papers API
- [ ] Newer arXiv version detection + `reanchor` highlights onto v2

## Open questions
- Sync conflicts on iCloud: `paper.json` is merged per-key; PDFs are last-writer-wins. Good enough?
