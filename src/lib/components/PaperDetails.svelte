<!-- Editable paper details: title, authors, year, category, tags, links. -->
<script lang="ts">
	import { paperLinks } from '$lib/cite';
	import { library } from '$lib/library.svelte';
	import { addTag } from '$lib/paper-menu';
	import { platform } from '$lib/platform';
	import type { Paper, PaperPatch } from '$lib/types';
	import Tip from '$lib/ui/Tip.svelte';
	import { toast } from './Toasts.svelte';

	let { paper }: { paper: Paper } = $props();

	const save = (patch: PaperPatch) => library.update(paper.id, patch).catch((e) => toast(String(e), 'error'));
	const links = $derived(paperLinks(paper));
	const field = 'w-full rounded-md bg-transparent px-1 -mx-1 outline-none hover:bg-stone-200/50 focus:bg-white dark:hover:bg-stone-800/60 dark:focus:bg-stone-900';
	const label = 'mb-1.5 block text-[11px] font-medium tracking-wide text-stone-400 uppercase';
</script>

<div class="space-y-5 text-[13px]">
	<div>
		<textarea class="{field} field-sizing-content resize-none font-serif text-lg leading-snug" value={paper.title} aria-label="Title" onchange={(e) => save({ title: e.currentTarget.value.trim() })}></textarea>
		<!-- Wraps (papers can have 70+ authors), scrolls past a few lines. -->
		<textarea
			class="{field} field-sizing-content max-h-24 resize-none overflow-y-auto text-stone-600 dark:text-stone-400"
			value={paper.authors?.join(', ') ?? ''}
			placeholder="Authors"
			aria-label="Authors"
			onchange={(e) => save({ authors: e.currentTarget.value.split(',').map((a) => a.trim()).filter(Boolean) })}
		></textarea>
		<input class="{field} w-20 text-stone-600 dark:text-stone-400" value={paper.year ?? ''} placeholder="Year" aria-label="Year" inputmode="numeric" onchange={(e) => save({ year: Number(e.currentTarget.value) || null })} />
	</div>

	<div>
		<span class={label}>Category</span>
		<div class="flex flex-wrap gap-1">
			{#each library.categories as c (c.id)}
				{@const col = library.color({ category: c.id })}
				<button class="rounded-full px-2.5 py-0.5 text-xs text-stone-800 ring-stone-500 data-[active]:ring-1" style:background={col.light} data-active={paper.category === c.id || undefined} onclick={() => save({ category: paper.category === c.id ? null : c.id })}>{c.name}</button>
			{/each}
		</div>
	</div>

	<div>
		<span class={label}>Tags</span>
		<div class="flex flex-wrap items-center gap-1">
			{#each paper.tags ?? [] as tag (tag)}
				<span class="inline-flex items-center gap-0.5 rounded-full bg-stone-200 py-0.5 pr-1 pl-2 text-xs dark:bg-stone-800">
					#{tag}
					<button class="icon-[lucide--x] size-3 text-stone-400 hover:text-stone-700" aria-label="Remove tag {tag}" onclick={() => save({ tags: paper.tags!.filter((t) => t !== tag) })}></button>
				</span>
			{/each}
			<Tip label="Add a tag">
				{#snippet child({ props })}<button {...props} class="grid size-6 place-items-center rounded-full text-stone-400 hover:bg-stone-200 hover:text-stone-700 dark:hover:bg-stone-800" aria-label="Add tag" onclick={() => addTag(paper)}><span class="icon-[lucide--plus] size-3.5"></span></button>{/snippet}
			</Tip>
		</div>
	</div>

	{#if links.length}
		<div>
			<span class={label}>Links</span>
			<ul class="space-y-0.5">
				{#each links as l (l.url)}
					<li>
						<button class="-mx-1 flex w-full items-center gap-2 truncate rounded px-1 py-0.5 text-left hover:bg-stone-200/60 dark:hover:bg-stone-800/60" onclick={() => platform.openUrl(l.url)} title={l.url}>
							<span class="{l.icon} size-3.5 shrink-0 text-stone-500"></span><span class="truncate">{l.label}</span>
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
