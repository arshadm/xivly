import { describe, expect, it } from 'vitest';
import { add, boxAt, duplicate, linePoints, makeShape, moveBy, normalizeScene, remove, reorder, resize, sceneBounds, sceneText, shapeAt, within, type Scene } from './scene';
import { color, shapeMarks, textSize } from './render';
import { drawingSvg } from './svg';

const measure = (t: string, size: number) => t.length * size * 0.5;
const box = (id: string, x: number, y: number, fields = {}) => makeShape('rect', { id, x, y, w: 100, h: 50, ...fields });
const scene = (...shapes: ReturnType<typeof makeShape>[]): Scene => ({ id: 'd', sketch: false, shapes });

describe('normalizeScene', () => {
	it('drops what it can’t read and keeps unknown fields', () => {
		const s = normalizeScene({
			id: 'd1',
			sketch: false,
			mine: 1,
			shapes: [
				{ id: 'a', kind: 'rect', x: 1, y: '2', w: 10, h: -3, style: { stroke: 'red', width: 'x', dash: 'wavy' }, extra: true },
				{ id: 'a', kind: 'ellipse' },
				{ kind: 'blob' },
				{ id: 'p', kind: 'pen', points: [[0, 0]] },
				{ id: 'i', kind: 'image' },
				{ id: 'l', kind: 'line', points: [[0, 0], [10, 20], ['x', 1]], start: 'a', end: 'gone', heads: 'yes' }
			]
		});
		expect(s).toMatchObject({ id: 'd1', sketch: false, mine: 1 });
		expect(s.shapes.map((x) => x.id)).toEqual(['a', 'l']);
		expect(s.shapes[0]).toMatchObject({ x: 1, y: 0, w: 10, h: 0, extra: true, style: { stroke: 'red', width: 2, dash: 'solid', font: 'hand' } });
		expect(s.shapes[1]).toMatchObject({ points: [[0, 0], [10, 20]], start: 'a', heads: [false, false], x: 0, y: 0, w: 10, h: 20 });
		expect(s.shapes[1].end).toBeUndefined();
		expect(normalizeScene(null)).toMatchObject({ sketch: true, shapes: [] });
	});
});

describe('lines that stick to boxes', () => {
	const a = box('a', 0, 0);
	const b = box('b', 300, 0);
	const l = makeShape('line', { id: 'l', points: [[50, 25], [350, 25]], start: 'a', end: 'b' });

	it('start and end on the outlines, facing each other', () => {
		const pts = linePoints(scene(a, b, l), l);
		expect(pts[0][0]).toBeCloseTo(106);
		expect(pts[1][0]).toBeCloseTo(294);
		expect(pts[0][1]).toBeCloseTo(25);
	});

	it('follow a box that moves', () => {
		const moved = moveBy(scene(a, b, l), ['b'], 0, 200);
		const pts = linePoints(moved, moved.shapes[2]);
		expect(pts[1][1]).toBeLessThan(225);
		expect(pts[1][1]).toBeGreaterThan(150);
	});

	it('come loose when moved alone, or when the box goes', () => {
		const moved = moveBy(scene(a, b, l), ['l'], 0, 10);
		expect(moved.shapes[2].start).toBeUndefined();
		expect(moved.shapes[2].points![0]).toEqual([106, 35]);
		const together = moveBy(scene(a, b, l), ['a', 'b', 'l'], 5, 5);
		expect(together.shapes[2]).toMatchObject({ start: 'a', end: 'b' });
		const gone = remove(scene(a, b, l), ['b']);
		expect(gone.shapes.map((s) => s.id)).toEqual(['a', 'l']);
		expect(gone.shapes[1].end).toBeUndefined();
		expect(gone.shapes[1].points![1][0]).toBeCloseTo(294);
	});

	it('find the box under an end', () => {
		expect(boxAt(scene(a, b, l), [320, 10])?.id).toBe('b');
		expect(boxAt(scene(a, b, l), [200, 10])).toBeUndefined();
		expect(boxAt(scene(a, b, l), [320, 10], ['b'])).toBeUndefined();
	});
});

