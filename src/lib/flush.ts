// Unsaved work that must be dealt with before a window or the app goes away
// (reader annotations). The layout runs `flushAll` on window close / quit.

interface Flusher {
	dirty(): boolean;
	/**
	 * Save, discard or ask (per settings). Resolves `false` if the user
	 * cancelled, so the window must stay open.
	 */
	flush(): Promise<boolean>;
}

const flushers = new Set<Flusher>();

/** Register; returns the unregister function (use as an effect teardown). */
export function onFlush(f: Flusher) {
	flushers.add(f);
	return () => void flushers.delete(f);
}

export const hasUnsaved = () => [...flushers].some((f) => f.dirty());

/** `true` when every flusher is done (saved or discarded); `false` if one was cancelled. */
export async function flushAll() {
	for (const f of flushers) if (f.dirty() && !(await f.flush())) return false;
	return true;
}
