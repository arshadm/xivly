# Xivly library

This folder is a research-paper library managed by [Xivly](https://github.com/julien-blanchon/xivly).
Everything is plain files: you can read, search and edit them directly.

## Layout

```
papers/<slug>/paper.pdf    the paper; highlights & notes are standard PDF annotations inside it
papers/<slug>/paper.json   metadata (see below)
papers/<slug>/*            anything else you add (summary.md, code/, ...) is kept
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

## Tips for agents

- Read a paper's text with any PDF tool (e.g. `pdftotext papers/<slug>/paper.pdf -`).
- Annotations written by Xivly are also embedded as JSON in the PDF (attachment `svelte-pdf-mini.json`).
- Do not rename `paper.pdf` / `paper.json`; Xivly relies on these names.
