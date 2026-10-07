// Turns the starter specs (starter/papers.json) into real annotations on a
// PDF: targets are found by quote (pdf.js text positions) or by figure /
// table / equation label (svelte-pdf-mini's paper analysis). Used by the
// starter builder (/dev/starter), not by the app at runtime.
import {
	PageText,
	analyzePaper,
	baseFields,
	defaultPalette,
	pageLines,
	pdfjsPaperSource,
	reanchor,
	rectFromQuads,
	type Annotation,
	type Figure,
	type Line,
	type PdfRect,
	type TextContentLike,
	type TextItemLike,
	type TextMarkupAnnotation,
	type TextStyleLike
} from 'svelte-pdf-mini';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/** The app's default free-text font (what the Text tool creates). */
const TEXT_FONT = { family: 'Handwritten', size: 12 } as const;

type Color = 'yellow' | 'blue' | 'green' | 'pink' | 'purple' | 'orange' | 'red';
export type Target = { quote: string } | { figure: string } | { table: string } | { equation: string };

export type Spec =
	| { kind: 'highlight'; page: number; quote: string; color: Color; note?: string }
	| { kind: 'box'; page: number; target: Target; color: Color; label?: string; note?: string }
	| { kind: 'note'; page: number; near: Target; text: string; color?: Color }
	| { kind: 'text'; page: number; near: Target; side: 'left' | 'right' | 'above' | 'below'; text: string; color: Color; arrow?: boolean }
	| { kind: 'ink'; page: number; around: Target; shape: Shape; color: Color }
	/** An emoji in the margin, level with the target. */
	| { kind: 'sticker'; page: number; near: Target; emoji: string };

/** Pen marks: around / under the target, or a doodle in the margin beside it. */
type Shape = 'circle' | 'underline' | 'wavy' | 'bracket' | 'heart' | 'star' | 'check' | 'exclaim' | 'question';
const DOODLES = new Set<Shape>(['heart', 'star', 'check', 'exclaim', 'question']);

export interface PaperSpec {
	arxiv: string;
	category: string;
	tags?: string[];
	read?: boolean;
	annotations: Spec[];
}

