<!-- Zoom picker recipe: bits-ui Select over fit modes + steps (an alternative to Zoom.Select). -->
<script lang="ts">
	import { Select } from 'bits-ui';
	import { scale } from 'svelte/transition';
	import type { ViewerState, ZoomMode } from 'svelte-pdf-mini';
	import { cn } from './cn';

	let { viewer, class: className }: { viewer: ViewerState; class?: string } = $props();
	const modes: { value: string; label: string }[] = [
		{ value: 'auto', label: 'Automatic' },
		{ value: 'page-width', label: 'Page width' },
		{ value: 'page-fit', label: 'Page fit' }
	];
	const steps = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map((s) => ({ value: `z:${s}`, label: `${Math.round(s * 100)}%` }));
	const value = $derived(viewer.zoomMode === 'manual' ? `z:${viewer.zoom}` : viewer.zoomMode);
	const label = $derived(viewer.zoomMode === 'manual' ? `${Math.round(viewer.zoom * 100)}%` : modes.find((m) => m.value === viewer.zoomMode)?.label);
	const choose = (v: string) => (v.startsWith('z:') ? viewer.zoomTo(Number(v.slice(2))) : (viewer.zoomMode = v as ZoomMode));
</script>

<Select.Root type="single" bind:value={() => value, choose} items={[...modes, ...steps]}>
	<Select.Trigger aria-label="Zoom" class={cn('inline-flex h-8 w-32 items-center justify-between gap-1 rounded-md border border-stone-300 px-2 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:border-stone-700', className)}>
		{label}<span class="icon-[lucide--chevrons-up-down] size-3.5 text-stone-400"></span>
	</Select.Trigger>
	<Select.Portal>
		<Select.Content sideOffset={4} forceMount>
			{#snippet child({ wrapperProps, props, open })}
				{#if open}
					<div {...wrapperProps}>
						<div {...props} transition:scale={{ start: 0.96, duration: 120 }} class="z-50 w-40 rounded-lg border border-stone-200 bg-white p-1 text-sm shadow-xl dark:border-stone-700 dark:bg-stone-900">
							{#each [modes, steps] as group, gi (gi)}
								{#if gi}<div class="my-1 h-px bg-stone-200 dark:bg-stone-700"></div>{/if}
								{#each group as item (item.value)}
									<Select.Item value={item.value} label={item.label} class="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 outline-none data-[highlighted]:bg-stone-100 dark:data-[highlighted]:bg-stone-800">
										{#snippet children({ selected })}{item.label}{#if selected}<span class="icon-[lucide--check] size-4"></span>{/if}{/snippet}
									</Select.Item>
								{/each}
							{/each}
						</div>
					</div>
				{/if}
			{/snippet}
		</Select.Content>
	</Select.Portal>
</Select.Root>
