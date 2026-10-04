<!-- Hovering an annotation shows its note: Annotations.HoverCard restyled, with enter/exit transitions. -->
<script lang="ts">
	import { Annotations } from 'svelte-pdf-mini';
	import { fly } from 'svelte/transition';
</script>

<Annotations.HoverCard forceMount delay={180}>
	{#snippet child({ props, open, annotation, color })}
		{#if open}
			<div {...props} transition:fly={{ y: 6, duration: 140 }} class="max-w-80 overflow-hidden rounded-xl border border-stone-200 bg-white/95 text-sm shadow-xl backdrop-blur dark:border-stone-700 dark:bg-stone-900/95">
				<div class="h-1" style:background={color}></div>
				<div class="px-3 py-2">
					<p class="mb-1 flex items-center gap-1.5 text-[11px] text-stone-500">
						<span class="icon-[lucide--message-square-text] size-3"></span>{annotation.author?.name ?? 'Note'}{#if annotation.label}<span class="font-medium text-stone-700 dark:text-stone-300">· {annotation.label}</span>{/if}
					</p>
					{#if annotation.label && annotation.contents}<div class="mb-1.5 border-b border-stone-200 pb-1.5 dark:border-stone-700"></div>{/if}
					{#if annotation.contents}<div class="text-stone-800 dark:text-stone-100"><Annotations.Markdown source={annotation.contents} /></div>{/if}
				</div>
			</div>
		{/if}
	{/snippet}
</Annotations.HoverCard>