/** Place every spec on `doc`; returns the annotations and the specs that couldn't be placed. */
export async function placeAnnotations(doc: PDFDocumentProxy, specs: Spec[]) {
	const texts = new Map<number, PageText>();
	const pageText = async (n: number) => {
		if (!texts.has(n)) texts.set(n, new PageText(n, (await (await doc.getPage(n)).getTextContent()) as TextContentLike, measurer()));
		return texts.get(n)!;
	};
	const needsFigures = specs.some((s) => targetsOf(s).some((t) => !('quote' in t)));
	const figures: Figure[] = needsFigures ? (await analyzePaper(pdfjsPaperSource(doc, { measure: measurer() ?? undefined }))).figures : [];

	/** Body-text lines of a page (no rotated side stamps), for margins and paragraphs. */
	const layouts = new Map<number, Line[]>();
	const linesOf = async (n: number) => {
		if (!layouts.has(n)) layouts.set(n, pageLines(await pageText(n)).filter((l) => !l.rotated && l.text.trim().length > 2));
		return layouts.get(n)!;
	};

	const placed: Annotation[] = [];
	const missed: { spec: Spec; why: string }[] = [];

	/** Box of a target on a page (PDF space), or why it isn't there. */
	async function locate(t: Target, page: number): Promise<{ rect: PdfRect; hit?: TextMarkupAnnotation } | string> {
		if ('quote' in t) {
			const probe = { ...baseFields({ page, color: [0, 0, 0] }), kind: 'highlight', rect: [0, 0, 0, 0], quads: [], quote: { exact: t.quote } } as TextMarkupAnnotation;
			const r = reanchor(probe, await pageText(page));
			if (r.status === 'orphan') return `quote not found: “${t.quote}”`;
			const hit = r.annotation as TextMarkupAnnotation;
			return { rect: rectFromQuads(hit.quads, 0), hit };
		}
		const [kind, label] = 'figure' in t ? (['figure', t.figure] as const) : 'table' in t ? (['table', t.table] as const) : (['equation', t.equation] as const);
		const number = label.replace(/^(figure|fig\.?|table)\s*/i, '').replace(/[()]/g, '').trim();
		const f = figures.find((x) => x.page === page && x.number === number && (kind === 'equation' ? x.kind === 'equation' : kind === 'table' ? x.kind === 'table' : x.kind === 'figure'));
		return f ? { rect: f.rect } : `${kind} ${label} not found on p.${page}`;
	}

	for (const spec of specs) {
		const palette = defaultPalette.find((c) => c.key === ('color' in spec ? spec.color : 'yellow')) ?? defaultPalette[0];
		const base = { ...baseFields({ page: spec.page, color: palette.rgb }), paletteKey: palette.key };
		const target = targetsOf(spec)[0];
		const at = await locate(target, spec.page);
		if (typeof at === 'string') {
			missed.push({ spec, why: at });
			continue;
		}
		const view = (await doc.getPage(spec.page)).view as [number, number, number, number];
		const ink = hexRgb(palette.dark);
		const note = 'note' in spec && spec.note ? { contents: spec.note, contentsFormat: 'markdown' as const } : {};
		switch (spec.kind) {
			case 'highlight':
				placed.push({ ...at.hit!, ...base, kind: 'highlight', quads: at.hit!.quads, rect: at.hit!.rect, quote: at.hit!.quote, ...note });
				break;
			case 'box':
				placed.push({ ...base, ...note, kind: 'area', rect: pad(at.rect, 'quote' in spec.target ? 3 : 4), label: spec.label });
				break;
			case 'note': {
				// Sticky note in the margin, level with the target's first line.
				const [x1, , x2, y2] = at.rect;
				const left = x1 - 30 >= view[0] + 4;
				const rect: PdfRect = left ? [x1 - 30, y2 - 18, x1 - 12, y2] : [x2 + 12, y2 - 18, x2 + 30, y2];
				placed.push({ ...base, kind: 'note', icon: 'Comment', rect, contents: spec.text, contentsFormat: 'markdown' });
				break;
			}
			case 'text': {
				const fit = textBox(spec, at.rect, view, await linesOf(spec.page));
				// Never over the paper's text: no room in a margin, no label.
				if (!fit) {
					missed.push({ spec, why: 'no margin room' });
					break;
				}
				const { rect: box, text } = fit;
				// Pen-like ink: the color's dark shade, as a fixed color (a palette key would
				// render the pale highlight shade).
				placed.push({ ...baseFields({ page: spec.page, color: ink }), kind: 'freetext', rect: box, text, font: { ...TEXT_FONT }, textColor: ink });
				if (spec.arrow) {
					const [from, to] = arrowBetween(box, at.rect);
					placed.push({ ...baseFields({ page: spec.page, color: ink }), kind: 'arrow', width: 1.2, points: [from, to], lineEndings: ['none', 'open-arrow'], rect: pad(boundsOf([from, to]), 4) });
				}
				break;
			}
			case 'ink': {
				const lines = await linesOf(spec.page);
				// A bracket marks the whole paragraph around the quote; doodles go in the margin.
				const area = spec.shape === 'bracket' ? paragraphOf(at.rect, lines) : DOODLES.has(spec.shape) ? marginSpot(at.rect, lines, view, 13) : at.rect;
				if (!area) {
					missed.push({ spec, why: 'no margin room' });
					break;
				}
				const paths = drawShape(spec.shape, area).map((points) => ({ points }));
				placed.push({ ...baseFields({ page: spec.page, color: ink }), kind: 'ink', width: 1.6, style: 'line', paths, rect: pad(boundsOf(paths.flatMap((p) => p.points)), 3) });
				break;
			}
			case 'sticker': {
				const spot = marginSpot(at.rect, await linesOf(spec.page), view, 18);
				if (!spot) {
					missed.push({ spec, why: 'no margin room' });
					break;
				}
				placed.push({ ...baseFields({ page: spec.page, color: [0, 0, 0] }), kind: 'freetext', rect: spot, text: spec.emoji, font: { ...TEXT_FONT } });
				break;
			}
		}
	}
	return { placed, missed };
}

const targetsOf = (s: Spec): Target[] => [s.kind === 'highlight' ? { quote: s.quote } : s.kind === 'box' ? s.target : s.kind === 'ink' ? s.around : s.near];

/** A size×size square in the margin (left if there's room, else right), level with the target's first line. */
function marginSpot([x1, , x2, y2]: PdfRect, lines: Line[], [px1, , px2]: [number, number, number, number], size: number): PdfRect | null {
	const textLeft = Math.min(...lines.map((l) => l.x), x1);
	const textRight = Math.max(...lines.map((l) => l.right), x2);
	const cy = y2 - 5;
	const x = textLeft - (px1 + 4) >= size + 14 ? textLeft - 12 - size : px2 - 4 - (textRight + 12) >= size ? textRight + 12 : null;
	if (x === null) return null;
	return [x, cy - size / 2, x + size, cy + size / 2];
}

// ── Geometry (PDF space: y up) ─────────────────────────────────────────

const pad = ([x1, y1, x2, y2]: PdfRect, p: number): PdfRect => [x1 - p, y1 - p, x2 + p, y2 + p];
const boundsOf = (pts: [number, number][]): PdfRect => [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];

