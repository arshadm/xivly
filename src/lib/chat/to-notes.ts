// An answer from Claude (Markdown) as HTML the notes editor reads into its own
// nodes: [p. N] become page chips, $…$ / $$…$$ formulas, the rest Markdown.
import { marked } from 'marked';

const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const text = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The answer as notes HTML (page chips, formulas, Markdown). */
export function answerToNotesHtml(markdown: string): string {
	// Pulled out first (Markdown mustn't touch maths), put back after.
	const kept: string[] = [];
	const keep = (html: string) => `xivlykept${kept.push(html) - 1}x`;
	const src = markdown
		.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) => `\n\n${keep(`<div data-type="block-math" data-latex="${attr(tex.trim())}"></div>`)}\n\n`)
		.replace(/(?<![\\$\w])\$(?=[^\s$])([^$\n]*?[^\s$\\])\$/g, (_, tex: string) => keep(`<span data-type="inline-math" data-latex="${attr(tex)}"></span>`))
		.replace(/\[(pp?\.)\s*(\d+)((?:\s*[-–]\s*\d+)?)\]/g, (_, p: string, n: string, rest: string) => keep(`<span data-paper-link="" data-page="${n}">${text(`${p} ${n}${rest}`)}</span>`));
	const html = marked.parse(src, { async: false, gfm: true, breaks: false });
	return html.replace(/<p>(xivlykept\d+x)<\/p>/g, '$1').replace(/xivlykept(\d+)x/g, (_, i: string) => kept[Number(i)]);
}

/** The line put before an answer added to the notes. */
export const answerHeading = (question: string) => {
	const q = question.replace(/\s+/g, ' ').trim();
	return `<p><em>Claude, on “${text(q.length > 120 ? `${q.slice(0, 117)}…` : q)}”:</em></p>`;
};
