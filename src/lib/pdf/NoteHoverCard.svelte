<!-- Hovering an annotation shows its note: Annotations.HoverCard restyled, with enter/exit transitions. -->
<script lang="ts">
	import { Annotations } from 'svelte-pdf-mini';
	import { fly } from 'svelte/transition';
</script>

<Annotations.HoverCard forceMount delay={180}>
	{#snippet child({ props, open, annotation, color })}
		{#if open}
			<div {...props} transition:fly|global={{ y: 6, duration: 140 }} class="max-w-80 overflow-hidden rounded-xl border p-0! border-stone-200 bg-white/95 text-sm shadow-xl backdrop-blur dark:border-stone-700 dark:bg-stone-900/95">
				<div class="h-1" style:background={color}></div>
				<div class="px-3 py-2">
					{#if annotation.label}<p class="mb-1 text-[11px] font-medium text-stone-700 dark:text-stone-300">{annotation.label}</p>{/if}
					{#if annotation.label && annotation.contents}<div class="mb-1.5 border-b border-stone-200 pb-1.5 dark:border-stone-700"></div>{/if}
					{#if annotation.contents}<div class="text-stone-800 dark:text-stone-100"><Annotations.Markdown source={annotation.contents} /></div>{/if}
				</div>
			</div>
		{/if}
	{/snippet}
</Annotations.HoverCard>