/**
 * A free-text label in the page margin level with the target (right / left),
 * or just above / below it; wrapped to the room there. Helvetica 8.5 pt ≈ 4.4 pt per char.
 */
function textBox(
	spec: { side: 'left' | 'right' | 'above' | 'below'; text: string },
	[x1, y1, x2, y2]: PdfRect,
	[px1, py1, px2, py2]: [number, number, number, number],
	lines: Line[]
): { rect: PdfRect; text: string } | null {
	// Helvetica 12 pt: ≈ 6.2 pt per character, 14 pt lines.
	const CH = 6.2, LH = 14;
	const textLeft = Math.min(...lines.map((l) => l.x), x1);
	const textRight = Math.max(...lines.map((l) => l.right), x2);
	const midY = (y1 + y2) / 2;
	const wrap = (width: number) => {
		const per = Math.max(8, Math.floor((width - 4) / CH));
		const out: string[] = [];
		for (const word of spec.text.split(/\s+/)) {
			const last = out.at(-1);
			if (last && (last + ' ' + word).length <= per) out[out.length - 1] = last + ' ' + word;
			else out.push(word);
		}
		return out;
	};
	const sized = (wrapped: string[]) => ({ w: Math.max(...wrapped.map((l) => l.length)) * CH + 6, h: wrapped.length * LH + 3 });
	let side = spec.side;
	// Not enough margin on that side: the other margin, else no label at all.
	const roomRight = px2 - 6 - (textRight + 10) >= 48;
	const roomLeft = textLeft - 10 - (px1 + 6) >= 48;
	if (side === 'right' && !roomRight) {
		if (!roomLeft) return null;
		side = 'left';
	} else if (side === 'left' && !roomLeft) {
		if (!roomRight) return null;
		side = 'right';
	}
	let r: PdfRect, wrapped: string[];
	if (side === 'right') {
		const x = textRight + 10;
		wrapped = wrap(px2 - 6 - x);
		const { w, h } = sized(wrapped);
		r = [x, midY - h / 2, x + w, midY + h / 2];
	} else if (side === 'left') {
		const room = textLeft - 10 - (px1 + 6);
		wrapped = wrap(room);
		const { w, h } = sized(wrapped);
		r = [textLeft - 10 - w, midY - h / 2, textLeft - 10, midY + h / 2];
	} else {
		wrapped = wrap(Math.max(120, x2 - x1));
		const { w, h } = sized(wrapped);
		r = side === 'above' ? [x1, y2 + 4, x1 + w, y2 + 4 + h] : [x1, y1 - 4 - h, x1 + w, y1 - 4];
	}
	const dx = Math.max(px1 + 4 - r[0], Math.min(0, px2 - 4 - r[2]));
	const dy = Math.max(py1 + 4 - r[1], Math.min(0, py2 - 4 - r[3]));
	return { rect: [r[0] + dx, r[1] + dy, r[2] + dx, r[3] + dy], text: wrapped.join('\n') };
}

/** The paragraph around a target: neighbouring lines in the same column, without a paragraph gap. */
function paragraphOf(rect: PdfRect, lines: Line[]): PdfRect {
	const cy = (rect[1] + rect[3]) / 2;
	const sorted = [...lines].sort((a, b) => b.top - a.top);
	const i = sorted.findIndex((l) => l.bottom <= cy + 1 && l.top >= cy - 1 && l.x <= rect[2] && l.right >= rect[0]);
	if (i < 0) return rect;
	const column = (l: Line) => Math.abs(l.x - sorted[i].x) < 30 && Math.abs(l.right - sorted[i].right) < 120;
	let a = i, b = i;
	const close = (upper: Line, lower: Line) => upper.bottom - lower.top < upper.size * 0.9;
	while (a > 0 && column(sorted[a - 1]) && close(sorted[a - 1], sorted[a])) a--;
	while (b < sorted.length - 1 && column(sorted[b + 1]) && close(sorted[b], sorted[b + 1])) b++;
	const para = sorted.slice(a, b + 1);
	return [Math.min(...para.map((l) => l.x)), Math.min(...para.map((l) => l.bottom)), Math.max(...para.map((l) => l.right)), Math.max(...para.map((l) => l.top))];
}

