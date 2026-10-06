<!--
	Center the page across the scroll direction (shown only when it's off-center):
	horizontally when pages scroll down, vertically when they scroll sideways.
	Double-click (Alt+click, or Shift+Enter from the keyboard) locks it: the page fits the
	width (or height), with no scrolling on that axis and no zooming (the reader passes
	`locked` to Viewer.Root zoomLocked). Click (Enter) to unlock.
-->
<script lang="ts">
	import { fade } from 'svelte/transition';
	import { ViewerContext } from 'svelte-pdf-mini';
	import Tip from '$lib/ui/Tip.svelte';

	let { locked = $bindable(false) }: { locked?: boolean } = $props();
	const viewer = ViewerContext.get();
	let offCenter = $state(false);

	/** The cross axis: what "centered" means for the current scroll mode. */
	const vertical = $derived(viewer.scrollMode === 'horizontal');
	const fitMode = $derived(vertical ? 'page-height' : 'page-width');
	const center = (el: HTMLElement) => (vertical ? (el.scrollHeight - el.clientHeight) / 2 : (el.scrollWidth - el.clientWidth) / 2);
	const offset = (el: HTMLElement) => (vertical ? el.scrollTop : el.scrollLeft);
	const overflows = (el: HTMLElement) => (vertical ? el.scrollHeight > el.clientHeight + 1 : el.scrollWidth > el.clientWidth + 1);

	// Track the position across the scroll direction (scroll / zoom / resize).
	$effect(() => {
		const el = viewer.scrollEl;
		if (!el) return;
		const update = () => (offCenter = overflows(el) && Math.abs(offset(el) - center(el)) > 4);
		update();
		el.addEventListener('scroll', update, { passive: true });
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => (el.removeEventListener('scroll', update), ro.disconnect());
	});

	// Switching scroll mode changes the axis: start unlocked.
	$effect(() => {
		void vertical;
		return () => (locked = false);
	});

	$effect(() => {
		const el = viewer.scrollEl;
		if (!el || !locked) return;
		const prop = vertical ? 'overflowY' : 'overflowX';
		el.style[prop] = 'hidden';
		return () => void (el.style[prop] = '');
	});

	// Centering hides the button (it's no longer off-center): keep it a moment
	// so the second click of a double-click still lands on it.
	let holding = $state(false);
	let holdTimer: ReturnType<typeof setTimeout> | undefined;

	// Double-click, Alt+click or Shift+Enter locks; a click or Enter centers (or unlocks).
	function click(e: MouseEvent) {
		clearTimeout(holdTimer);
		if (e.detail >= 2 || (e.altKey && !locked)) {
			// Fit first: once locked (Viewer.Root zoomLocked), the zoom can't change.
			viewer.zoomMode = fitMode;
			locked = true;
		} else if (locked) locked = false;
		else {
			holding = true;
			holdTimer = setTimeout(() => (holding = false), 700);
			const el = viewer.scrollEl;
			el?.scrollTo({ [vertical ? 'top' : 'left']: center(el), behavior: 'smooth' });
		}
	}
</script>

{#if offCenter || locked || holding}
	<div class="absolute right-5 bottom-5 z-20" transition:fade={{ duration: 120 }}>
		<Tip label={locked ? 'Centered & locked: click to unlock' : 'Center the page · double-click (or Shift+Enter) to lock'} side="left">
			{#snippet child({ props })}
				<button
					{...props}
					class="grid size-9 place-items-center rounded-full shadow-lg ring-1 transition {locked
						? 'bg-stone-900 text-white ring-white/10 dark:bg-stone-100 dark:text-stone-900'
						: 'bg-white/90 text-stone-700 ring-black/10 backdrop-blur hover:bg-white dark:bg-stone-800/90 dark:text-stone-200 dark:ring-white/10'}"
					aria-label={locked ? 'Unlock centering' : 'Center the page'}
					aria-pressed={locked}
					onclick={click}
					onkeydown={(e) => {
						if (e.key !== 'Enter' || !e.shiftKey || locked) return;
						e.preventDefault();
						click(new MouseEvent('click', { detail: 2 }));
					}}
				>
					<span class="{locked ? 'icon-[lucide--lock]' : vertical ? 'icon-[lucide--align-center-horizontal]' : 'icon-[lucide--align-center-vertical]'} size-4"></span>
				</button>
			{/snippet}
		</Tip>
	</div>
{/if}
