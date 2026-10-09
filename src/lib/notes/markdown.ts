// The notes (TipTap / ProseMirror JSON) as Markdown, for the notes export and
// notes.md (read by Claude Code, scripts…), and as plain text for search.
import { anchorLabel } from '#lib/anchor.js';
import type { NotesDoc } from '#lib/types.js';
import { toAnchor } from './paper-link';

interface Node {
	type: string;
	text?: string;
	attrs?: Record<string, unknown>;
	marks?: { type: string; attrs?: Record<string, unknown> }[];
	content?: Node[];
}

export interface MarkdownOptions {
	/** Added to every heading level (notes under a "## Notes" heading: 2). */
	headingOffset?: number;
}

/** The notes as Markdown (no trailing newline; empty notes give ''). */
export function notesToMarkdown(doc: NotesDoc, opts: MarkdownOptions = {}): string {
	return blocks((doc.content ?? []) as Node[], opts).trim();
}

/** All the text in the notes, blocks on their own lines (search). */
export function notesToText(doc: NotesDoc): string {
	const out: string[] = [];
	const walk = (n: Node) => {
		if (n.type === 'text') out.push(n.text ?? '');
		else if (n.type === 'paperLink') out.push(anchorLabel(toAnchor(n.attrs ?? {})));
		else if (n.type === 'inlineMath' || n.type === 'blockMath') out.push(String(n.attrs?.latex ?? ''));
		n.content?.forEach(walk);
		if (n.type !== 'text' && n.type !== 'paperLink' && !isInline(n)) out.push('\n');
	};
	((doc.content ?? []) as Node[]).forEach(walk);
	return out.join('').replace(/\n{2,}/g, '\n').trim();
}

const isInline = (n: Node) => ['text', 'paperLink', 'hardBreak', 'inlineMath'].includes(n.type);

// ── Blocks ────────────────────────────────────────────────────────────

function blocks(nodes: Node[], opts: MarkdownOptions): string {
	return nodes
		.map((n) => block(n, opts))
		.filter((s) => s !== null)
		.join('\n\n');
}

function block(n: Node, opts: MarkdownOptions): string | null {
	switch (n.type) {
		case 'paragraph':
			return inline(n.content);
		case 'heading': {
			const level = Math.min(6, Math.max(1, Number(n.attrs?.level ?? 1) + (opts.headingOffset ?? 0)));
			return `${'#'.repeat(level)} ${inline(n.content)}`;
		}
		case 'blockquote':
			return prefixLines(blocks(n.content ?? [], opts), '> ', '>');
		case 'codeBlock': {
			const code = (n.content ?? []).map((t) => t.text ?? '').join('');
			const fence = code.includes('```') ? '~~~' : '```';
			return `${fence}${String(n.attrs?.language ?? '')}\n${code}\n${fence}`;
		}
		case 'horizontalRule':
			return '---';
		case 'bulletList':
			return list(n, opts, () => '- ');
		case 'orderedList': {
			const start = Number(n.attrs?.start ?? 1);
			return list(n, opts, (i) => `${start + i}. `);
		}
		case 'taskList':
			return list(n, opts, (_, item) => `- [${item.attrs?.checked ? 'x' : ' '}] `);
		case 'blockMath':
			return `$$\n${String(n.attrs?.latex ?? '').trim()}\n$$`;
		case 'image':
			return image(n);
		case 'table':
			return table(n);
		default:
			// Unknown blocks (a future node type): their text, rather than nothing.
			return n.content ? blocks(n.content, opts) : null;
	}
}

/** List items: the marker, then the item's blocks indented under it (tight: one line apart). */
function list(n: Node, opts: MarkdownOptions, marker: (i: number, item: Node) => string): string {
	return (n.content ?? [])
		.map((item, i) => {
			const m = marker(i, item);
			const body = (item.content ?? []).map((b) => block(b, opts) ?? '').join('\n');
			return m + prefixLines(body, ' '.repeat(m.length), '').trimStart();
		})
		.join('\n');
}

function table(n: Node): string {
	const rows = (n.content ?? []).map((row) => (row.content ?? []).map((cell) => cellText(cell)));
	if (!rows.length) return '';
	const width = Math.max(...rows.map((r) => r.length));
	const pad = (r: string[]) => [...r, ...Array(width - r.length).fill('')];
	const line = (r: string[]) => `| ${pad(r).join(' | ')} |`;
	return [line(rows[0]), line(Array(width).fill('---')), ...rows.slice(1).map(line)].join('\n');
}

/** A table cell on one line: its paragraphs joined with <br>, pipes escaped. */
const cellText = (cell: Node) =>
	(cell.content ?? [])
		.map((b) => (b.type === 'paragraph' ? inline(b.content) : (block(b, {}) ?? '')))
		.join('<br>')
		.replace(/\|/g, '\\|')
		.replace(/\n/g, ' ');

function image(n: Node): string {
	const src = String(n.attrs?.src ?? '');
	const alt = String(n.attrs?.alt ?? '').replace(/[[\]]/g, '');
	const title = n.attrs?.title ? ` "${String(n.attrs.title).replace(/"/g, '\\"')}"` : '';
	return `![${alt}](${src.replace(/ /g, '%20')}${title})`;
}

function prefixLines(text: string, prefix: string, emptyPrefix: string): string {
	return text
		.split('\n')
		.map((l) => (l ? prefix + l : emptyPrefix))
		.join('\n');
}

// ── Inline ────────────────────────────────────────────────────────────

function inline(nodes: Node[] | undefined): string {
	return (nodes ?? []).map(inlineNode).join('');
}

function inlineNode(n: Node): string {
	switch (n.type) {
		case 'text':
			return marked(n);
		case 'hardBreak':
			return '  \n';
		case 'paperLink':
			return `(${anchorLabel(toAnchor(n.attrs ?? {}))})`;
		case 'inlineMath':
			return `$${String(n.attrs?.latex ?? '')}$`;
		default:
			return inline(n.content);
	}
}

/** Characters that would start Markdown formatting in plain text. */
const escape = (s: string) => s.replace(/([\\`*_[\]<>])/g, '\\$1');

function marked(n: Node): string {
	const marks = n.marks ?? [];
	const has = (t: string) => marks.find((m) => m.type === t);
	const text = n.text ?? '';
	let out = has('code') ? code(text) : escape(text);
	// Markdown can't wrap leading / trailing spaces: keep them outside the markers.
	const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(out)!;
	if (!core) return out;
	out = core;
	if (has('italic')) out = `*${out}*`;
	if (has('bold')) out = `**${out}**`;
	if (has('strike')) out = `~~${out}~~`;
	if (has('underline')) out = `<u>${out}</u>`;
	const link = has('link');
	if (link) out = `[${out}](${String(link.attrs?.href ?? '').replace(/\)/g, '%29').replace(/ /g, '%20')})`;
	return lead + out + trail;
}

/** Inline code, with a fence longer than any run of backticks inside it. */
function code(text: string) {
	const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((r) => r.length));
	const fence = '`'.repeat(longest + 1);
	const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
	return `${fence}${pad}${text}${pad}${fence}`;
}