/** From the label's nearest edge to the target's nearest edge. */
function arrowBetween([ax1, ay1, ax2, ay2]: PdfRect, [bx1, by1, bx2, by2]: PdfRect): [[number, number], [number, number]] {
	const acx = (ax1 + ax2) / 2, acy = (ay1 + ay2) / 2;
	const bcx = (bx1 + bx2) / 2, bcy = (by1 + by2) / 2;
	const horizontal = ax2 < bx1 || ax1 > bx2;
	if (horizontal) {
		const fromX = ax2 < bx1 ? ax2 + 2 : ax1 - 2;
		const toX = ax2 < bx1 ? bx1 - 2 : bx2 + 2;
		return [[fromX, acy], [toX, Math.max(by1, Math.min(by2, acy))]];
	}
	const fromY = ay1 > by2 ? ay1 - 2 : ay2 + 2;
	const toY = ay1 > by2 ? by2 + 2 : by1 - 2;
	return [[acx, fromY], [Math.max(bx1, Math.min(bx2, acx)), toY]];
	void bcx;
	void bcy;
}

/** Hand-drawn-looking strokes (slight wobble, a little overshoot); several paths for "!" and "?". */
function drawShape(shape: Shape, [x1, y1, x2, y2]: PdfRect): [number, number][][] {
	const wob = (i: number, a: number) => Math.sin(i * 1.7 + a) * 0.6 + Math.sin(i * 0.45 + a * 2) * 0.9;
	const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
	const r = Math.min(x2 - x1, y2 - y1) / 2;
	const seq = (n: number, f: (t: number, i: number) => [number, number]) => Array.from({ length: n + 1 }, (_, i) => f(i / n, i));
	switch (shape) {
		case 'circle': {
			const rx = (x2 - x1) / 2 + 7, ry = (y2 - y1) / 2 + 5;
			// A bit more than a full turn, starting top-left, like a pen loop.
			return [seq(44, (u, i) => {
				const t = Math.PI * 0.8 + u * Math.PI * 2.2;
				const k = 1 + 0.04 * Math.sin(t * 2 + 1);
				return [cx + rx * k * Math.cos(t) + wob(i, 1), cy + ry * k * Math.sin(t) + wob(i, 2) * 0.6];
			})];
		}
		case 'underline':
			return [seq(Math.max(8, Math.round((x2 - x1) / 6)), (u, i) => [x1 - 2 + (x2 - x1 + 4) * u, y1 - 2.5 + Math.sin(i * 0.9) * 0.9 - u * 1.2])];
		case 'wavy':
			return [seq(Math.max(12, Math.round((x2 - x1) / 2.5)), (u) => [x1 - 1 + (x2 - x1 + 2) * u, y1 - 3 + Math.sin(u * (x2 - x1) / 3.2) * 1.4])];
		case 'bracket': {
			const x = x1 - 12;
			return [[[x + 5, y2 + 1], [x, y2], ...seq(9, (u, i) => [x + wob(i, 3) * 0.4, y2 - (y2 - y1) * u] as [number, number]), [x, y1], [x + 5, y1 - 1]]];
		}
		case 'heart':
			// The classic heart curve (y up), scaled to the box.
			return [seq(40, (u) => {
				const t = u * Math.PI * 2;
				return [cx + (r / 17) * 16 * Math.sin(t) ** 3, cy + (r / 17) * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))];
			})];
		case 'star':
			return [seq(10, (u, i) => {
				const t = Math.PI / 2 + u * Math.PI * 2;
				const rr = i % 2 ? r * 0.45 : r;
				return [cx + rr * Math.cos(t) + wob(i, 4) * 0.3, cy + rr * Math.sin(t) + wob(i, 5) * 0.3];
			})];
		case 'check':
			return [[[cx - r, cy], [cx - r * 0.35, cy - r * 0.7], [cx + r, cy + r * 0.9]]];
		case 'exclaim':
			return [[[cx, cy + r], [cx + 0.3, cy - r * 0.35]], seq(8, (u) => [cx + 1 * Math.cos(u * 6.3), cy - r * 0.85 + 1 * Math.sin(u * 6.3)])];
		case 'question':
			return [
				[...seq(14, (u) => [cx + r * 0.55 * Math.cos(Math.PI * (1.1 - 1.5 * u)), cy + r * 0.45 + r * 0.5 * Math.sin(Math.PI * (1.1 - 1.5 * u))] as [number, number]), [cx, cy - r * 0.3]],
				seq(8, (u) => [cx + 1 * Math.cos(u * 6.3), cy - r * 0.85 + 1 * Math.sin(u * 6.3)])
			];
	}
}

function hexRgb(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1), 16);
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Accurate glyph widths for highlight edges (as the viewer measures them). */
function measurer() {
	const ctx = new OffscreenCanvas(1, 1).getContext('2d');
	if (!ctx) return null;
	return (text: string, _item: TextItemLike, style: TextStyleLike | undefined) => {
		ctx.font = `100px ${style?.fontFamily ?? 'sans-serif'}`;
		return ctx.measureText(text).width;
	};
}
