// Your notes and highlights on a paper as Markdown, for a notebook's chat (@paper · notes):
// the notes from notes.json, the highlights and comments read from the PDF itself.
import { notesToMarkdown } from '#lib/notes/markdown.js';
import type { Repo } from '#lib/repo.js';
import { notesAndHighlights } from './chat';

export async function paperNotesMarkdown(repo: Repo, paperId: string): Promise<string> {
	const [notes, highlights] = await Promise.all([
		repo
			.readNotes(paperId)
			.then((f) => (f ? notesToMarkdown(f.doc) : ''))
			.catch(() => ''),
		repo
			.readPdf(paperId)
			.then(async (bytes) => {
				if (!bytes) return '';
				// pdf-lib only: loaded when first needed.
				const { importAnnotations, annotationsToMarkdown } = await import('svelte-pdf-mini/pdf-codec');
				const { annotations } = await importAnnotations(bytes);
				return annotations.length ? annotationsToMarkdown(annotations) : '';
			})
			.catch(() => '')
	]);
	return notesAndHighlights(notes, highlights);
}
