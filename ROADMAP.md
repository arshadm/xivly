# Roadmap

Guiding rule: **two screens (Library, Reader), one panel each, everything else on a keystroke.**

## Shipped (v0.1)
- Library folder (desktop + web), categories with matte colors, tags, search, drag & drop import, hooks (desktop)
- Metadata extraction on import: title, authors, arXiv, DOI, year, GitHub / Hugging Face / project links
- Reader in its own window / tab: category-tinted pages, page frames, layouts & spread, zoom slider, find, focus glow
- Side panel (⌘B): contents, figures, references, thumbnails; minimap (pages / spine / heatmap), progress bar, TOC rail
- Annotations saved into the PDF: highlight, notes, boxes (filled or outlined), "Box it" on figures / tables / algorithms / equations; autosave + ⌘S
- Link, citation and cross-ref previews, backlinks, custom context menus, shortcuts help (?)
- Release → signed & notarized DMG → Homebrew cask; Pages deploy of the web build

## Shipped (v0.2)
- Windows and Linux builds next to macOS, from one release workflow
- Example library on first start (annotated papers, tagged `#demo`), removable from Settings
- Covers (book, stack, flat, first page), read state with a ribbon, read / unread filter, archive tag
- Add papers from one panel: an arXiv link, or PDF files (drop or pick); paste an arXiv link anywhere
- Hugging Face paper page, models and spaces citing the paper; metadata cache and refresh
- Ink smoothing (steady by default), emoji stickers, free text in the app font
- Side notes that fit tighter windows (over the page's blank margin), unified hover previews
- Click-to-cycle controls (pages per row, scrolling, sort), custom category colors
- Copies reach the system clipboard (and clipboard history apps)
- Content Security Policy, hook scripts only ever written by the user

## Next — reader
- [ ] Write `papers/<id>/notes.md` on every save (today: manual export), so agents read notes without parsing the PDF

## Next — library
- [ ] Quick look (space)
- [ ] Command palette (⌘K): open paper, move to category, add tag, run hook
- [ ] Full-text search across papers (svelte-pdf-mini `text-index`)
- [ ] File watching on desktop (`notify` crate → `library-changed`); today we reload on window focus

## Next — platforms
- [ ] Auto-update outside Homebrew (`tauri-plugin-updater`)
- [ ] Windows code signing (SmartScreen)

## Next — metadata
- [ ] Enrichment via OpenAlex / Semantic Scholar (venue, citation count, tldr)
- [ ] Newer arXiv version detection + `reanchor` highlights onto v2

## Open questions
- Sync conflicts on iCloud: `paper.json` is merged per-key; PDFs are last-writer-wins. Good enough?
