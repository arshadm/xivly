// The reading list: papers you're reading now (marked by you: `reading`, when) and
// the ones to read next, in the order you put them (`queue`, a rank: lower comes
// first). Both live in each paper's paper.json, so reordering on one device
// changes only the paper moved, never one shared list (fewer sync conflicts).
import type { Paper } from './types';

/** What you're reading, most recently opened first. */
export function readingNow(papers: Paper[]): Paper[] {
	const last = (p: Paper) => [p.opened ?? '', p.reading ?? ''].sort().at(-1)!;
	return papers.filter((p) => p.reading && !p.read).toSorted((a, b) => last(b).localeCompare(last(a)));
}

/** Up next, in your order (not the ones being read already). */
export function upNext(papers: Paper[]): Paper[] {
	return papers.filter((p) => p.queue !== undefined && !p.reading && !p.read).toSorted((a, b) => a.queue! - b.queue! || (a.added ?? '').localeCompare(b.added ?? ''));
}

/** A rank between two neighbors (either may be missing: the top or the end of the queue). */
export function rankBetween(before: number | undefined, after: number | undefined): number {
	if (before === undefined && after === undefined) return 0;
	if (before === undefined) return after! - 1;
	if (after === undefined) return before + 1;
	return (before + after) / 2;
}

/** The rank that puts `id` at `index` of the queue (counted without it). */
export function rankAt(queue: Paper[], id: string, index: number): number {
	const others = queue.filter((p) => p.id !== id);
	const i = Math.max(0, Math.min(index, others.length));
	return rankBetween(others[i - 1]?.queue, others[i]?.queue);
}
