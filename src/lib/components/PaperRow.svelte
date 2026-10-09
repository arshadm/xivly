<!--
	A paper as a row of the library's list view: read mark, category color,
	title and authors, category, year, tags, date added. Click opens; right-click
	for everything else (the same menu as the cards).
-->
<script lang="ts">
	import { library } from '#lib/library.svelte.js';
	import { paperMenu } from '#lib/paper-menu.js';
	import { theme } from '#lib/theme.svelte.js';
	import type { Paper } from '#lib/types.js';
	import { contextMenu } from '#lib/ui/context-menu.svelte.js';
	import Tip from '#lib/ui/Tip.svelte';
	import { openPaper } from '#lib/windows.js';
	import { paperInk } from 'svelte-pdf-mini';

	let { paper }: { paper: Paper } = $props();

	const color = $derived(library.color(paper));
	const category = $derived(library.category(paper.category));
	const authors = $derived(paper.authors?.length ? (paper.authors.length > 3 ? `${paper.authors.slice(0, 3).join(', ')} et al.` : paper.authors.join(', ')) : '');
	const added = $derived(paper.added ? new Date(paper.added).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
</script>

<div class="row group flex items-center gap-3 border-b border-stone-200/80 px-2 py-2 hover:bg-stone-100 dark:border-stone-800 dark:hover:bg-stone-900" data-read={paper.read ? '' : undefined}>
	<Tip label={paper.read ? 'Mark as unread' : 'Mark as read'}>
		{#snippet child({ props })}
			<button
				{...props}
				class="grid size-5 shrink-0 place-items-center rounded-full border border-stone-300 text-transparent hover:border-stone-500 aria-pressed:border-transparent aria-pressed:bg-stone-700 aria-pressed:text-white dark:border-stone-600 dark:aria-pressed:bg-stone-300 dark:aria-pressed:text-stone-900"
				aria-pressed={!!paper.read}
				aria-label={paper.read ? 'Read' : 'Mark as read'}
				onclick={() => library.toggleRead(paper)}
			>
				<span class="icon-[lucide--check] size-3"></span>
			</button>
		{/snippet}
	</Tip>
	<button class="flex min-w-0 flex-1 items-center gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-stone-500/60 rounded-sm" onclick={() => openPaper(paper.id, paper.title)} {@attach contextMenu(() => paperMenu(paper))}>
		<span class="h-8 w-1 shrink-0 rounded-full" style:background={paperInk(color, theme.dark)} aria-hidden="true"></span>
		<span class="min-w-0 flex-1">
			<span class="block truncate font-serif text-[15px] text-stone-900 dark:text-stone-100">{paper.title}</span>
			<span class="block truncate text-xs text-muted">{authors}</span>
		</span>
		<span class="hidden w-28 shrink-0 truncate text-xs text-muted lg:block">{category?.name ?? ''}</span>
		<span class="w-10 shrink-0 text-right text-xs text-muted tabular-nums">{paper.year ?? ''}</span>
		<span class="hidden w-44 shrink-0 truncate text-xs text-muted xl:block">{paper.tags?.map((t) => `#${t}`).join(' ') ?? ''}</span>
		<span class="hidden w-24 shrink-0 text-right text-xs text-muted tabular-nums md:block">{added}</span>
	</button>
</div>
