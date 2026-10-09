import { describe, expect, it } from 'vitest';
import type { NotesDoc } from '#lib/types.js';
import { notesToMarkdown } from './markdown';

const doc = (...content: unknown[]): NotesDoc => ({ type: 'doc', content });
const p = (...content: unknown[]) => ({ type: 'paragraph', content });
const t = (text: string, ...marks: (string | { type: string; attrs: object })[]) => ({ type: 'text', text, ...(marks.length ? { marks: marks.map((m) => (typeof m === 'string' ? { type: m } : m)) } : {}) });
const md = (...content: unknown[]) => notesToMarkdown(doc(...content));

describe('notesToMarkdown', () => {
	it('empty notes are empty', () => {
		expect(notesToMarkdown({ type: 'doc' })).toBe('');
		expect(md(p())).toBe('');
	});

	it('paragraphs and headings, a blank line apart; headings shift by an offset', () => {
		const d = doc({ type: 'heading', attrs: { level: 1 }, content: [t('Summary')] }, p(t('One.')), p(t('Two.')));
		expect(notesToMarkdown(d)).toBe('# Summary\n\nOne.\n\nTwo.');
		expect(notesToMarkdown(d, { headingOffset: 2 })).toBe('### Summary\n\nOne.\n\nTwo.');
		expect(notesToMarkdown(doc({ type: 'heading', attrs: { level: 5 }, content: [t('Deep')] }), { headingOffset: 3 })).toBe('###### Deep');
	});

	it('marks, with spaces kept outside them', () => {
		expect(md(p(t('a '), t('bold ', 'bold'), t('and '), t('both', 'bold', 'italic')))).toBe('a **bold** and ***both***');
		expect(md(p(t('gone', 'strike'), t(' '), t('under', 'underline')))).toBe('~~gone~~ <u>under</u>');
		expect(md(p(t('the docs', { type: 'link', attrs: { href: 'https://x.org/a b(1)' } })))).toBe('[the docs](https://x.org/a%20b(1%29)');
	});

	it('inline code: never escaped, fenced past its own backticks', () => {
		expect(md(p(t('a_b*c', 'code')))).toBe('`a_b*c`');
		expect(md(p(t('x ` y', 'code')))).toBe('``x ` y``');
	});

	it('escapes what would turn into formatting', () => {
		expect(md(p(t('2 * 3 = [six] <b>_x_</b>')))).toBe('2 \\* 3 = \\[six\\] \\<b\\>\\_x\\_\\</b\\>');
	});

	it('page chips as "(p. N)", or their label', () => {
		expect(md(p(t('See '), { type: 'paperLink', attrs: { page: 5.4, label: null } }, t(' and '), { type: 'paperLink', attrs: { page: 2, label: 'Fig. 2' } }))).toBe('See (p. 5) and (Fig. 2)');
	});

	it('lists, nested and numbered from their start', () => {
		const li = (...c: unknown[]) => ({ type: 'listItem', content: c });
		const nested = { type: 'bulletList', content: [li(p(t('inner')))] };
		expect(md({ type: 'bulletList', content: [li(p(t('one'))), li(p(t('two')), nested)] })).toBe('- one\n- two\n  - inner');
		expect(md({ type: 'orderedList', attrs: { start: 3 }, content: [li(p(t('three'))), li(p(t('four')))] })).toBe('3. three\n4. four');
	});

	it('checklists', () => {
		const item = (checked: boolean, text: string) => ({ type: 'taskItem', attrs: { checked }, content: [p(t(text))] });
		expect(md({ type: 'taskList', content: [item(true, 'read it'), item(false, 'reproduce it')] })).toBe('- [x] read it\n- [ ] reproduce it');
	});

	it('quotes (nested blocks too), code blocks, rules, line breaks', () => {
		expect(md({ type: 'blockquote', content: [p(t('first')), p(t('second'))] })).toBe('> first\n>\n> second');
		expect(md({ type: 'codeBlock', attrs: { language: 'py' }, content: [t('print(1)\nprint(2)')] })).toBe('```py\nprint(1)\nprint(2)\n```');
		expect(md({ type: 'codeBlock', content: [t('a ``` b')] })).toBe('~~~\na ``` b\n~~~');
		expect(md({ type: 'horizontalRule' })).toBe('---');
		expect(md(p(t('one'), { type: 'hardBreak' }, t('two')))).toBe('one  \ntwo');
	});

	it('maths, inline and as a block', () => {
		expect(md(p(t('Energy '), { type: 'inlineMath', attrs: { latex: 'E = mc^2' } }))).toBe('Energy $E = mc^2$');
		expect(md({ type: 'blockMath', attrs: { latex: '\\sum_i x_i ' } })).toBe('$$\n\\sum_i x_i\n$$');
	});

	it('images, by their path next to the notes', () => {
		expect(md({ type: 'image', attrs: { src: 'notes-assets/fig 1.png', alt: 'A [plot]', title: null } })).toBe('![A plot](notes-assets/fig%201.png)');
	});

	it('tables: the first row as the header, pipes escaped', () => {
		const cell = (type: string, text: string) => ({ type, content: [p(t(text))] });
		const row = (...cells: unknown[]) => ({ type: 'tableRow', content: cells });
		const table = { type: 'table', content: [row(cell('tableHeader', 'Model'), cell('tableHeader', 'Score')), row(cell('tableCell', 'a|b'), cell('tableCell', '0.9'))] };
		expect(md(table)).toBe('| Model | Score |\n| --- | --- |\n| a\\|b | 0.9 |');
	});

	it('an unknown block keeps its text', () => {
		expect(md({ type: 'callout', content: [p(t('still here'))] })).toBe('still here');
	});
});

