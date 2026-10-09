<!--
	A paper of the arXiv feed: its priority and why, what it is, links to arXiv,
	and its abstract on demand. `actions` (add, dismiss…) sit on the right.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { platform } from '#lib/platform/index.js';
	import type { FeedPaper } from '#lib/types.js';

	let { paper, actions }: { paper: FeedPaper; actions?: Snippet } = $props();
	let open = $state(false);
	const authors = $derived(paper.authors.length > 6 ? `${paper.authors.slice(0, 6).join(', ')} +${paper.authors.length - 6}` : paper.authors.join(', '));
	const link = 'text-sky-700 hover:underline dark:text-sky-400';
</script>

<article class="feed-card rounded-lg border border-l-4 border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-900" data-priority={paper.priority ?? 0} aria-label={paper.title}>
	<div class="flex items-start gap-3">
		<span class="feed-priority mt-0.5 w-6 shrink-0 text-xs font-bold tracking-wide tabular-nums" title={paper.priority ? `Priority ${paper.priority}` : 'Not scored yet'}>{paper.priority ? `P${paper.priority}` : '—'}</span>
		<div class="min-w-0 flex-1">
			<h3 class="font-serif text-[15px] leading-snug text-stone-900 dark:text-stone-100">{paper.title}</h3>
			{#if paper.rationale}<p class="mt-1 text-[13px] leading-snug text-stone-700 dark:text-stone-300">{paper.rationale}</p>{/if}
			<p class="mt-1.5 text-xs text-muted">
				<span class="tabular-nums">{paper.id}</span>
				{#if paper.topics.length}· {paper.topics.join(', ')}{/if}
				{#if paper.categories.length}· {paper.categories.join(', ')}{/if}
			</p>
			{#if authors}<p class="line-clamp-1 text-xs text-muted" title={paper.authors.join(', ')}>{authors}</p>{/if}
			<div class="mt-2 flex flex-wrap items-center gap-4 text-xs">
				<button class={link} onclick={() => platform.openUrl(`https://arxiv.org/abs/${paper.id}`)}>arXiv</button>
				<button class={link} onclick={() => platform.openUrl(`https://arxiv.org/pdf/${paper.id}`)}>PDF</button>
				<button class="text-muted hover:text-stone-900 dark:hover:text-stone-100" aria-expanded={open} onclick={() => (open = !open)}>{open ? 'Hide abstract' : 'Abstract'}</button>
			</div>
			{#if open}<p class="mt-2 border-t border-stone-200 pt-2 text-[13px] leading-relaxed text-stone-700 dark:border-stone-800 dark:text-stone-300">{paper.abstract}</p>{/if}
		</div>
		{#if actions}<div class="flex shrink-0 items-center gap-1">{@render actions()}</div>{/if}
	</div>
</article>

<style>
	/* Priority colors (as arxiv_fetch's browser): the left edge and the badge. */
	.feed-card {
		--p: #8b93a1;
		border-left-color: var(--p);
	}
	.feed-priority {
		color: var(--p);
	}
	.feed-card[data-priority='1'] {
		--p: #c0392b;
	}
	.feed-card[data-priority='2'] {
		--p: #c9720b;
	}
	.feed-card[data-priority='3'] {
		--p: #0f7b6c;
	}
	.feed-card[data-priority='4'] {
		--p: #5a6472;
	}
	:global(.dark) .feed-card[data-priority='1'] {
		--p: #f0736a;
	}
	:global(.dark) .feed-card[data-priority='2'] {
		--p: #e5a13f;
	}
	:global(.dark) .feed-card[data-priority='3'] {
		--p: #3ec2a8;
	}
	:global(.dark) .feed-card[data-priority='4'] {
		--p: #93a0b0;
	}
</style>
