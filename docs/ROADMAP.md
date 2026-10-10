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
| Mind map | Blocks inside the notes (several per paper), balanced radial layout, topics with a little formatting. |
| Bookmarks | A named spot (fractional page) inside one paper. |
| arXiv | A feed in the library, imported from `tools/arxiv/arxiv_fetch.py` (which keeps fetching and scoring, run by hand). Papers are added by hand. |

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

## Phase 3: arXiv feed (imported from arxiv_fetch, add to library)

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
- [x] **3.4 Add to library, dismiss and restore:** "Add" imports the paper through the existing arXiv import, keeps its topics as tags, and links the card to the library paper ("Open"). Dismiss with undo; a Dismissed view to restore.
- ~~3.5–3.8 Checking arXiv and scoring in Xivly~~: **dropped (2026-10-09).** `arxiv_fetch.py` keeps fetching and scoring, run by hand; Xivly imports what it found (3.2, re-run any time: papers merge, and decisions made in Xivly are kept). The Claude bridge moves back to Phase 4.
- [x] **3.9 Refresh from the tool:** a "Refresh from arxiv_fetch" button in the feed that remembers the tool's folder, so bringing in a new run takes one click.
- [ ] **3.10 Nice-to-haves:** "new since the last refresh" highlighting, keyword filters saved as views.

## Phase 4: Chat with Claude about a paper (desktop)

- [x] **4.1 Find `claude`** (`src-tauri/src/claude.rs`): through the login shell (a GUI app's PATH is bare), else the usual places, else a path set in **Settings › Claude**, which also shows the version found and has the model choice (Sonnet by default).
- [x] **4.2 One question, one answer:**
  - `claude -p --output-format stream-json --verbose --include-partial-messages`, run in the paper's folder (checked to be inside the library). The prompt goes on stdin.
  - `--strict-mcp-config --setting-sources ""` (no MCP servers or user settings), `--tools`/`--allowedTools` limited to what Xivly allows, `--session-id` (new) or `--resume` (continued), the model, and an appended system prompt.
  - Every event is streamed to the window through a Tauri `Channel`; `claude_cancel` stops a run.
  - `src/lib/chat/events.ts` turns the events into an answer (text as it streams, "Reading paper.pdf…", session, cost, errors).
  - *Test:* Rust tests (the arguments; a stand-in `claude` script for streaming and exit codes; an ignored test against the real CLI), and `events.test.ts`.
- [x] **4.3 Chat panel:** the right pane has **Notes | Chat** tabs (both stay alive), ⌘⇧E opens the chat with the question box focused. Answers stream in as text, then show rendered (Markdown, maths); what Claude did shows under them ("Reading paper.pdf (pages 1-3)"); `[p. N]` citations are chips that jump to the page. Stop cancels. Suggested first questions.
- [x] **4.4 Conversations:** saved as `papers/<id>/chats/<chat>.json` with the Claude Code session, continued with `--resume`, the latest one reopened; New chat, and earlier chats from the history menu. *Test:* `store.test.ts`, `session.test.ts` (a stand-in claude), and an e2e test where the web build is given a stand-in claude.
- [x] **4.5 Saved prompts** in `.xivly/prompts.json` (library-wide; defaults until edited): the chat's ✨ menu, the empty chat's suggestions, placeholders `{{title}}`, `{{authors}}`, `{{year}}`, `{{abstract}}`, `{{selection}}` (the text selected in the paper, kept a couple of minutes), `{{notes}}` (notes.md). "Save this question as a prompt", and an editor in Settings › Claude. *Test:* `prompts.test.ts` and an e2e test.
- [x] **4.6 Claude on a selection:** right-click selected text › "Ask Claude about this…" (the passage quoted with its page in the question box, to ask about) or "Explain this with Claude" (asked at once).
- [x] **4.7 Into the notes:** "Add to notes" on an answer puts it at the end of the notes under "Claude, on “the question”:", its Markdown as notes formatting, `[p. N]` as page chips and `$…$` as formulas (`src/lib/chat/to-notes.ts`). "Copy" copies the Markdown. *Test:* `to-notes.test.ts` and e2e tests for 4.6 and 4.7.

Run only your own installed and logged-in `claude` CLI. Xivly never reads or reuses its login tokens.

## Phase 5: Mind maps in the notes

Decided 2026-10-10:
- **Blocks in the notes:** a mind map is a block inside the notes document (like a table or a maths block), not a separate tab or cell list. Text around it grows and shrinks as usual, each map has its own height (resizable), undo covers both, and the toolbar follows what's being edited.
- **Radial ("balanced") layout:** the central topic in the middle, its branches split left and right by size, each growing outward.
- **Topics with a little formatting:** bold, italic, code, maths, page links.
- **Drawn without a graph library:** HTML topics plus SVG curves, with pan, zoom and fit.

- [x] **5.1 Model and layout** (`src/lib/mindmap/`):
  - **Tree:** each topic has `{id, text, page?, collapsed?, children}`, and the map stores its height.
  - **Edits:** add child, add sibling, delete, move among siblings, promote, demote. Pure functions.
  - **Balanced layout:** works from measured topic sizes.
  - **Outline:** the map as nested Markdown, for `notes.md`, export and Claude.
  - *Test:* unit tests for edits, layout (sides balanced, no overlaps) and the outline.
- [x] **5.2 The block:** a TipTap `mindMap` node whose block view is isolated from the text editor (its keys, mouse and selection), with a drag handle to resize its height. Every map change is an editor transaction, so ⌘Z undoes it with the text. Inserted from the toolbar, it starts with the paper's title as the root.
- [x] **5.3 Drawing and editing:** topics with inline formatting, curved branches, pan (drag the background), zoom (⌘-scroll, pinch, buttons), fit. Click to select. Tab adds a child, Enter a sibling, Delete removes, arrow keys move between topics, ⌥-arrows move a topic. Typing or double-click edits; Esc or Enter finishes. Branches collapse and expand.
  - A new topic stays on the canvas until its text is done, then joins the notes with that text as one undo step; one left empty leaves no trace.
  - *Test:* an e2e test (built with the keyboard, bold, undo and redo, empty topics, arrows, kept after a reload, outline in the export).
- [x] **5.4 Toolbar that follows:** while a map is selected, the bar shows map tools (child, sibling, delete, bold, italic, code, link to page, tidy, fit, zoom, export) instead of text formatting.
- [x] **5.5 Links to the paper:** a topic can carry a **p. N** link (to the page you're reading) that jumps there. In the PDF, right-click a selection › "Add to mind map" adds it as a topic with its page.
- [ ] **5.6 Out and in:** export as PNG or SVG, or copy as an outline. `notes.md` and the Markdown export show maps as outlines. A saved prompt has Claude draft a map of the paper, and an answer can be inserted as a map.

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
3. **3:** the arXiv feed (imported from arxiv_fetch).
4. **4:** builds on the notes tab.
5. **5:** mind maps as blocks in the notes.
6. **6.1 early, the rest last:** 6.1 is cheap and prevents conflicts later.
