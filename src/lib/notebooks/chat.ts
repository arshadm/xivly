// Chatting with Claude about a notebook: what each question sends. Claude sees the
// notebook's text (again whenever it changed), and only the papers you add with @:
// a paper's PDF (its folder is added, Claude reads it) or your notes and highlights
// on it (sent as Markdown). What's added stays in the conversation until it's
// cleared or summarized.
import type { Paper } from '#lib/types.js';
import { refLabel } from '#lib/notes/paper-ref.js';
import type { Chat } from '#lib/chat/store.js';

/** A paper added to the conversation: its PDF, or your notes and highlights on it. */
export interface ContextItem {
	paperId: string;
	kind: 'pdf' | 'notes';
	/** In the conversation only through a summary (mention it again to add it in full). */
	summarized?: boolean;
}

/** A notebook's conversation (`notebooks/<id>/chats/current.json`; earlier ones in `chats/archive/`). */
export interface NotebookChat extends Chat {
	/** What's been added with @, in order. */
	context: ContextItem[];
	/** A fingerprint of the notebook text Claude last saw (sent again once it differs). */
	sentText?: string;
	/** The summary of the conversation this one continues (Summarize). */
	summary?: string;
	/** How large the conversation is, in tokens (from the last answer). */
	tokens?: number;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The context list of a chat file (what's not a context item is left out). */
export function parseContext(v: unknown): ContextItem[] {
	if (!Array.isArray(v)) return [];
	return v
		.filter(isObject)
		.filter((c) => typeof c.paperId === 'string' && c.paperId && (c.kind === 'pdf' || c.kind === 'notes'))
		.map((c) => ({ paperId: c.paperId as string, kind: c.kind as ContextItem['kind'], ...(c.summarized === true && { summarized: true }) }));
}

export const sameItem = (a: ContextItem, b: ContextItem) => a.paperId === b.paperId && a.kind === b.kind;

/** A short fingerprint of a text (FNV-1a), to tell whether it changed. */
export function fingerprint(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
	return `${(h >>> 0).toString(16)}-${text.length}`;
}

/** What Claude is told, besides Claude Code's own instructions. */
export function notebookSystemPrompt(title: string) {
	return [
		`You are helping the user develop a research idea, written in their notebook "${title}" in their Xivly library. You are in the notebook's folder.`,
		'Its current text comes in the messages (again whenever it changed). You only know the papers the user adds to the conversation: for a PDF you are given its path (read it with the Read tool; use the pages parameter for long papers), for notes they come in the message.',
		'When you refer to a place in a paper, cite it with the paper’s short name as given and its PDF page number, as [Name, p. N] (e.g. [Vaswani et al. 2017, p. 4]): the user can click it to go there.',
		'Answer in Markdown, concisely. Say so when something isn’t in what you were given.'
	].join('\n');
}

export interface Added {
	item: ContextItem;
	paper: Pick<Paper, 'id' | 'title' | 'authors' | 'year'>;
	/** Your notes and highlights on it, as Markdown (kind `notes`). */
	notes?: string;
}

/** One question as sent: the notebook text if it changed, what was added, a summary to go on from, then the question. */
export function buildTurn(t: { question: string; notebookText?: string; added: Added[]; summary?: string }): string {
	const parts: string[] = [];
	if (t.summary) parts.push(`## Summary of our conversation so far\n\n${t.summary.trim()}`);
	if (t.notebookText !== undefined) parts.push(`## The notebook’s text${t.notebookText.trim() ? '' : ' (empty so far)'}\n\n${t.notebookText.trim()}`.trim());
	for (const { item, paper, notes } of t.added) {
		const name = `“${paper.title}” [${refLabel(paper)}]`;
		if (item.kind === 'pdf') parts.push(`## Paper added: ${name}\n\nIts PDF is ../../papers/${paper.id}/paper.pdf (metadata in paper.json beside it).`);
		else parts.push(`## My notes and highlights on ${name}\n\n${notes?.trim() || '(none yet)'}`);
	}
	if (!parts.length) return t.question;
	return [...parts, `## Question\n\n${t.question}`].join('\n\n');
}

/** What Summarize asks (in the conversation being summarized). */
export const SUMMARY_REQUEST =
	'Summarize our conversation so far for a new conversation that will continue from it: the idea being developed, what we concluded, open questions, and what each added paper contributed (keep their short names and the pages that matter). Be complete but concise, in Markdown. Reply with the summary only.';

/** `[Vaswani et al. 2017, p. 4]` (a paper in the conversation) as a link the chat turns into showing that page. */
export function linkCitations(markdown: string, papers: readonly Pick<Paper, 'id' | 'title' | 'authors' | 'year'>[]): string {
	const byLabel = new Map(papers.map((p) => [refLabel(p).toLowerCase(), p.id]));
	return markdown.replace(/\[([^\][]+?),\s*pp?\.\s*(\d+)(?:\s*[-–]\s*\d+)?\]/g, (whole, label: string, page: string) => {
		const id = byLabel.get(label.trim().toLowerCase());
		return id ? `[${label.trim()}, p. ${page}](#xivly-paper-${encodeURIComponent(id)}-${page})` : whole;
	});
}

/** The paper and page of a citation link (see linkCitations), or null. */
export function citationTarget(href: string): { paperId: string; page: number } | null {
	const m = /^#xivly-paper-(.+)-(\d+)$/.exec(href);
	return m ? { paperId: decodeURIComponent(m[1]), page: Number(m[2]) } : null;
}

/** A paper's notes and highlights as one Markdown text (either may be empty). */
export function notesAndHighlights(notes: string, highlights: string): string {
	return [notes.trim() && `### Notes\n\n${notes.trim()}`, highlights.trim() && `### Highlights\n\n${highlights.trim()}`].filter(Boolean).join('\n\n');
}
