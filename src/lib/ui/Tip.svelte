<!--
	Tooltip recipe (bits-ui Tooltip) that composes with any part through the `child` snippet:

	<Tip label="Zoom in" shortcut="⌘ +">
		{#snippet child({ props })}<Zoom.In {...props} />{/snippet}
	</Tip>

	`props` carries bits-ui's trigger attributes, handlers and ref attachment; our
	parts merge them with their own (handlers are chained).
-->
<script lang="ts">
	import { Tooltip } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { fly } from 'svelte/transition';
	import Kbd from './Kbd.svelte';

	let { label, shortcut, side = 'bottom', child }: { label: string; shortcut?: string; side?: 'top' | 'bottom' | 'left' | 'right'; child: Snippet<[{ props: Record<string, unknown> }]> } = $props();
</script>

<Tooltip.Root delayDuration={350}>
	<Tooltip.Trigger>
		{#snippet child({ props })}{@render childSnippet({ props })}{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Portal>
		<Tooltip.Content {side} sideOffset={6} forceMount>
			{#snippet child({ wrapperProps, props, open })}
				{#if open}
					<div {...wrapperProps}>
						<div {...props} transition:fly={{ y: side === 'top' ? 4 : -4, duration: 120 }} class="z-50 flex items-center gap-2 rounded-md bg-stone-900 px-2 py-1 text-xs text-white shadow-lg dark:bg-stone-100 dark:text-stone-900">
							{label}
							{#if shortcut}<Kbd class="border-stone-600 bg-stone-800 text-stone-300 dark:border-stone-300 dark:bg-white dark:text-stone-600">{shortcut}</Kbd>{/if}
						</div>
					</div>
				{/if}
			{/snippet}
		</Tooltip.Content>
	</Tooltip.Portal>
</Tooltip.Root>

{#snippet childSnippet({ props }: { props: Record<string, unknown> })}{@render child({ props })}{/snippet}
