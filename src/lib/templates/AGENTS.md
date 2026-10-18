# Xivly library

This folder is a research-paper library managed by [Xivly](https://github.com/julien-blanchon/xivly).
Everything is plain files: you can read, search and edit them directly.

## Layout

```
papers/<slug>/paper.pdf    the paper; highlights & notes are standard PDF annotations inside it
papers/<slug>/paper.json   metadata (see below)
papers/<slug>/notes.json   your notes on the paper: { version, updated, doc }, doc being
                           rich text as TipTap / ProseMirror JSON
papers/<slug>/notes.md     the same notes as Markdown, rewritten on every save (read it,
                           don't edit it: edit notes.json, or in Xivly)
papers/<slug>/notes-assets/  images in the notes (notes.json / notes.md refer to them by this path)
papers/<slug>/*            anything else you add (summary.md, code/, ...) is kept
notebooks/<slug>/notebook.json  a research notebook or a folder of them (see below)
.xivly/library.json        categories (id, name, color) and tags
.xivly/hooks/              scripts run by the desktop app on events
                           (paper-added, paper-saved, paper-updated, paper-removed)
```

## paper.json

```jsonc
{
  "title": "Attention Is All You Need",
  "authors": ["Ashish Vaswani", "..."],
  "year": 2017,
  "date": "2017-06",
  "abstract": "...",
  "doi": "10.48550/arXiv.1706.03762",
  "arxiv": "1706.03762",
  "links": { "project": "...", "github": ["..."], "huggingface": ["..."] },
  "category": "language",          // id from .xivly/library.json
  "tags": ["transformers"],
  "added": "2026-10-04T12:00:00Z",
  // named places; page is fractional (3.42 = 42% down page 3)
  "bookmarks": [{ "id": "1f3a9c2e", "name": "Main results", "page": 7.25, "created": "2026-10-09T12:00:00Z" }]
}
```

Unknown fields are preserved by Xivly, so you may add your own.

## notebook.json

Notebooks are kept in a tree of folders. Each folder and each notebook has its own
`notebooks/<slug>/notebook.json`:

```jsonc
{
  "kind": "notebook",              // or "folder" (holds notebooks and other folders)
  "title": "Sparse attention",
  "parent": "attention",           // the folder it's in; none: the top level
  "rank": 1.5,                     // order among the items of its folder, lower first
  "papers": ["2017-attention-is-all-you-need"],   // papers linked to it (ids in papers/)
  "created": "2026-10-17T12:00:00Z",
  "updated": "2026-10-17T12:00:00Z"
}
```

Unknown fields are preserved here too.

## Tips for agents

- Read a paper's text with any PDF tool (e.g. `pdftotext papers/<slug>/paper.pdf -`).
- Annotations written by Xivly are also embedded as JSON in the PDF (attachment `svelte-pdf-mini.json`).
- Do not rename `paper.pdf` / `paper.json`; Xivly relies on these names.
