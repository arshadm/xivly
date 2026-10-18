// A paper's view (zoom, where it's scrolled to, how far across) read from a viewer and
// put back, for a window to reopen as it was left (kept in `.xivly/devices/`, see devices.ts).
import { untrack } from 'svelte';
import type { ViewerState } from 'svelte-pdf-mini';
import type { PageView } from '#lib/devices.js';

/** The scroll offset across the scroll direction (sideways unless pages scroll sideways), and its range. */
function across(v: ViewerState): [offset: number, max: number, axis: 'left' | 'top'] | null {
	const el = v.scrollEl;
	if (!el) return null;
	return v.scrollMode === 'horizontal' ? [el.scrollTop, el.scrollHeight - el.clientHeight, 'top'] : [el.scrollLeft, el.scrollWidth - el.clientWidth, 'left'];
}

export function pageViewOf(v: ViewerState): PageView {
	const a = across(v);
	return { position: Number(v.position.toFixed(3)), mode: v.zoomMode, zoom: Number(v.zoom.toFixed(3)), cross: a && a[1] > 1 ? Number((a[0] / a[1]).toFixed(3)) : undefined };
}

/** Show the pages at `position` (none: where they are), zoomed and scrolled across as in `view`. */
export async function showPageView(v: ViewerState, position?: number, view?: PageView | null) {
	if (view) {
		if (view.mode === 'manual') v.zoomTo(view.zoom, { animate: false });
		else v.zoomMode = view.mode;
		await new Promise(requestAnimationFrame);
	}
	if (position) await v.restorePosition(position);
	const a = across(v);
	if (view?.cross !== undefined && a && a[1] > 1) v.scrollEl?.scrollTo({ [a[2]]: view.cross * a[1], behavior: 'instant' });
}

/**
 * Call during a component's setup: `save` gets the view a moment after it's scrolled or
 * zoomed, and at once when the window or the viewer goes away. Not while `paused` (the
 * view being restored).
 */
export function watchPageView(viewer: () => ViewerState | undefined, save: (view: PageView) => void, paused: () => boolean = () => false) {
	$effect(() => {
		const v = viewer();
		const el = v?.scrollEl;
		if (!v || !el) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const flush = () => {
			clearTimeout(timer);
			timer = undefined;
			if (!paused() && v.document.status === 'ready') save(pageViewOf(v));
		};
		const later = () => {
			clearTimeout(timer);
			timer = setTimeout(flush, 150);
		};
		el.addEventListener('scroll', later, { passive: true });
		window.addEventListener('pagehide', flush);
		window.addEventListener('beforeunload', flush);
		const stopZoom = $effect.root(() => {
			$effect(() => {
				void v.zoom;
				void v.zoomMode;
				untrack(later);
			});
		});
		return () => {
			if (timer) flush();
			stopZoom();
			el.removeEventListener('scroll', later);
			window.removeEventListener('pagehide', flush);
			window.removeEventListener('beforeunload', flush);
		};
	});
}
