<!--
	"Back to page N" after following a link: appears on each jump, fades out
	after a few seconds (stays while hovered), × dismisses it.
-->
<script lang="ts">
	import { fly } from 'svelte/transition';
	import { comboLabel, ViewerContext } from 'svelte-pdf-mini';
	import Kbd from '#lib/ui/Kbd.svelte';

	const viewer = ViewerContext.get();
	const to = $derived(viewer.history.back.at(-1) ?? null);
	let visible = $state(false);
	let hovered = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	const arm = () => {
		clearTimeout(timer);
		timer = setTimeout(() => !hovered && (visible = false), 5000);
	};

	// Show on every new jump (the stack grows), hide when there's nowhere to go back to.
	let depth = 0;
	$effect(() => {
		const n = viewer.history.back.length;
		if (n > depth) {
			visible = true;
			arm();
		}
		if (!n) visible = false;
		depth = n;
	});
	$effect(() => () => clearTimeout(timer));
</script>

{#if visible && to}
	<div
		class="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center overflow-hidden rounded-full bg-stone-900/90 text-[13px] text-white shadow-lg ring-1 ring-white/10 backdrop-blur dark:bg-stone-100/90 dark:text-stone-900 dark:ring-black/10"
		transition:fly={{ y: 8, duration: 160 }}
		role="group"
		aria-label="Back"
		onpointerenter={() => (hovered = true)}
		onpointerleave={() => ((hovered = false), arm())}
	>
		<button class="flex items-center gap-2 py-1.5 pr-2 pl-3 hover:bg-white/10 dark:hover:bg-black/5" onclick={() => (viewer.back(), (visible = false))}>
			<span class="icon-[lucide--undo-2] size-3.5"></span>
			Back to p. {viewer.document.pageLabel(to.page)}
			<Kbd class="border-white/20 bg-white/10 text-white/70 dark:border-black/15 dark:bg-black/5 dark:text-stone-600">{comboLabel(viewer.keymap, 'nav.back')}</Kbd>
		</button>
		<span class="h-4 w-px bg-white/20 dark:bg-black/15"></span>
		<button class="grid size-8 place-items-center hover:bg-white/10 dark:hover:bg-black/5" aria-label="Dismiss" title="Dismiss" onclick={() => (visible = false)}>
			<span class="icon-[lucide--x] size-3.5"></span>
		</button>
	</div>
{/if}
