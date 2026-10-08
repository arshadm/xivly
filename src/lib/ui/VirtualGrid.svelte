<!--
	A grid of equal-height cells, laid out like `repeat(auto-fill, minmax(min, 1fr))`,
	that renders only the rows near the viewport of its scrolling ancestor: a
	library of thousands of papers costs a few dozen cards.

	<VirtualGrid items={papers} key={(p) => p.id} min={170} gap={20} scroller={el}>
		{#snippet cell(paper)}<PaperCard {paper} />{/snippet}
	</VirtualGrid>
-->
<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';

	let {
		items,
		key,
		min,
		gap,
		scroller,
		cell,
		overscan = 2,
		class: className = ''
	}: {
		items: T[];
		key: (item: T) => string;
		/** Minimum cell width (px). */
		min: number;
		/** Gap between cells, both ways (px). */
		gap: number;
		/** The element that scrolls the grid. */
		scroller: HTMLElement | undefined;
		cell: Snippet<[T]>;
		/** Rows rendered beyond each edge of the viewport. */
		overscan?: number;
		class?: string;
	} = $props();

	let grid = $state<HTMLElement>();
	let width = $state(0);
	let viewHeight = $state(0);
	/** Scroll position from the top of the grid (negative while the grid starts below the viewport's top). */
	let top = $state(0);
	let measured = $state(0);

	const columns = $derived(Math.max(1, Math.floor((width + gap) / (min + gap))));
	// Before a row is measured: cells are 3:4 like the cards (corrected right after).
	const rowHeight = $derived(measured || ((width - gap * (columns - 1)) / columns) * (4 / 3));
	const stride = $derived(rowHeight + gap);
	const rows = $derived(Math.ceil(items.length / columns));
	const first = $derived(stride > 0 ? Math.max(0, Math.floor(top / stride) - overscan) : 0);
	const last = $derived(stride > 0 ? Math.min(rows - 1, Math.ceil((top + viewHeight) / stride) + overscan) : rows - 1);
	const shown = $derived(items.slice(first * columns, (last + 1) * columns));

	function update() {
		if (!grid || !scroller) return;
		top = scroller.getBoundingClientRect().top - grid.getBoundingClientRect().top;
		viewHeight = scroller.clientHeight;
	}

	$effect(() => {
		const el = scroller;
		if (!el || !grid) return;
		update();
		const sizes = new ResizeObserver(() => {
			width = grid!.clientWidth;
			update();
		});
		sizes.observe(grid);
		sizes.observe(el);
		el.addEventListener('scroll', update, { passive: true });
		return () => {
			sizes.disconnect();
			el.removeEventListener('scroll', update);
		};
	});

	// Cell height follows from the column width: measure a rendered one.
	$effect(() => {
		void columns;
		void width;
		void shown.length;
		const h = grid?.querySelector(':scope > ul > li')?.getBoundingClientRect().height;
		if (h && Math.abs(h - measured) > 0.5) measured = h;
	});
</script>

<div bind:this={grid} class={className} style:padding-top="{first * stride}px" style:padding-bottom="{Math.max(0, rows - last - 1) * stride}px">
	<ul class="grid" style:gap="{gap}px" style:grid-template-columns="repeat({columns}, minmax(0, 1fr))">
		{#each shown as item (key(item))}
			<li>{@render cell(item)}</li>
		{/each}
	</ul>
</div>
