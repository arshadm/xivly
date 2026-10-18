<!--
	Find a paper of the library (words in any order, in the title, authors, year or arXiv
	id): ↑ ↓ to choose, ↵ to pick. Papers in `exclude` aren't offered.
-->
<script lang="ts">
	import { library } from '#lib/library.svelte.js';
	import { refLabel, searchPapers } from '#lib/notes/paper-ref.js';
	import type { Paper } from '#lib/types.js';
	import Dialog from '#lib/ui/Dialog.svelte';

	let { open = $bindable(false), title, exclude, onpick }: { open?: boolean; title: string; exclude: ReadonlySet<string>; onpick: (p: Paper) => void } = $props();

	let query = $state('');
	let active = $state(0);
	const results = $derived(
		searchPapers(
			library.papers.filter((p) => !exclude.has(p.id)),
			query,
			new Set(),
			30
		)
	);

	$effect(() => {
		if (open) [query, active] = ['', 0];
	});

	function pick(p: Paper | undefined) {
		if (!p) return;
		open = false;
		onpick(p);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') active = Math.min(active + 1, results.length - 1);
		else if (e.key === 'ArrowUp') active = Math.max(active - 1, 0);
		else if (e.key === 'Enter') pick(results[active]);
		else return;
		e.preventDefault();
	}
</script>

<Dialog bind:open {title} class="w-[min(92vw,520px)]">
	<div class="flex min-h-0 flex-col gap-2 p-3">
		<!-- svelte-ignore a11y_autofocus -->
		<input
			class="w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-stone-700 dark:bg-stone-950"
			placeholder="Title, author, year or arXiv id"
			aria-label="Find a paper"
			autofocus
			bind:value={query}
			oninput={() => (active = 0)}
			{onkeydown}
		/>
		<ul class="max-h-96 min-h-0 overflow-y-auto" role="listbox" aria-label="Papers found">
			{#each results as p, i (p.id)}
				<li role="option" aria-selected={i === active}>
					<button class="flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-stone-100 data-[active]:bg-stone-200 dark:hover:bg-stone-800 dark:data-[active]:bg-stone-800" data-active={i === active || undefined} onclick={() => pick(p)} onmousemove={() => (active = i)}>
						<span class="truncate font-serif text-[14px]">{p.title}</span>
						<span class="truncate text-xs text-muted">{refLabel(p)}</span>
					</button>
				</li>
			{:else}
				<li class="px-2 py-3 text-sm text-muted">{library.papers.length ? 'No paper matches.' : 'The library has no papers yet.'}</li>
			{/each}
		</ul>
	</div>
</Dialog>
