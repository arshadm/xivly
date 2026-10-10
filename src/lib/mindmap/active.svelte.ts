// The mind map being edited (focused) in this window, for the notes' toolbar:
// while there is one, the bar shows the map's tools instead of text formatting.

export interface MapTools {
	addChild(): void;
	addSibling(): void;
	remove(): void;
	wrap(mark: '**' | '*' | '`'): void;
	togglePage(): void;
	toggleCollapsed(): void;
	fit(): void;
	zoomIn(): void;
	zoomOut(): void;
	undo(): void;
	redo(): void;
	/** Back to the text after the map. */
	exit(): void;
	/** The selected topic: is it the central one, does it link a page, has it children, is it folded? */
	state(): { root: boolean; page: boolean; children: boolean; collapsed: boolean };
}

class ActiveMap {
	/** Raw: the very object the map registered (compared by identity when it leaves). */
	tools = $state.raw<MapTools | null>(null);
}

export const activeMap = new ActiveMap();
