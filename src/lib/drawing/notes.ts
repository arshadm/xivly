// Drawings in notes.md: each one is a file next to the notes
// (`notes-assets/drawing-<id>.svg`), linked as an image, then its words, so
// search and Claude can read it.
import type { NotesDoc } from '#lib/types.js';
import { canvasMeasure, type Measure } from './render';
import { normalizeScene, sceneText, type Scene } from './scene';
import { drawingSvg } from './svg';

const drawingFile = (id: string) => `notes-assets/drawing-${id}.svg`;

/** A drawing as Markdown: its image, then what it says (none: an empty drawing). */
export function drawingMarkdown(scene: Scene): string | null {
	if (!scene.shapes.length) return null;
	const words = sceneText(scene).map((t) => `- ${t.replace(/([\\`*_[\]<>])/g, '\\$1')}`);
	return [`![Drawing](${drawingFile(scene.id)})`, ...(words.length ? ['', ...words] : [])].join('\n');
}

interface Node {
	type?: string;
	attrs?: Record<string, unknown>;
	content?: Node[];
}

/** The drawings in the notes. */
function drawingsIn(doc: NotesDoc): Scene[] {
	const out: Scene[] = [];
	const walk = (n: Node) => {
		if (n.type === 'drawing') out.push(normalizeScene(n.attrs?.scene));
		n.content?.forEach(walk);
	};
	walk(doc as Node);
	return out;
}

/** An image's path as the drawing's file sees it (it lives in notes-assets/ too). */
const fromAssets = (src: string) => (src.startsWith('notes-assets/') ? src.slice('notes-assets/'.length) : `../${src}`);

/** Each drawing in the notes as its SVG file, by drawing id (empty ones have none). */
export function drawingFiles(doc: NotesDoc, measure: Measure = canvasMeasure()): Map<string, string> {
	const out = new Map<string, string>();
	for (const scene of drawingsIn(doc)) if (scene.shapes.length) out.set(scene.id, drawingSvg(scene, { measure, href: fromAssets }));
	return out;
}
