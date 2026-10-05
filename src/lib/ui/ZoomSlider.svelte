<!--
	Zoom slider recipe: bits-ui Slider driving ViewerState.zoomTo (animated), log scale.
	Spans the viewer's whole zoom range and only reacts to the user moving it
	(a two-way binding would clamp and fight zooms made elsewhere).
-->
<script lang="ts">
	import { Slider } from 'bits-ui';
	import type { ViewerState } from 'svelte-pdf-mini';
	import { cn } from './cn';

	let { viewer, class: className }: { viewer: ViewerState; class?: string } = $props();
	// The viewer's zoom limits are the slider's ends.
	const min = $derived(viewer.minZoom);
	const max = $derived(viewer.maxZoom);
	// Slider in log space so 50%→100% feels like 100%→200%.
	const toPos = (z: number) => Math.log(Math.min(max, Math.max(min, z)) / min) / Math.log(max / min);
	const toZoom = (p: number) => min * Math.pow(max / min, p);
</script>

<Slider.Root
	type="single"
	disabled={viewer.zoomLocked}
	min={0}
	max={1}
	step={0.005}
	value={toPos(viewer.zoom)}
	onValueChange={(p) => {
		// Ignore echoes of the current zoom (the slider rounds to its step).
		if (Math.abs(p - toPos(viewer.zoom)) > 0.008) viewer.zoomTo(toZoom(p));
	}}
	aria-label="Zoom"
	class={cn('relative flex h-5 w-36 touch-none items-center select-none data-[disabled]:opacity-40', className)}
>
	<span class="relative h-1 w-full grow overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
		<Slider.Range class="absolute h-full bg-stone-500 dark:bg-stone-400" />
	</span>
	<Slider.Thumb index={0} class="block size-4 rounded-full border border-stone-300 bg-white shadow transition-transform outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:border-stone-500" />
</Slider.Root>
