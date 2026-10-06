/**
 * A key for a `{#key}` block over a list that changes views (All papers, a category,
 * Recent…): it changes only when the view changes to items that share none with the
 * previous ones. Shared items can then move (flip) between views, while views with
 * nothing in common swap as a whole.
 *
 * `next()` is a memo over the sequence of (view, ids) it is given: the same inputs in
 * the same order always give the same keys, so it can run inside a `$derived`.
 */
export function disjointViewKey() {
	let view = '';
	let ids = new Set<string>();
	let key = 0;
	return {
		next(nextView: string, nextIds: string[]): number {
			if (nextView !== view) {
				if (view && !nextIds.some((id) => ids.has(id))) key++;
				view = nextView;
			}
			ids = new Set(nextIds);
			return key;
		}
	};
}
