# Roadmap

Planned features for this fork: split-view notes, a mind map per paper, named bookmarks, arXiv search, chat with Claude about a paper, and cloud sync. Each step ends in something that can be run and checked by itself.

## Decisions

| | |
|---|---|
| Platforms | Mac (Tauri desktop) first. Tablet and phone later, so files stay sync-friendly. |
| Web app / Chrome extension | They may lag behind, but must keep building (CI). |
| Sync | The library folder lives in a synced folder (iCloud Drive or Dropbox). No server. |
| LLM | The Claude Code CLI (`claude -p`), using your subscription login. Desktop only. |
| Notes | Rich text, stored as editor JSON in `papers/<id>/notes.json`. |
| Mind map | One per paper, in the split view. |
| Bookmarks | A named spot (fractional page) inside one paper. |
| arXiv | Saved searches, plus a "new since" feed for each. |

## Conventions

- **Per-paper data lives in the paper's folder** (`papers/<id>/`), next to `paper.pdf` and `paper.json`. Library-wide data lives in `.xivly/`. All of it is read and written through `Repo` (`src/lib/repo.ts`), which gives atomic writes and per-file locks.
- **Desktop-only features** are optional methods on `Platform` (`src/lib/platform/types.ts`), like `runHook?` and `reveal?`. The UI hides them when the method is missing, so the web and extension builds keep compiling.
- **Places in a paper** are a `PaperAnchor` (`src/lib/types.ts`, helpers in `src/lib/anchor.ts`). Bookmarks, links in notes, mind-map nodes and Claude's page citations all use it.
- **Per-device data** (reading position, last opened) should not go into shared files: with a synced folder they conflict on every scroll (see 6.1).
- **Every step leaves these checks passing:** `bun run check`, `bun run test`, `bunx knip`, `bun run build:web`, and `cargo test --manifest-path src-tauri/Cargo.toml` (after `bun run build`).

## Phase 0: Prepare the fork

- [x] **0.1 Make your own build separate from upstream.**
  - The bundle identifier is `io.github.arshadm.xivly`, so data and settings are kept apart from an installed upstream Xivly.
  - Releases are manual only, and never update the upstream Homebrew tap or stores.
  - *Test:* `bun run tauri dev` and `bun run tauri build` both work.
- [x] **0.2 Desktop-only features.** This is the `Platform` convention above, so no new code was needed. The checks were all green before any change.
- [x] **0.3 `PaperAnchor` and `jumpTo(viewer, anchor)`.** `jumpTo` jumps through the viewer's history, so "Back to page N" works.
  - *Test:* `src/lib/anchor.test.ts`.

## Phase 1: Named bookmarks

- [x] **1.1 Data model.**
  - `bookmarks: {id, name, page, created}[]` in `paper.json`, kept in page order (`src/lib/bookmarks.ts`).
  - `library.addBookmark`, `renameBookmark` and `removeBookmark` apply each change to the list on disk.
  - *Test:* `bookmarks.test.ts`, plus `library.test.ts` (other fields survive, and edits from another window and two adds at once are kept).
