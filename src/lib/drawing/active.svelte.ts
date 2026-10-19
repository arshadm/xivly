// The drawing being edited (focused) in this window, for the notes' toolbar:
// while there is one, the bar shows its style and arrange tools instead of
// text formatting (like a mind map's, see mindmap/active.svelte.ts).
import type { ShapeKind, Style } from './scene';

export interface DrawingTools {
	/** The style the bar shows: the selected shapes' (the first one's), else what new shapes get. */
	style(): Style;
	/** Change the selected shapes (one undo step), and what new shapes get. */
	setStyle(patch: Partial<Style>): void;
	/** The kinds selected (the bar shows what applies to them). */
	kinds(): ReadonlySet<ShapeKind>;
	/** A selected line's arrowheads (null: none selected). */
	heads(): [boolean, boolean] | null;
	setHeads(heads: [boolean, boolean]): void;
	sketch(): boolean;
	setSketch(on: boolean): void;
	reorder(to: 'front' | 'back'): void;
	duplicate(): void;
	remove(): void;
	fit(): void;
	zoomIn(): void;
	zoomOut(): void;
	undo(): void;
	redo(): void;
	/** Back to the text after the drawing. */
	exit(): void;
	/** Delete the whole drawing. */
	removeBlock(): void;
	/** Is this drawing in that element (one notes editor's)? */
	within(el: Element): boolean;
	/** An image into the drawing, in view (a box drawn on the PDF, with its page). */
	addImage(file: File, page?: number): Promise<void>;
	/** The drawing as a file. */
	save(kind: 'png' | 'svg'): Promise<void>;
}

class ActiveDrawing {
	/** Raw: the very object the drawing registered (compared by identity when it leaves). */
	tools = $state.raw<DrawingTools | null>(null);
	/** The drawing edited last (still there): where "Add to drawing" goes. */
	recent: DrawingTools | null = null;
}

export const activeDrawing = new ActiveDrawing();
