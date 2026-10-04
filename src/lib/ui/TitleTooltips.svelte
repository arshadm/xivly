<!--
	Every native `title` tooltip becomes the app's tooltip: a bits-ui Tooltip
	anchored (customAnchor) to whatever element carries the title, so library
	parts (svelte-pdf-mini) and anything else get the same look and placement
	as <Tip>. "Highlight (H)" shows "Highlight" with a <kbd>H</kbd>.
-->
<script lang="ts">
	import { Tooltip } from 'bits-ui';
	import { fly } from 'svelte/transition';
	import Kbd from './Kbd.svelte';

	let open = $state(false);
	let anchor = $state<HTMLElement | null>(null);
	let label = $state('');
	let key = $state<string | undefined>();
	let timer: ReturnType<typeof setTimeout> | undefined;

	function restore() {
		if (anchor?.dataset.title) anchor.setAttribute('title', anchor.dataset.title);
	}
	function hide() {
		clearTimeout(timer);
		open = false;
		restore();
		anchor = null;
	}

	function onOver(e: PointerEvent) {
		const t = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('[title]');
		if (!t || t === anchor) return;
		hide();
		const raw = t.getAttribute('title')?.trim() ?? '';
		const m = /^(.*?)\s*\(([^()]{1,12})\)$/.exec(raw);
		// Only when it adds something: a tooltip repeating the visible text is noise.
		const visible = t.innerText?.replace(/\s+/g, ' ').trim().toLowerCase();
		if (!raw || (!m && visible === raw.toLowerCase())) return;
		// Keep the text, drop the native tooltip.
		t.dataset.title = raw;
		t.removeAttribute('title');
		anchor = t;
		label = m ? m[1] : raw;
		key = m?.[2];
		timer = setTimeout(() => anchor === t && (open = true), 400);
	}

	function onOut(e: PointerEvent) {
		if (anchor && !anchor.contains(e.relatedTarget as Node | null)) hide();
	}
</script>

<svelte:window onpointerover={onOver} onpointerout={onOut} onpointerdown={hide} onwheel={hide} onkeydown={hide} />

<Tooltip.Root bind:open disableHoverableContent>
	<Tooltip.Portal>
		<Tooltip.Content customAnchor={anchor} side="bottom" sideOffset={6} forceMount>
			{#snippet child({ wrapperProps, props, open: isOpen })}
				{#if isOpen && anchor}
					<div {...wrapperProps}>
						<div {...props} transition:fly={{ y: -4, duration: 120 }} class="pointer-events-none z-[100] flex items-center gap-2 rounded-md bg-stone-900 px-2 py-1 text-xs text-white shadow-lg dark:bg-stone-100 dark:text-stone-900">
							{label}
							{#if key}<Kbd class="border-stone-600 bg-stone-800 text-stone-300 dark:border-stone-300 dark:bg-white dark:text-stone-600">{key}</Kbd>{/if}
						</div>
					</div>
				{/if}
			{/snippet}
		</Tooltip.Content>
	</Tooltip.Portal>
</Tooltip.Root>
