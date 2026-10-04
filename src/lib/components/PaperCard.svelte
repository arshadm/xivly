<script lang="ts">
	import { library } from '$lib/library.svelte';
	import { paperMenu } from '$lib/paper-menu';
	import { theme } from '$lib/theme.svelte';
	import type { Paper } from '$lib/types';
	import { contextMenu } from '$lib/ui/context-menu.svelte';
	import { openPaper } from '$lib/windows';

	let { paper }: { paper: Paper } = $props();

	const color = $derived(library.color(paper));
	const category = $derived(library.category(paper.category));
	const authors = $derived(
		paper.authors?.length ? (paper.authors.length > 2 ? `${paper.authors[0]} et al.` : paper.authors.join(', ')) : ''
	);
</script>

<!-- Typographic cover tinted with the category's matte colour. Click opens; right-click for everything else. -->
<button
	class="group flex aspect-[3/4] w-full flex-col overflow-hidden rounded-lg p-4 text-left shadow-sm outline-none ring-stone-500/60 ring-offset-2 ring-offset-stone-50 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 dark:ring-offset-stone-950"
	style:background={theme.dark ? color.dark : color.light}
	onclick={() => openPaper(paper.id, paper.title)}
	{@attach contextMenu(() => paperMenu(paper))}
>
	<span class="text-[11px] font-medium tracking-wide uppercase" style:color={color.accent}>{category?.name ?? ''}</span>
	<span class="mt-2 line-clamp-5 font-serif text-[17px] leading-snug text-stone-900 dark:text-stone-100">{paper.title}</span>
	<span class="mt-auto pt-3 text-xs text-stone-600 dark:text-stone-400">
		<span class="line-clamp-1">{authors}</span>
		{#if paper.year}<span>{paper.year}</span>{/if}
		{#if paper.tags?.length}<span class="ml-1 opacity-70">{paper.tags.map((t) => `#${t}`).join(' ')}</span>{/if}
	</span>
</button>
