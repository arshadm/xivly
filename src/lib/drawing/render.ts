// A drawing's shapes as marks (SVG paths, text, images), drawn the same in the
// block and in its SVG file: hand-drawn with rough.js (each shape's own seed, so
// it never wobbles between redraws) or as clean lines. Colours are palette
// names, drawn in light or dark; a #hex colour is drawn as it is.
import { RoughGenerator } from 'roughjs/bin/generator.js';
import type { Options } from 'roughjs/bin/core.js';
import { wrap } from '#lib/mindmap/image.js';
import { linePoints, type Font, type Point, type Scene, type Shape, type Style } from './scene';

export interface Swatch {
	key: string;
	label: string;
	stroke: { light: string; dark: string };
	fill: { light: string; dark: string };
}

export const PALETTE: readonly Swatch[] = [
	{ key: 'ink', label: 'Ink', stroke: { light: '#1c1917', dark: '#e7e5e4' }, fill: { light: '#e7e5e4', dark: '#44403c' } },
	{ key: 'gray', label: 'Gray', stroke: { light: '#78716c', dark: '#a8a29e' }, fill: { light: '#f5f5f4', dark: '#292524' } },
	{ key: 'red', label: 'Red', stroke: { light: '#e03131', dark: '#ff8787' }, fill: { light: '#ffc9c9', dark: '#5c1f1f' } },
	{ key: 'orange', label: 'Orange', stroke: { light: '#e8590c', dark: '#ffa94d' }, fill: { light: '#ffd8a8', dark: '#5c3416' } },
	{ key: 'yellow', label: 'Yellow', stroke: { light: '#f08c00', dark: '#ffd43b' }, fill: { light: '#ffec99', dark: '#5c4a10' } },
	{ key: 'green', label: 'Green', stroke: { light: '#2f9e44', dark: '#69db7c' }, fill: { light: '#b2f2bb', dark: '#1d4a26' } },
	{ key: 'teal', label: 'Teal', stroke: { light: '#0c8599', dark: '#66d9e8' }, fill: { light: '#99e9f2', dark: '#123f47' } },
	{ key: 'blue', label: 'Blue', stroke: { light: '#1971c2', dark: '#74c0fc' }, fill: { light: '#a5d8ff', dark: '#173a5e' } },
	{ key: 'violet', label: 'Violet', stroke: { light: '#6741d9', dark: '#b197fc' }, fill: { light: '#d0bfff', dark: '#33255e' } },
	{ key: 'pink', label: 'Pink', stroke: { light: '#c2255c', dark: '#f783ac' }, fill: { light: '#fcc2d7', dark: '#5a1a33' } }
];

/** The drawing's background (behind a line's label, and in its image). */
export const paper = (dark: boolean) => (dark ? '#1c1917' : '#ffffff');

/** A colour as drawn: a palette name (as a line, or as a fill), or a #hex as it is. */
export function color(c: string, as: 'stroke' | 'fill', dark: boolean): string {
	const swatch = PALETTE.find((p) => p.key === c);
	if (swatch) return swatch[as][dark ? 'dark' : 'light'];
	return /^#[0-9a-f]{3,8}$/i.test(c) ? c : PALETTE[0][as][dark ? 'dark' : 'light'];
}

export const FONTS: Record<Font, { label: string; family: string }> = {
	hand: { label: 'Hand-drawn', family: '"Chalkboard SE", "Bradley Hand", "Segoe Print", "Comic Neue", "Comic Sans MS", cursive' },
	sans: { label: 'Sans serif', family: '-apple-system, "Helvetica Neue", "Segoe UI", Arial, sans-serif' },
	serif: { label: 'Serif', family: 'Georgia, "Times New Roman", serif' },
	mono: { label: 'Monospace', family: 'ui-monospace, Menlo, Consolas, monospace' }
};

export const lineHeight = (size: number) => size * 1.25;
/** Room inside a box around its label. */
const PAD = 8;

/** How wide a run of text is, in a font and size. */
export type Measure = (text: string, size: number, family: string) => number;

/** A canvas to measure text with (in a page; a rough guess elsewhere). */
export function canvasMeasure(): Measure {
	const g = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
	return (text, size, family) => {
		if (!g) return text.length * size * 0.55;
		g.font = `${size}px ${family}`;
		return g.measureText(text).width;
	};
}

