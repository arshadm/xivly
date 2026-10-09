// Places in a paper (`PaperAnchor`): made from the reader's position, read
// back from files (which people and agents may edit), and jumped to.
import type { ViewerState } from 'svelte-pdf-mini';
import type { PaperAnchor } from './types';

/** The anchor for a reader position (rounded like the saved reading position). */
export function anchorAt(position: number, label?: string): PaperAnchor {
	const page = Math.max(1, Number(position.toFixed(2)));
	return label?.trim() ? { page, label: label.trim() } : { page };
}

/** An anchor from a file, or `null` when it isn't one. */
export function parseAnchor(raw: unknown): PaperAnchor | null {
	if (!raw || typeof raw !== 'object') return null;
	const { page, label } = raw as Record<string, unknown>;
	if (typeof page !== 'number' || !Number.isFinite(page) || page < 1) return null;
	return typeof label === 'string' && label.trim() ? { page, label: label.trim() } : { page };
}

/** "p. 7", or the anchor's own label. */
export function anchorLabel(anchor: PaperAnchor): string {
	return anchor.label ?? `p. ${Math.floor(anchor.page)}`;
}

/** Jump to an anchor, remembering where we came from ("Back to page N"). */
export async function jumpTo(viewer: Pick<ViewerState, 'document' | 'history' | 'location' | 'restorePosition'>, anchor: PaperAnchor) {
	if (viewer.document.status !== 'ready') return;
	viewer.history.push(viewer.location());
	await viewer.restorePosition(anchor.page);
}