describe('edits', () => {
	it('picks the topmost shape, and the ones inside a box', () => {
		const s = scene(box('a', 0, 0), box('b', 50, 0), makeShape('pen', { id: 'p', points: [[0, 200], [100, 200]] }));
		expect(shapeAt(s, [75, 25])?.id).toBe('b');
		expect(shapeAt(s, [20, 25])?.id).toBe('a');
		expect(shapeAt(s, [50, 203])?.id).toBe('p');
		expect(shapeAt(s, [50, 230])).toBeUndefined();
		expect(within(s, { x: -1, y: -1, w: 152, h: 52 })).toEqual(['a', 'b']);
		expect(sceneBounds(s)).toEqual({ x: 0, y: 0, w: 150, h: 200 });
	});

	it('duplicates with new ids, lines sticking to the copies', () => {
		const s = scene(box('a', 0, 0), box('b', 300, 0), makeShape('line', { id: 'l', points: [[0, 0], [300, 0]], start: 'a', end: 'b' }));
		const d = duplicate(s, ['a', 'l']);
		expect(d.scene.shapes).toHaveLength(5);
		const [ca, cl] = d.ids.map((id) => d.scene.shapes.find((x) => x.id === id)!);
		expect(ca).toMatchObject({ x: 16, y: 16 });
		expect(cl.start).toBe(ca.id);
		expect(cl.end).toBeUndefined();
	});

	it('resizes boxes and text, and reorders', () => {
		const t = makeShape('text', { id: 't', x: 0, y: 0, w: 50, h: 25, text: 'hi', style: { size: 20 } });
		const s = resize(scene(box('a', 0, 0), t), ['a', 't'], { x: 0, y: 0, w: 100, h: 50 }, { x: 10, y: 10, w: 200, h: 100 });
		expect(s.shapes[0]).toMatchObject({ x: 10, y: 10, w: 200, h: 100 });
		expect(s.shapes[1].style.size).toBe(40);
		expect(reorder(s, ['a'], 'front').shapes.map((x) => x.id)).toEqual(['t', 'a']);
		expect(add(s, box('c', 0, 0)).shapes).toHaveLength(3);
	});
});

describe('text and drawing', () => {
	it('says what the drawing says, and what the lines join', () => {
		const s = scene(
			box('b', 0, 100, { text: 'Decoder' }),
			box('a', 0, 0, { text: 'Encoder\nstack' }),
			makeShape('line', { points: [[0, 0], [0, 100]], start: 'a', end: 'b', text: 'keys' }),
			makeShape('image', { src: 'notes-assets/x.png', page: 4, w: 10, h: 10 })
		);
		expect(sceneText(s)).toEqual(['Encoder stack', 'Decoder', 'Encoder stack → Decoder (keys)', 'Image from p. 4']);
	});

	it('draws the same marks every time, hand-drawn or clean', () => {
		const s = { ...scene(box('a', 0, 0, { seed: 7, text: 'Hi', style: { fill: 'blue' } })), sketch: true };
		const one = shapeMarks(s, s.shapes[0], { dark: false, measure });
		expect(shapeMarks(s, s.shapes[0], { dark: false, measure })).toEqual(one);
		expect(one.some((m) => m.kind === 'path' && m.stroke === color('blue', 'fill', false))).toBe(true);
		expect(one.at(-1)).toMatchObject({ kind: 'text', lines: ['Hi'], anchor: 'middle', x: 50 });
		const clean = shapeMarks({ ...s, sketch: false }, s.shapes[0], { dark: true, measure });
		expect(clean[0]).toMatchObject({ kind: 'path', stroke: '#e7e5e4', fill: '#173a5e' });
	});

	it('writes an SVG with its images where they are', () => {
		const s = scene(box('a', 0, 0, { text: 'a < b' }), makeShape('image', { src: 'notes-assets/x.png', x: 200, y: 0, w: 40, h: 30 }));
		const svg = drawingSvg(s, { measure, href: (src) => src.replace('notes-assets/', '') });
		expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="288" height="98" viewBox="-24 -24 288 98">/);
		expect(svg).toContain('href="x.png"');
		expect(svg).toContain('a &lt; b');
		expect(textSize('ab\ncdef', { font: 'sans', size: 20 }, measure)).toEqual({ w: 42, h: 50 });
	});
});