/** A text shape's size, from its text (one line per line: text shapes don't wrap). */
export function textSize(text: string, style: Pick<Style, 'font' | 'size'>, measure: Measure): { w: number; h: number } {
	const lines = text.split('\n');
	const family = FONTS[style.font].family;
	return { w: Math.ceil(Math.max(style.size / 2, ...lines.map((l) => measure(l, style.size, family)))) + 2, h: Math.ceil(lines.length * lineHeight(style.size)) };
}

export type Mark =
	| { kind: 'path'; d: string; stroke?: string; fill?: string; width?: number; dash?: string; opacity?: number }
	| { kind: 'text'; lines: string[]; x: number; y: number; size: number; family: string; color: string; anchor: 'start' | 'middle' }
	| { kind: 'image'; src: string; x: number; y: number; w: number; h: number };

export interface RenderOptions {
	dark: boolean;
	measure: Measure;
}

const generator = new RoughGenerator();

function dashArray(style: Style): string | undefined {
	const w = style.width;
	if (style.dash === 'dashed') return `${w * 4} ${w * 3}`;
	if (style.dash === 'dotted') return `${w * 0.5} ${w * 2.5}`;
	return undefined;
}

const f = (n: number) => Math.round(n * 100) / 100;
const polyline = (pts: readonly Point[], closed = false) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L')}${closed ? ' Z' : ''}`;

/** A pen stroke through its points, smoothed (midpoints joined by curves). */
function smoothPath(pts: readonly Point[]): string {
	if (pts.length < 3) return polyline(pts);
	let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
	for (let i = 1; i < pts.length - 1; i++) {
		const [mx, my] = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
		d += ` Q${f(pts[i][0])} ${f(pts[i][1])} ${f(mx)} ${f(my)}`;
	}
	const last = pts[pts.length - 1];
	return `${d} L${f(last[0])} ${f(last[1])}`;
}

/** The two short strokes of an arrowhead at `tip`, coming from `from`. */
function head(tip: Point, from: Point, width: number): Point[] {
	const angle = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
	const len = Math.min(Math.max(10, width * 5), Math.hypot(tip[0] - from[0], tip[1] - from[1]) * 0.6 || 10);
	const wing = (a: number): Point => [tip[0] - len * Math.cos(angle + a), tip[1] - len * Math.sin(angle + a)];
	return [wing(0.45), tip, wing(-0.45)];
}

/** The outline of a box shape, as points (a diamond) or a path (clean lines). */
function cleanOutline(s: Shape): string {
	const { x, y, w, h } = s;
	if (s.kind === 'ellipse') {
		const [rx, ry] = [w / 2, h / 2];
		return `M${f(x)} ${f(y + ry)} a${f(rx)} ${f(ry)} 0 1 0 ${f(w)} 0 a${f(rx)} ${f(ry)} 0 1 0 ${f(-w)} 0 Z`;
	}
	if (s.kind === 'diamond') return polyline(diamondPoints(s), true);
	const r = Math.min(8, w / 4, h / 4);
	return `M${f(x + r)} ${f(y)} H${f(x + w - r)} Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)} V${f(y + h - r)} Q${f(x + w)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)} H${f(x + r)} Q${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - r)} V${f(y + r)} Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)} Z`;
}

const diamondPoints = ({ x, y, w, h }: Shape): Point[] => [
	[x + w / 2, y],
	[x + w, y + h / 2],
	[x + w / 2, y + h],
	[x, y + h / 2]
];

/** Rough's drawing of a shape (its outline and fill), as marks. */
function roughMarks(s: Shape, pts: Point[], o: RenderOptions): Mark[] {
	const opts: Options = {
		seed: s.seed,
		stroke: color(s.style.stroke, 'stroke', o.dark),
		strokeWidth: s.style.width,
		roughness: 1.1,
		bowing: 1,
		hachureGap: Math.max(4, s.style.width * 3),
		fillWeight: Math.max(0.5, s.style.width / 2),
		preserveVertices: s.kind === 'line'
	};
	const dash = dashArray(s.style);
	if (dash) (opts.strokeLineDash = dash.split(' ').map(Number), (opts.disableMultiStroke = true));
	if (s.style.fill !== 'none' && s.kind !== 'line') {
		opts.fill = color(s.style.fill, 'fill', o.dark);
		opts.fillStyle = s.style.fillStyle === 'cross' ? 'cross-hatch' : s.style.fillStyle;
	}
	const drawables =
		s.kind === 'rect'
			? [generator.rectangle(s.x, s.y, s.w, s.h, opts)]
			: s.kind === 'ellipse'
				? [generator.ellipse(s.x + s.w / 2, s.y + s.h / 2, s.w, s.h, opts)]
				: s.kind === 'diamond'
					? [generator.polygon(diamondPoints(s), opts)]
					: [generator.linearPath(pts, opts)];
	return drawables.flatMap((d) => generator.toPaths(d)).map((p) => ({ kind: 'path', d: p.d, stroke: p.stroke === 'none' ? undefined : p.stroke, fill: p.fill && p.fill !== 'none' ? p.fill : undefined, width: p.strokeWidth, dash }));
}

