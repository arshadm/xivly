// A mind map as an image (SVG, or PNG drawn from it): the layout with each
// topic's text as plain words (no Markdown marks), wrapped to its box.
import { branchPath, type Layout } from './layout';
import { find, type MindMap } from './tree';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Topic text without Markdown marks ($…$ kept as written). */
export const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/(?<![*\w])\*(?!\s)(.+?)\*/g, '$1').replace(/`([^`]+)`/g, '$1');

/** Words into lines no wider than `width` (measured with `measure`). */
export function wrap(text: string, width: number, measure: (s: string) => number): string[] {
	const lines: string[] = [];
	let line = '';
	for (const word of text.split(/\s+/).filter(Boolean)) {
		const next = line ? `${line} ${word}` : word;
		if (line && measure(next) > width) {
			lines.push(line);
			line = word;
		} else line = next;
	}
	if (line) lines.push(line);
	return lines.length ? lines : [''];
}

export interface ImageStyle {
	colors: Map<string, string>;
	dark: boolean;
	measure: (s: string, size: number) => number;
}

/** The map as a standalone SVG document. */
export function mapSvg(map: MindMap, l: Layout, style: ImageStyle): string {
	const pad = 24;
	const { x, y, w, h } = l.bounds;
	const ink = style.dark ? '#f5f5f4' : '#1c1917';
	const paper = style.dark ? '#1c1917' : '#ffffff';
	const parts: string[] = [];
	for (const b of l.branches) {
		const to = l.topics.find((t) => t.id === b.to);
		parts.push(`<path d="${branchPath(b)}" fill="none" stroke="${style.colors.get(b.to) ?? '#a8a29e'}" stroke-width="${to?.depth === 1 ? 2.5 : 1.5}" stroke-linecap="round"/>`);
	}
	for (const p of l.topics) {
		const t = find(map.root, p.id)?.topic;
		if (!t) continue;
		const color = style.colors.get(p.id) ?? '#a8a29e';
		const root = p.side === 'root';
		const size = root ? 15 : p.depth === 1 ? 13 : 12.5;
		const text = plain(t.text) + (t.page ? `  (p. ${t.page})` : '');
		const lines = wrap(text, p.w - (root ? 32 : p.depth === 1 ? 24 : 16), (s) => style.measure(s, size));
		if (root) parts.push(`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="12" fill="${style.dark ? '#f5f5f4' : '#292524'}"/>`);
		else if (p.depth === 1) parts.push(`<rect x="${p.x + 1}" y="${p.y + 1}" width="${p.w - 2}" height="${p.h - 2}" rx="8" fill="${paper}" stroke="${color}" stroke-width="2"/>`);
		else parts.push(`<line x1="${p.x}" y1="${p.y + p.h - 1}" x2="${p.x + p.w}" y2="${p.y + p.h - 1}" stroke="${color}" stroke-width="2"/>`);
		const fill = root ? (style.dark ? '#1c1917' : '#ffffff') : ink;
		const lh = size * 1.35;
		const top = p.y + p.h / 2 - (lines.length * lh) / 2 + size;
		lines.forEach((line, i) => parts.push(`<text x="${p.x + p.w / 2}" y="${top + i * lh - 2}" text-anchor="middle" font-family="${root ? 'Georgia, serif' : '-apple-system, Helvetica, Arial, sans-serif'}" font-size="${size}" fill="${fill}">${esc(line)}</text>`));
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w + pad * 2}" height="${h + pad * 2}" viewBox="${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}"><rect x="${x - pad}" y="${y - pad}" width="${w + pad * 2}" height="${h + pad * 2}" fill="${paper}"/>${parts.join('')}</svg>`;
}

/** The SVG as a PNG (2× for sharpness). */
export async function svgToPng(svg: string, width: number, height: number): Promise<Blob> {
	const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
	try {
		const img = new Image();
		img.src = url;
		await img.decode();
		const canvas = Object.assign(document.createElement('canvas'), { width: width * 2, height: height * 2 });
		const g = canvas.getContext('2d')!;
		g.scale(2, 2);
		g.drawImage(img, 0, 0, width, height);
		return await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('Couldn’t draw the map'))), 'image/png'));
	} finally {
		URL.revokeObjectURL(url);
	}
}
