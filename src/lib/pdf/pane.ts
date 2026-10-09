// Width of the reader's right-hand pane (SplitPane.svelte).

export const PANE_MIN = 280;
export const PANE_DEFAULT = 420;
/** At most this share of the window: the pages keep the rest. */
const MAX_SHARE = 0.6;

/** A pane width that fits the window: never under PANE_MIN, never over 60% of the window (unless that's under PANE_MIN). */
export const clampWidth = (width: number, windowWidth: number) => Math.round(Math.max(PANE_MIN, Math.min(width, Math.max(PANE_MIN, windowWidth * MAX_SHARE))));
