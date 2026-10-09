<!--
	The reader's right-hand pane (notes, later chat and mind map), beside the
	pages. Its left edge resizes it: drag, ← → when focused, double-click for
	the default width. The width is kept in settings.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { settings } from '#lib/settings.svelte.js';
	import { clampWidth, PANE_DEFAULT, PANE_MIN } from './pane';

	let { children, class: className = '' }: { children: Snippet; class?: string } = $props();

	let innerWidth = $state(typeof window === 'undefined' ? 1280 : window.innerWidth);
	// While dragging: the width shown, saved once on release (settings sync to every window).
	let dragWidth = $state<number | null>(null);
	const width = $derived(clampWidth(dragWidth ?? settings.values.notesPaneWidth, innerWidth));

	function onpointerdown(e: PointerEvent) {
		if (e.button !== 0) return;
		e.preventDefault();
		const handle = e.currentTarget as HTMLElement;
		handle.setPointerCapture(e.pointerId);
		const startX = e.clientX;
		const start = width;
		const move = (ev: PointerEvent) => (dragWidth = clampWidth(start + (startX - ev.clientX), innerWidth));
		const up = () => {
			handle.removeEventListener('pointermove', move);
			if (dragWidth !== null) settings.set('notesPaneWidth', dragWidth);
			dragWidth = null;
		};
		handle.addEventListener('pointermove', move);
		handle.addEventListener('lostpointercapture', up, { once: true });
	}

	function onkeydown(e: KeyboardEvent) {
		const step = e.shiftKey ? 80 : 20;
		if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
			e.preventDefault();
			settings.set('notesPaneWidth', clampWidth(width + (e.key === 'ArrowLeft' ? step : -step), innerWidth));
		}
	}
</script>

<svelte:window bind:innerWidth />

<aside class="relative flex shrink-0 flex-col border-l border-stone-200 dark:border-stone-800 {className}" style:width="{width}px">
	<!-- A focusable separator is the ARIA window splitter: it takes keys and pointer drags. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
	<div
		role="separator"
		aria-orientation="vertical"
		aria-label="Resize the notes pane"
		aria-valuenow={width}
		aria-valuemin={PANE_MIN}
		tabindex="0"
		class="absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize outline-none after:absolute after:inset-y-0 after:left-[3px] after:w-0.5 after:transition-colors hover:after:bg-sky-500/60 focus-visible:after:bg-sky-500 {dragWidth !== null ? 'after:bg-sky-500' : ''}"
		{onpointerdown}
		{onkeydown}
		ondblclick={() => settings.set('notesPaneWidth', PANE_DEFAULT)}
	></div>
	{@render children()}
</aside>
