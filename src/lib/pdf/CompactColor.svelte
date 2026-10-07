<!-- The active annotation color as one button; the palette opens in a popover. -->
<script lang="ts">
	import { iconButton } from '#lib/ui/button.js';
	import { Popover } from 'bits-ui';
	import { scale } from 'svelte/transition';
	import { Annotations, AnnotationsContext } from 'svelte-pdf-mini';
	import Tip from '../ui/Tip.svelte';

	let { class: className }: { class?: string } = $props();
	const store = AnnotationsContext.get();
	const current = $derived(store.palette.find((c) => c.key === store.color) ?? store.palette[0]);
</script>

<Popover.Root>
	<Tip label="Color">
		{#snippet child({ props })}
			<Popover.Trigger {...props} aria-label="Annotation color" class={iconButton(7, className)}>
				<span class="size-4 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)]" style:background={current?.light}></span>
			</Popover.Trigger>
		{/snippet}
	</Tip>
	<Popover.Portal>
		<Popover.Content sideOffset={6} forceMount>
			{#snippet child({ wrapperProps, props, open })}
				{#if open}
					<div {...wrapperProps}>
						<div {...props} transition:scale={{ start: 0.96, duration: 110 }} class="z-(--z-menu) flex gap-1.5 rounded-xl border border-stone-200 bg-white p-2 shadow-xl dark:border-stone-700 dark:bg-stone-900">
							{#each store.palette.slice(0, 9) as c, i (c.key)}
								<Tip label={c.label} shortcut={String(i + 1)}>
									{#snippet child({ props: tip })}
										<Annotations.Color {...tip} color={c.key} class="size-5 rounded-full bg-(--swatch) shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)] ring-offset-[1.5px] ring-offset-white data-[active]:ring-[1.5px] data-[active]:ring-stone-800 dark:ring-offset-stone-900 dark:data-[active]:ring-stone-100" />
									{/snippet}
								</Tip>
							{/each}
						</div>
					</div>
				{/if}
			{/snippet}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
