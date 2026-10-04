<!--
	View filters: show/hide all annotations, show/hide side notes, and "show only these
	colours" (palette keys in use, custom colours included). Toggle buttons with
	aria-pressed; colour chips form a group of toggles.
-->
<script lang="ts">
	import { AnnotationsContext } from 'svelte-pdf-mini';
	import Tip from '../ui/Tip.svelte';
	import { cn } from '../ui/cn';

	let { class: className }: { class?: string } = $props();
	const store = AnnotationsContext.get();
	const used = $derived(store.palette.filter((c) => store.usedColors.includes(c.key)));
	const toggle =
		'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-stone-600 outline-none hover:bg-stone-200/70 focus-visible:ring-2 focus-visible:ring-blue-500/60 aria-pressed:bg-stone-900 aria-pressed:text-white dark:text-stone-300 dark:hover:bg-stone-700/60 dark:aria-pressed:bg-stone-100 dark:aria-pressed:text-stone-900';
</script>

<div class={cn('flex flex-wrap items-center gap-1', className)} role="group" aria-label="Annotation filters">
	<Tip label={store.annotationsVisible ? 'Hide annotations' : 'Show annotations'}>
		{#snippet child({ props })}
			<button {...props} type="button" class={toggle} aria-pressed={!store.annotationsVisible} onclick={() => (store.annotationsVisible = !store.annotationsVisible)}>
				<span class="{store.annotationsVisible ? 'icon-[lucide--eye]' : 'icon-[lucide--eye-off]'} size-4"></span>Annotations
			</button>
		{/snippet}
	</Tip>
	<Tip label={store.notesVisible ? 'Hide side notes' : 'Show side notes'}>
		{#snippet child({ props })}
			<button {...props} type="button" class={toggle} aria-pressed={!store.notesVisible} onclick={() => (store.notesVisible = !store.notesVisible)}>
				<span class="{store.notesVisible ? 'icon-[lucide--sticky-note]' : 'icon-[lucide--panel-right-close]'} size-4"></span>Notes
			</button>
		{/snippet}
	</Tip>
	{#if used.length > 1}
		<span class="mx-1 h-5 w-px bg-stone-300 dark:bg-stone-700" aria-hidden="true"></span>
		<span class="text-xs text-stone-500" id="color-filter-label">Only</span>
		<div class="flex items-center gap-1.5" role="group" aria-labelledby="color-filter-label">
			{#each used as c (c.key)}
				{@const on = store.colorFilter?.includes(c.key) ?? false}
				<Tip label={on ? `Stop filtering ${c.label}` : `Show only ${c.label}`}>
					{#snippet child({ props })}
						<button
							{...props}
							type="button"
							aria-pressed={on}
							aria-label="Only {c.label}"
							class="size-5 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)] outline-none focus-visible:ring-2 focus-visible:ring-blue-500 aria-pressed:ring-[1.5px] aria-pressed:ring-stone-800 aria-pressed:ring-offset-[1.5px] dark:aria-pressed:ring-stone-100 dark:ring-offset-stone-900"
							style:background={c.light}
							onclick={() => store.toggleColorFilter(c.key)}
						></button>
					{/snippet}
				</Tip>
			{/each}
			{#if store.colorFilter}
				<button type="button" class="ml-1 text-xs text-blue-600 hover:underline" onclick={() => (store.colorFilter = null)}>All</button>
			{/if}
		</div>
	{/if}
</div>
