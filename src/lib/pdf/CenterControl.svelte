<!--
	Center the page horizontally (shown only when it's off-centre).
	Double-click locks it: no horizontal scrolling, and zoom can't go past
	the page width (the whole width always stays in view). Click to unlock.
-->
<script lang="ts">
	import { fade } from 'svelte/transition';
	import { ViewerContext } from 'svelte-pdf-mini';
	import Tip from '$lib/ui/Tip.svelte';

	let { locked = $bindable(false) }: { locked?: boolean } = $props();
	const viewer = ViewerContext.get();
	let offCentre = $state(false);

	const centre = (el: HTMLElement) => (el.scrollWidth - el.clientWidth) / 2;

	// Track horizontal position (scroll / zoom / resize).
	$effect(() => {
		const el = viewer.scrollEl;
		if (!el) return;
		const update = () => (offCentre = el.scrollWidth > el.clientWidth + 1 && Math.abs(el.scrollLeft - centre(el)) > 4);
		update();
		el.addEventListener('scroll', update, { passive: true });
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => (el.removeEventListener('scroll', update), ro.disconnect());
	});

	// Locked: fit the width and never zoom past it.
	let fit = 0;
	$effect(() => {
		if (!locked) return;
		if (viewer.zoomMode === 'page-width') fit = viewer.zoom;
		else if (fit && viewer.zoom > fit + 1e-3) viewer.zoomMode = 'page-width';
	});
	$effect(() => {
		const el = viewer.scrollEl;
		if (!el) return;
		el.style.overflowX = locked ? 'hidden' : '';
		return () => void (el.style.overflowX = '');
	});

	function lock() {
		locked = true;
		viewer.zoomMode = 'page-width';
	}
	function click() {
		if (locked) locked = false;
		else viewer.scrollEl?.scrollTo({ left: centre(viewer.scrollEl), behavior: 'smooth' });
	}
</script>

{#if offCentre || locked}
	<div class="absolute right-5 bottom-5 z-20" transition:fade={{ duration: 120 }}>
		<Tip label={locked ? 'Centred & locked: click to unlock' : 'Center the page · double-click to lock'} side="left">
			{#snippet child({ props })}
				<button
					{...props}
					class="grid size-9 place-items-center rounded-full shadow-lg ring-1 transition {locked
						? 'bg-stone-900 text-white ring-white/10 dark:bg-stone-100 dark:text-stone-900'
						: 'bg-white/90 text-stone-700 ring-black/10 backdrop-blur hover:bg-white dark:bg-stone-800/90 dark:text-stone-200 dark:ring-white/10'}"
					aria-label={locked ? 'Unlock centring' : 'Center the page'}
					aria-pressed={locked}
					onclick={click}
					ondblclick={lock}
				>
					<span class="{locked ? 'icon-[lucide--lock]' : 'icon-[lucide--align-center-vertical]'} size-4"></span>
				</button>
			{/snippet}
		</Tip>
	</div>
{/if}
