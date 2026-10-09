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
| arXiv | Port `tools/arxiv/arxiv_fetch.py`: catchup fetching, topic matching, Claude P1–P5 scoring, a feed in the library. Papers are added by hand; checks run on demand. |

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

- [x] **2.1 Move the reader's viewer area into its own component** (`src/routes/read/+page.svelte` is ~900 lines), without changing behaviour. *Test:* the e2e test passes.
- [x] **2.2 Resizable split pane** on the right, the full height of the window (`SplitPane.svelte`), toggled with ⌘E, the header's notebook button or View › Notes pane. Drag its left edge (or ← → when focused; double-click for the default width). The width (280px up to 60% of the window) and open state are remembered in settings.
- [x] **2.3 Editor in the right pane** (TipTap 3, `src/lib/notes/NotesEditor.svelte`):
  - A formatting bar: bold, italic, underline, strikethrough, inline code, links, headings 1–3, lists, quotes, code blocks, undo and redo.
  - Markdown shortcuts as you type (`#`, `-`, `>`, backticks, `**bold**`). ⌘-click opens a link.
  - Keys the editor uses (⌘B, ⌘I, ⌥⌘1–3…) don't reach the reader. ⌘E still toggles the pane, so inline code has no shortcut.
  - No saving yet.
- [x] **2.4 Save `notes.json`** (`{version, updated, doc}`) a short time after you stop typing (`src/lib/notes/saver.svelte.ts`, one write at a time, retried on failure), when the pane is hidden, and before the window closes or the app quits. The pane's header shows Saving… / Saved / Not saved.
  - A `notes.json` that can't be read is never overwritten: the pane says why instead.
  - Fields added by agents are kept.
  - *Test:* `saver.test.ts`, the notes tests in `repo.test.ts`, and the e2e notes test (reload, hide right after typing).
- [x] **2.5 The same paper in two windows:** a paper is read in one window at a time (`ReaderLock`), and handing it over writes its notes first. *Test:* the e2e "one reader per paper" test.
- [x] **2.6 Links to the paper:**
  - The formatting bar's "Link to the page you're reading" inserts a page chip ("p. 5"), stored as `{type: "paperLink", attrs: {page, label}}`. Clicking a chip jumps there (then "Back to page N").
  - Right-clicking selected text offers "Quote in notes": the text as a quote at the end of the notes, with a chip just above its first line. It opens the notes pane if it's hidden.
  - *Test:* `paper-link.test.ts`, `anchor.test.ts`, and the e2e "notes link to the paper" test.
- [x] **2.7 Extras:**
  - **Checklists:** `[ ] `, ⌘⇧9 or the bar; nested; ticked items struck through.
  - **Tables:** inserted from the bar; Tab moves between cells; a Table bar adds or deletes rows and columns and turns the header row on or off.
  - **Maths (KaTeX):** `$x$` inline and `$$x$$` alone on a line, as you type; prices like "$5 and $6" stay text. Bar buttons too; click a formula to edit it (`src/lib/notes/maths.ts`).
  - **Images:** pasted, dropped or picked, kept as `notes-assets/<hash>.<ext>` next to the paper (the same image once), shown from the library (`src/lib/notes/images.ts`).
  - *Test:* `maths.test.ts`, `images.test.ts`, the notes images tests in `repo.test.ts`, and an e2e test for each.
