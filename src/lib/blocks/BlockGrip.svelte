<!--
	The bottom edge of a block in the notes (a mind map, a drawing): a grip that
	shows it can be resized. Drag it (the height follows, saved on release), ↑ ↓
	when it has focus, double-click to fit the height to what's in the block.
-->
<script lang="ts">
	let {
		height,
		min = 160,
		max = 2000,
		dragging = $bindable(null),
		onresize,
		onfit
	}: {
		height: number;
		min?: number;
		max?: number;
		/** While dragged: the height shown (null otherwise). */
		dragging?: number | null;
		onresize: (height: number) => void;
		/** Double-click: the height that fits the content. */
		onfit?: () => void;
	} = $props();

	const clamp = (h: number) => Math.round(Math.max(min, Math.min(max, h)));

	function onpointerdown(e: PointerEvent) {
		if (e.button !== 0) return;
		e.preventDefault();
		const grip = e.currentTarget as HTMLElement;
		grip.setPointerCapture(e.pointerId);
		const startY = e.clientY;
		const start = height;
		const moveTo = (ev: PointerEvent) => (dragging = clamp(start + ev.clientY - startY));
		grip.addEventListener('pointermove', moveTo);
		grip.addEventListener(
			'lostpointercapture',
			() => {
				grip.removeEventListener('pointermove', moveTo);
				if (dragging !== null && dragging !== height) onresize(dragging);
				dragging = null;
			},
			{ once: true }
		);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
		e.preventDefault();
		e.stopPropagation();
		onresize(clamp(height + (e.key === 'ArrowDown' ? 1 : -1) * (e.shiftKey ? 80 : 20)));
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
	class="group/grip absolute inset-x-0 bottom-0 z-10 flex h-3 cursor-ns-resize items-end justify-center pb-0.5 outline-none"
	role="separator"
	aria-orientation="horizontal"
	aria-label="Resize (drag, or ↑ ↓){onfit ? '; double-click to fit' : ''}"
	aria-valuenow={dragging ?? height}
	aria-valuemin={min}
	aria-valuemax={max}
	tabindex="0"
	title="Drag to resize{onfit ? ', double-click to fit' : ''}"
	data-block-grip
	{onpointerdown}
	{onkeydown}
	ondblclick={() => onfit?.()}
>
	<span class="h-1 w-10 rounded-full bg-stone-300 transition-colors group-hover/grip:bg-sky-500 group-focus-visible/grip:bg-sky-500 dark:bg-stone-600 {dragging !== null ? 'bg-sky-500!' : ''}"></span>
</div>