/** A box shape's (or a line's) label: wrapped to its box and centred, or at a line's middle on the paper colour. */
function labelMarks(s: Shape, pts: Point[], o: RenderOptions): Mark[] {
	const text = s.text?.trim();
	if (!text) return [];
	const family = FONTS[s.style.font].family;
	const size = s.style.size;
	const ink = color(s.style.stroke, 'stroke', o.dark);
	const measure = (t: string) => o.measure(t, size, family);
	const lh = lineHeight(size);
	if (s.kind === 'line') {
		const mid = Math.floor((pts.length - 1) / 2);
		const [cx, cy] = pts.length % 2 ? pts[mid] : [(pts[mid][0] + pts[mid + 1][0]) / 2, (pts[mid][1] + pts[mid + 1][1]) / 2];
		const lines = text.split('\n');
		const w = Math.max(...lines.map(measure)) + 8;
		const h = lines.length * lh + 2;
		return [
			{ kind: 'path', d: polyline([[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]], true), fill: paper(o.dark) },
			{ kind: 'text', lines, x: cx, y: cy - h / 2 + 1, size, family, color: ink, anchor: 'middle' }
		];
	}
	// A diamond's or an ellipse's text fits inside it.
	const inner = s.kind === 'diamond' ? 0.5 : s.kind === 'ellipse' ? 0.72 : 1;
	const lines = text.split('\n').flatMap((para) => wrap(para, Math.max(size, s.w * inner - PAD * 2), measure));
	return [{ kind: 'text', lines, x: s.x + s.w / 2, y: s.y + s.h / 2 - (lines.length * lh) / 2, size, family, color: ink, anchor: 'middle' }];
}

/** Everything a shape draws, bottom first. */
export function shapeMarks(scene: Scene, s: Shape, o: RenderOptions): Mark[] {
	const ink = color(s.style.stroke, 'stroke', o.dark);
	if (s.kind === 'text') {
		return [{ kind: 'text', lines: (s.text ?? '').split('\n'), x: s.x, y: s.y, size: s.style.size, family: FONTS[s.style.font].family, color: ink, anchor: 'start' }];
	}
	if (s.kind === 'image') {
		const out: Mark[] = [{ kind: 'image', src: s.src!, x: s.x, y: s.y, w: s.w, h: s.h }];
		if (s.style.stroke !== 'none' && s.style.fill !== 'none') out.push({ kind: 'path', d: polyline([[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.h], [s.x, s.y + s.h]], true), stroke: ink, width: 1 });
		return [...out, ...labelMarks(s, [], o)];
	}
	if (s.kind === 'pen') return [{ kind: 'path', d: smoothPath(s.points!), stroke: ink, width: s.style.width, dash: dashArray(s.style) }];
	const pts = s.kind === 'line' ? linePoints(scene, s) : [];
	const out: Mark[] = [];
	if (scene.sketch) out.push(...roughMarks(s, pts, o));
	else {
		const fill = s.style.fill !== 'none' && s.kind !== 'line' ? color(s.style.fill, 'fill', o.dark) : undefined;
		out.push({ kind: 'path', d: s.kind === 'line' ? polyline(pts) : cleanOutline(s), stroke: ink, fill, width: s.style.width, dash: dashArray(s.style) });
	}
	if (s.kind === 'line') {
		const [back, fwd] = s.heads ?? [false, false];
		const n = pts.length - 1;
		const heads = [...(fwd ? [head(pts[n], pts[n - 1], s.style.width)] : []), ...(back ? [head(pts[0], pts[1], s.style.width)] : [])];
		for (const h of heads) {
			if (scene.sketch) out.push(...generator.toPaths(generator.linearPath(h, { seed: s.seed, stroke: ink, strokeWidth: s.style.width, roughness: 0.6 })).map((p) => ({ kind: 'path' as const, d: p.d, stroke: ink, width: p.strokeWidth })));
			else out.push({ kind: 'path', d: polyline(h), stroke: ink, width: s.style.width });
		}
	}
	return [...out, ...labelMarks(s, pts, o)];
}

