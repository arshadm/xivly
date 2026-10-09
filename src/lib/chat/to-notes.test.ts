import { describe, expect, it } from 'vitest';
import { answerHeading, answerToNotesHtml } from './to-notes';

describe('an answer into the notes', () => {
	it('Markdown as HTML', () => {
		const html = answerToNotesHtml('It is **calm**.\n\n- one\n- two');
		expect(html).toContain('<strong>calm</strong>');
		expect(html).toContain('<li>one</li>');
	});

	it('page citations become chips the notes read', () => {
		expect(answerToNotesHtml('See [p. 4] and [pp. 6–7].')).toBe('<p>See <span data-paper-link="" data-page="4">p. 4</span> and <span data-paper-link="" data-page="6">pp. 6–7</span>.</p>\n');
	});

	it('maths, inline and as a block, untouched by Markdown', () => {
		const html = answerToNotesHtml('The loss $L_{a*b}$ is:\n\n$$\\sum_i x_i * y_i$$\n\nDone.');
		expect(html).toContain('<span data-type="inline-math" data-latex="L_{a*b}"></span>');
		expect(html).toContain('<div data-type="block-math" data-latex="\\sum_i x_i * y_i"></div>');
		expect(html).not.toContain('<p><div');
	});

	it('the heading quotes the question, escaped and shortened', () => {
		expect(answerHeading('Is a < b?')).toBe('<p><em>Claude, on “Is a &lt; b?”:</em></p>');
		expect(answerHeading('x'.repeat(200))).toContain('…');
	});
});