- [x] **1.2 Add a bookmark** with ⌘D (the spot you're reading), "Add bookmark here…" when right-clicking a page (the clicked spot), or the app menu. The suggested name is the section there, else the page.
- [x] **1.3 Bookmarks tab** in the side panel (⌥⌘6), with a count badge: click to jump (then "Back to page N"); rename and remove on hover.
- [x] **1.4 Go to bookmark** (⌘J): filter as you type, ↑ ↓ to choose, ↵ to jump.
  - *Test:* an e2e test in `tests/smoke.spec.ts` (add, reload, ⌘J).

## Phase 2: Split view and rich-text notes

- [ ] **2.1 Move the reader's viewer area into its own component** (`src/routes/read/+page.svelte` is ~900 lines), without changing behaviour. *Test:* the e2e test passes.
- [ ] **2.2 Resizable split pane** with the PDF on the left. The width and open state are remembered in settings.
- [ ] **2.3 Editor in the right pane** (TipTap/ProseMirror): headings, bold and italic, lists, quotes, code, links and undo. No saving yet. Its keyboard shortcuts must not clash with the reader's.
- [ ] **2.4 Save `notes.json`** (`{version, doc, updated}`) a short time after you stop typing, and also on close (`onFlush`). The save state shows in `SaveStatus`.
- [ ] **2.5 The same paper open in two windows:** one window edits and the other is read-only, or reloads when the file changes (`broadcast.ts`, `ReaderLock`).
- [ ] **2.6 Links to the paper:** "Link to current page" inserts a chip you click to jump. "Quote selection into notes" copies the selected text with its anchor.
- [ ] **2.7 Extras:** maths (KaTeX), tables, pasted images saved to `notes-assets/`, checklists.
- [ ] **2.8 Markdown export,** added to the existing notes export. Optionally, a `notes.md` written next to it on every save, for Claude Code and other agents.
- [ ] **2.9 Search:** find inside notes, and include note text in library search (`filter.ts`).

## Phase 3: arXiv search, saved searches, "new since"

- [ ] **3.1 API client** for `export.arxiv.org/api/query` (already allowed by the CSP). It parses the Atom XML into results, at most one request every 3 seconds. *Test:* Vitest with a saved Atom XML file.
- [ ] **3.2 Query builder:** keywords, author, category, date range and sort order, converted into arXiv's `search_query` syntax. *Test:* unit tests.
- [ ] **3.3 Search screen** in the library. Results already in the library are marked (by `paper.arxiv`). Import one or several selected results with `addFromArxiv`.
- [ ] **3.4 Saved searches** in `.xivly/searches.json`: save, rename, delete and run again.
- [ ] **3.5 "New since":** `seen` ids (capped) and `lastChecked` for each search, an unread count, and "mark all seen". Checked when the app starts and every few hours.
- [ ] **3.6 Nice-to-haves:** the abstract on hover, a default category and tags for each search, notifications.

## Phase 4: Chat with Claude about a paper (desktop)

- [ ] **4.1 Find `claude`.** Apps opened from Finder don't get your shell's PATH, so look it up through the login shell (`$SHELL -lc 'command -v claude'`), with a path in Settings as a fallback. Check it is installed and logged in.
- [ ] **4.2 One question, one answer.**
  - `src-tauri/src/llm.rs` starts `claude -p --output-format stream-json --verbose` with:
    - the working directory set to the paper's folder;
    - `--allowedTools Read`, so it can read but not edit or run anything.
  - Events stream to the frontend through a Tauri `Channel`, with a cancel command.
  - *Test:* a Rust test that uses a fake `claude` script.
- [ ] **4.3 Chat panel** as a right-pane tab, with streamed Markdown answers and a stop button.
- [ ] **4.4 Conversations:** `--resume <session_id>` for follow-up questions. Chats are saved in `papers/<id>/chats/<timestamp>.json` and listed.
- [ ] **4.5 Saved prompts** in `.xivly/prompts.json`, with placeholders such as `{{title}}`, `{{selection}}` and `{{notes}}`.
- [ ] **4.6 "Ask Claude about the selection"** in the PDF right-click menu.
- [ ] **4.7 Connect to notes:** "Insert answer into notes", and page citations like `[p. 7]` turned into anchor chips.

Use only your own installed and logged-in `claude` CLI. Never read or reuse its login tokens directly.

## Phase 5: Mind map per paper

- [ ] **5.1 Svelte Flow (`@xyflow/svelte`)** as a Mind map tab in the right pane, with a root node named after the paper's title.
- [ ] **5.2 Editing:** child node (Tab), sibling node (Enter), edit text in place, delete, drag, automatic tree layout. *Test:* the layout function has unit tests.
- [ ] **5.3 Save** `papers/<id>/mindmap.json` (`{version, nodes, edges}`) after typing and on close.
- [ ] **5.4 Nodes linked to the paper** (`PaperAnchor`), plus "Add selection as node".
- [ ] **5.5 Export** as PNG or SVG, and as a Markdown outline.
- [ ] **5.6 Optional:** generate a map with Claude (Phase 4).

## Phase 6: Sync through a synced folder

- [ ] **6.1 Keep per-device data out of shared files.** Move `position` and `opened` out of `paper.json` into per-device storage, with a migration.
- [ ] **6.2 Watch for changes on disk** with the Rust `notify` crate, and reload the library and open notes or mind maps when their files change. *Test:* edit a file by hand while the app is open.
- [ ] **6.3 An open PDF changed on disk:** reload it quietly, or ask which version to keep if there are unsaved annotations.
- [ ] **6.4 iCloud files not downloaded yet** (`.paper.pdf.icloud`): ask macOS to download them, and show progress on the cover. *Test:* `brctl evict`.
- [ ] **6.5 Conflict copies** (`paper 2.json`, `… (conflicted copy) …`): detect them, show a badge, and offer to resolve or merge.
- [ ] **6.6 Test with two Macs** (or two user accounts) on the same iCloud folder.
- [ ] **6.7 Mobile later:** Tauri 2 iOS with access to the iCloud container and a touch-friendly layout. This is its own project.

## Order

1. **0 → 1:** quick wins that set up the anchor type.
2. **2.1–2.6:** the core of the notes work.
3. **3:** independent of the others.
4. **4:** builds on the notes tab.
5. **5:** reuses the right pane and anchors.
6. **6.1 early, the rest last:** 6.1 is cheap and prevents conflicts later.
