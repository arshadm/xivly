<!--
	The reading list: what you're reading now (papers you marked), and Up next, in
	the order you put them (drag a row, or right-click › Move to the top). Click
	opens; right-click for everything else.
-->
<script lang="ts">
	import { library } from '#lib/library.svelte.js';
	import { paperMenu } from '#lib/paper-menu.js';
	import { readingNow, upNext } from '#lib/reading.js';
	import { theme } from '#lib/theme.svelte.js';
	import type { Paper } from '#lib/types.js';
	import { iconButton, mutedIcon } from '#lib/ui/button.js';
	import { contextMenu } from '#lib/ui/context-menu.svelte.js';
	import Tip from '#lib/ui/Tip.svelte';
	import { openPaper } from '#lib/windows.js';
	import { paperInk } from 'svelte-pdf-mini';
	import { toast } from './Toasts.svelte';

	const now = $derived(readingNow(library.papers));
	const next = $derived(upNext(library.papers));

	const fail = (e: unknown) => toast(String(e), 'error');
	const byline = (p: Paper) => [p.authors?.length ? (p.authors.length > 2 ? `${p.authors[0]} et al.` : p.authors.join(', ')) : '', p.year].filter(Boolean).join(' · ');
	const where = (p: Paper) => (p.position && p.position >= 1.01 ? `p. ${Math.floor(p.position)}` : '');
	const opened = (p: Paper) => (p.opened ? new Date(p.opened).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');

	function start(p: Paper) {
		void library.setReading(p.id, true).catch(fail);
		void openPaper(p.id, p.title);
	}

	// ── Reordering Up next: drag a row onto another (it goes before it), or past the last ──
	let dragging = $state<string | null>(null);
	/** Where it would go: before the row at this index (next.length: at the end). */
	let over = $state<number | null>(null);
	function ondragover(e: DragEvent, i: number) {
		if (!dragging) return;
		e.preventDefault();
		const row = (e.currentTarget as HTMLElement).getBoundingClientRect();
		over = e.clientY > row.top + row.height / 2 ? i + 1 : i;
	}
	function ondrop(e: DragEvent) {
		if (!dragging) return;
		e.preventDefault();
		e.stopPropagation();
		const id = dragging;
		const from = next.findIndex((p) => p.id === id);
		// Counted without the row moved.
		const to = over === null ? from : over > from ? over - 1 : over;
		dragging = over = null;
		if (to !== from) void library.moveInQueue(id, to).catch(fail);
	}
	const iconBtn = iconButton(7, mutedIcon);
</script>

{#snippet row(p: Paper, actions: import('svelte').Snippet)}
	<span class="h-8 w-1 shrink-0 rounded-full" style:background={paperInk(library.color(p), theme.dark)} aria-hidden="true"></span>
	<button class="min-w-0 flex-1 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-stone-500/60" onclick={() => openPaper(p.id, p.title)} {@attach contextMenu(() => paperMenu(p))}>
		<span class="block truncate font-serif text-[15px] text-stone-900 dark:text-stone-100">{p.title}</span>
		<span class="block truncate text-xs text-muted">{byline(p)}</span>
	</button>
	{@render actions()}
{/snippet}

<main class="flex min-w-0 flex-1 flex-col">
	<header class="flex h-12 shrink-0 items-center gap-3 px-6" data-tauri-drag-region>
		<h1 class="font-serif text-xl" data-tauri-drag-region>Reading</h1>
	</header>
	<div class="min-h-0 flex-1 overflow-y-auto px-6 pt-2 pb-10">
		<section aria-labelledby="reading-now">
			<h2 id="reading-now" class="mb-1 flex items-baseline gap-2 text-xs font-medium tracking-wide text-muted uppercase">Reading now <span class="tabular-nums">{now.length || ''}</span></h2>
			{#if now.length}
				<ul aria-label="Reading now">
					{#each now as p (p.id)}
						<li class="group flex items-center gap-3 border-b border-stone-200/80 px-2 py-2 hover:bg-stone-100 dark:border-stone-800 dark:hover:bg-stone-900">
							{#snippet actions()}
								<span class="w-16 shrink-0 text-right text-xs text-muted tabular-nums">{where(p)}</span>
								<span class="hidden w-16 shrink-0 text-right text-xs text-muted tabular-nums md:block">{opened(p)}</span>
								<Tip label="Done: mark as read">
									{#snippet child({ props })}<button {...props} class={iconBtn} aria-label="Mark “{p.title}” as read" onclick={() => library.setRead(p.id, true).catch(fail)}><span class="icon-[lucide--circle-check] size-4"></span></button>{/snippet}
								</Tip>
								<Tip label="Stop reading (back to the library)">
									{#snippet child({ props })}<button {...props} class={iconBtn} aria-label="Stop reading “{p.title}”" onclick={() => library.setReading(p.id, false).catch(fail)}><span class="icon-[lucide--x] size-4"></span></button>{/snippet}
								</Tip>
							{/snippet}
							{@render row(p, actions)}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="py-3 text-sm text-muted">Nothing yet. Right-click a paper and choose <em>Mark as reading</em>.</p>
			{/if}
		</section>

		<section class="mt-8" aria-labelledby="up-next">
			<h2 id="up-next" class="mb-1 flex items-baseline gap-2 text-xs font-medium tracking-wide text-muted uppercase">Up next <span class="tabular-nums">{next.length || ''}</span></h2>
			{#if next.length}
				<ol aria-label="Up next" ondragleave={(e) => !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node) && (over = null)}>
					{#each next as p, i (p.id)}
						<li
							class="group relative flex items-center gap-3 border-b border-stone-200/80 px-2 py-2 hover:bg-stone-100 dark:border-stone-800 dark:hover:bg-stone-900"
							class:opacity-40={dragging === p.id}
							draggable="true"
							data-queue-item
							ondragstart={(e) => {
								dragging = p.id;
								e.dataTransfer?.setData('text/plain', p.title);
								if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
							}}
							ondragend={() => (dragging = over = null)}
							ondragover={(e) => ondragover(e, i)}
							{ondrop}
						>
							{#if dragging && over === i}<span class="absolute inset-x-0 -top-px h-0.5 bg-stone-500" aria-hidden="true"></span>{/if}
							{#if dragging && over === next.length && i === next.length - 1}<span class="absolute inset-x-0 -bottom-px h-0.5 bg-stone-500" aria-hidden="true"></span>{/if}
							<span class="icon-[lucide--grip-vertical] size-4 shrink-0 cursor-grab text-stone-400" aria-hidden="true"></span>
							<span class="w-5 shrink-0 text-right text-xs text-muted tabular-nums">{i + 1}</span>
							{#snippet actions()}
								<Tip label="Start reading">
									{#snippet child({ props })}<button {...props} class={iconBtn} aria-label="Start reading “{p.title}”" onclick={() => start(p)}><span class="icon-[lucide--book-open] size-4"></span></button>{/snippet}
								</Tip>
								<Tip label="Remove from Up next">
									{#snippet child({ props })}<button {...props} class={iconBtn} aria-label="Remove “{p.title}” from Up next" onclick={() => library.dequeue(p.id).catch(fail)}><span class="icon-[lucide--x] size-4"></span></button>{/snippet}
								</Tip>
							{/snippet}
							{@render row(p, actions)}
						</li>
					{/each}
				</ol>
			{:else}
				<p class="py-3 text-sm text-muted">Nothing queued. Right-click a paper and choose <em>Add to Up next</em>.</p>
			{/if}
		</section>
	</div>
</main>
