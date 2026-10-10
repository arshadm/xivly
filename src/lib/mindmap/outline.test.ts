import { describe, expect, it } from 'vitest';
import { layout } from './layout';
import { mapSvg, plain, wrap } from './image';
import { fromOutline } from './outline';
import type { Topic } from './tree';

const shape = (t: Topic): unknown => ({ text: t.text, ...(t.page ? { page: t.page } : {}), ...(t.children.length ? { children: t.children.map(shape) } : {}) });

describe('outlines into maps', () => {
	it('one top-level item: the central topic; nesting by indentation; pages from (p. N) or [p. N]', () => {
		const m = fromOutline('Here is the map:\n\n- Fusion\n  - Method [p. 3]\n    - tile then fuse\n  - Results (p. 7)\n* Not nested?\n', 'Paper');
		expect(shape(m!.root)).toEqual({
			text: 'Paper',
			children: [{ text: 'Fusion', children: [{ text: 'Method', page: 3, children: [{ text: 'tile then fuse' }] }, { text: 'Results', page: 7 }] }, { text: 'Not nested?' }]
		});
		expect(shape(fromOutline('- Only\n  - child', 'P')!.root)).toEqual({ text: 'Only', children: [{ text: 'child' }] });
	});

	it('numbered lists and tabs too; no list, no map', () => {
		expect(shape(fromOutline('1. A\n\t2. B', 'P')!.root)).toEqual({ text: 'A', children: [{ text: 'B' }] });
		expect(fromOutline('Just text.', 'P')).toBeNull();
	});
});

describe('maps as images', () => {
	it('Markdown marks dropped; words wrapped to the box', () => {
		expect(plain('**Bold** and *it* and `code` and $x^2$')).toBe('Bold and it and code and $x^2$');
		expect(wrap('one two three four', 30, (s) => s.length * 4)).toEqual(['one two', 'three', 'four']);
	});

	it('an SVG with every topic and branch, its text escaped', () => {
		const root: Topic = { id: 'r', text: 'A < B', children: [{ id: 'a', text: '**x**', page: 2, children: [] }] };
		const l = layout(root, () => ({ w: 120, h: 30 }));
		const svg = mapSvg({ root }, l, { colors: new Map([['a', '#e8590c']]), dark: false, measure: (s) => s.length * 6 });
		expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
		expect(svg).toContain('A &lt; B');
		expect(svg).toContain('>x (p. 2)</text>');
		expect(svg.match(/<path /g)).toHaveLength(1);
	});
});
