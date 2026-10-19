// A drawing as a standalone SVG document: for its file next to the notes
// (`notes-assets/drawing-<id>.svg`, linked from notes.md) and for Save as SVG / PNG.
import { lineHeight, paper, shapeMarks, type Mark, type Measure } from './render';
import { sceneBounds, type Scene } from './scene';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const PAD = 24;

/** One mark as SVG (`href`: where an image's file is, as the document will see it). */
export function markSvg(m: Mark, href: (src: string) => string): string {
	if (m.kind === 'path') {
		const attrs = [`d="${m.d}"`, `fill="${m.fill ?? 'none'}"`];
		if (m.stroke) attrs.push(`stroke="${m.stroke}"`, `stroke-width="${m.width ?? 1}"`, 'stroke-linecap="round"', 'stroke-linejoin="round"');
		if (m.dash) attrs.push(`stroke-dasharray="${m.dash}"`);
		return `<path ${attrs.join(' ')}/>`;
	}
	if (m.kind === 'image') return `<image href="${esc(href(m.src))}" x="${m.x}" y="${m.y}" width="${m.w}" height="${m.h}" preserveAspectRatio="none"/>`;
	const lh = lineHeight(m.size);
	const spans = m.lines.map((l, i) => `<tspan x="${m.x}" y="${m.y + i * lh + lh / 2}">${esc(l) || ' '}</tspan>`).join('');
	return `<text font-family="${esc(m.family)}" font-size="${m.size}" fill="${m.color}" text-anchor="${m.anchor}" dominant-baseline="central" xml:space="preserve">${spans}</text>`;
}

export interface SvgOptions {
	dark?: boolean;
	measure: Measure;
	/** An image's file as the SVG refers to it (default: its path as stored). */
	href?: (src: string) => string;
}

/** The drawing's size as an image (its shapes and a margin). */
export function svgSize(scene: Scene) {
	const b = sceneBounds(scene) ?? { x: 0, y: 0, w: 0, h: 0 };
	return { x: b.x - PAD, y: b.y - PAD, w: Math.ceil(b.w + PAD * 2), h: Math.ceil(b.h + PAD * 2) };
}

/** The whole drawing as an SVG document, on its paper colour. */
export function drawingSvg(scene: Scene, o: SvgOptions): string {
	const dark = !!o.dark;
	const href = o.href ?? ((s: string) => s);
	const { x, y, w, h } = svgSize(scene);
	const body = scene.shapes.flatMap((s) => shapeMarks(scene, s, { dark, measure: o.measure })).map((m) => markSvg(m, href));
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${paper(dark)}"/>${body.join('')}</svg>`;
}