- [x] **2.8 Markdown:**
  - "Export › Notes as Markdown…" (or Paper info's export button) gives the title, then your notes under "## Notes" (headings shifted down two levels, page chips as "(p. 5)"), then the highlights by section.
  - `notes.md` is rewritten next to `notes.json` on every save, for Claude Code and other tools. The converter (`src/lib/notes/markdown.ts`) also covers maths, tables, images and checklists.
  - *Test:* `markdown.test.ts`, the notes.md test in `repo.test.ts`, and the e2e export test (it reads the downloaded file).
- [x] **2.9 Search:**
  - ⌘F while in the notes opens their own find bar: all matches highlighted, ↵ / ⇧↵ to step, Esc to close (`src/lib/notes/find.ts`). On the page, ⌘F is still the paper's find.
  - The library's search also matches what a paper's notes say (its `notes.md`, read once a search starts, at most every 10 s).
  - *Test:* `find.test.ts`, `filter.test.ts`, `repo.test.ts`, and the e2e search test.

## Phase 3: arXiv feed (fetch, score with Claude, add to library)

This replaces the earlier "saved searches" plan. It ports the workflow of the `tools/arxiv/arxiv_fetch.py` script into Xivly:
- **Fetch:** read arXiv's daily `catchup` pages. arXiv's robots.txt disallows `/api` and `/search`, which explains the 429 errors; catchup is allowed with 15 seconds between requests and covers the last 90 days.
- **Match:** filter by your categories and topics.
- **Score:** P1–P5 with a reason, using `claude -p` against your subscription.
- **Show:** a feed in the library. You add papers to the library yourself (nothing is added automatically), and checks only run when you ask (a button or menu item).

Catchup pages don't allow cross-origin reads, so fetching (and running `claude`) happens on the Rust side: these features are desktop-only.

**Storage** lives in the library folder, so it syncs:
- `.xivly/feed/config.json`: categories, topics (term lists), search field, profile, rubric, model, batch size.
- `.xivly/feed/state.json`: the end of the last successful run's window, and recent runs.
- `.xivly/feed/papers/<YYYY-MM>.json`: papers by announcement month (small files, fewer sync conflicts). Each has its metadata, topics, priority and reason, when it was first seen, when it was dismissed, and which library paper it was added as.

- [x] **3.1 Feed model and storage:** types, normalizing (hand-edited files must not break the app), `Repo` read/write by month, merging a run's papers into what's stored (topics merged; scores and dismissals kept). *Test:* unit tests with `MemoryFs`.
- [x] **3.2 Import from `arxiv_fetch`:** a one-time import (Settings › arXiv feed › Import…) of `arxiv.db` (papers, scores, reasons, dismissals, run windows) and `config.json` (categories, topics, profile, rubric). The SQLite file is read in Rust. *Test:* Rust test with a small fixture database; e2e of the feed afterwards.
- [x] **3.3 Feed view:** "arXiv feed" in the library sidebar, with priority chips (P1–P3 on by default, with counts), topic chips, search (title, abstract, authors, reason), newest-first grouped by day or by priority, cards showing the priority badge, reason, metadata and an expandable abstract, and links to arXiv and the PDF.
- [ ] **3.4 Add to library, dismiss and restore:** "Add" imports the paper through the existing arXiv import, keeps its topics as tags, and links the card to the library paper ("Open"). Dismiss with undo; a Dismissed view to restore.
- [ ] **3.5 Claude bridge (shared with Phase 4):** Rust finds `claude` (through the login shell, or a path set in Settings) and runs `claude -p --output-format json` with a prompt on stdin, a timeout and no MCP or settings. Cancellable. *Test:* Rust test with a fake `claude` script.
- [ ] **3.6 Scoring:** the prompt (profile and rubric, batches of 20, `<paper>` blocks), reading a JSON array out of the reply, retries, and caching (scored papers aren't scored again; "Rescore" in a menu). *Test:* the prompt builder and reply parser have unit tests.
- [ ] **3.7 Fetching catchup:** Rust fetches `arxiv.org/catchup/<archive>/<day>?abs=True` with the 15-second delay, retries and a 429 back-off. The HTML is parsed in TypeScript and matched to topics. The window runs from the last run (or 7 days) up to today, at most 90 days back. *Test:* the parser and matcher, with a saved catchup page as a fixture.
- [ ] **3.8 "Check now":** a feed toolbar button and a menu item. Progress shows day and archive, then scoring; it can be cancelled, and gives a summary when done (found, new, scored). Runs are recorded in `state.json`.
- [ ] **3.9 Settings › arXiv feed:** edit categories, topics, profile, rubric and model, with "Rescore all" after a profile change.
- [ ] **3.10 Nice-to-haves:** unread counts in the sidebar, "new since last check" highlighting, keyword filters saved as views.

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
3. **3:** the arXiv feed. Its Claude bridge (3.5) is the base of Phase 4.
4. **4:** builds on the notes tab.
5. **5:** reuses the right pane and anchors.
6. **6.1 early, the rest last:** 6.1 is cheap and prevents conflicts later.
