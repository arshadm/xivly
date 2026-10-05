<!-- Editable paper details: title, authors, year, category, tags, links. -->
<script lang="ts">
	import { iconButton, mutedIcon } from '$lib/ui/button';
	import { fileManager, trashName } from '$lib/os';
	import { paperLinks } from '$lib/cite';
	import { hfListUrl } from '$lib/huggingface';
	import { library } from '$lib/library.svelte';
	import { bibtex } from '$lib/cite';
	import { addTag, trashPaper } from '$lib/paper-menu';
	import { clipboard } from '$lib/ui/clipboard';
	import type { Snippet } from 'svelte';
	import { platform } from '$lib/platform';
	import type { Paper, PaperPatch } from '$lib/types';
	import Tip from '$lib/ui/Tip.svelte';
	import { toast } from './Toasts.svelte';

	/** `actions`: extra buttons for the action row (the reader adds its exports). */
	let { paper, actions }: { paper: Paper; actions?: Snippet<[{ btn: string }]> } = $props();

	const fail = (e: unknown) => toast(String(e), 'error');
	const copy = (text: string, what: string) => clipboard.write(text).then(() => toast(`${what} copied`), fail);
	const btn = iconButton(7, mutedIcon);

	const save = (patch: PaperPatch) => library.update(paper.id, patch).catch((e) => toast(String(e), 'error'));
	const links = $derived(paperLinks(paper));
	const field = 'w-full rounded-md bg-transparent px-1 -mx-1 outline-none hover:bg-stone-200/50 focus:bg-white dark:hover:bg-stone-800/60 dark:focus:bg-stone-900';
	const label = 'mb-1.5 block text-[11px] font-medium tracking-wide text-stone-400 uppercase';
</script>

<div class="flex min-h-full flex-col gap-5 text-[13px]">
	<div>
		<textarea class="{field} field-sizing-content resize-none font-serif text-lg leading-snug" value={paper.title} aria-label="Title" onchange={(e) => {
				const title = e.currentTarget.value.trim();
				if (title) save({ title });
				else e.currentTarget.value = paper.title; // a paper always has a title
			}}></textarea>
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
					<button class="grid size-4 place-items-center rounded-full text-stone-400 outline-none hover:text-stone-700 focus-visible:ring-2 focus-visible:ring-blue-500/60" aria-label="Remove tag {tag}" onclick={() => save({ tags: paper.tags!.filter((t) => t !== tag) })}><span class="icon-[lucide--x] size-3"></span></button>
				</span>
			{/each}
			<Tip label="Add a tag">
				{#snippet child({ props })}<button {...props} class="grid size-6 place-items-center rounded-full text-stone-400 hover:bg-stone-200 hover:text-stone-700 dark:hover:bg-stone-800" aria-label="Add tag" onclick={() => addTag(paper)}><span class="icon-[lucide--plus] size-3.5"></span></button>{/snippet}
			</Tip>
		</div>
	</div>

	{#if paper.hf?.page}
		{@const hf = paper.hf}
		<div>
			<span class={label}>Hugging Face</span>
			<ul class="space-y-0.5">
				<li>
					<button class="-mx-1 flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-stone-200/60 dark:hover:bg-stone-800/60" onclick={() => platform.openUrl(hf.page!)}>
						<span class="icon-[lucide--smile] size-3.5 shrink-0 text-stone-500"></span><span class="flex-1 truncate">Paper page</span>
						{#if hf.upvotes}<span class="flex items-center gap-0.5 text-xs text-stone-500 tabular-nums"><span class="icon-[lucide--triangle] size-2.5"></span>{hf.upvotes}</span>{/if}
					</button>
				</li>
				{#each [['models', 'Models', 'icon-[lucide--box]'], ['datasets', 'Datasets', 'icon-[lucide--database]'], ['spaces', 'Spaces', 'icon-[lucide--rocket]']] as const as [kind, name, icon] (kind)}
					{@const repos = hf[kind]}
					{#if repos && paper.arxiv}
						<li>
							<button class="-mx-1 flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-stone-200/60 dark:hover:bg-stone-800/60" onclick={() => platform.openUrl(hfListUrl(kind, paper.arxiv!))}>
								<span class="{icon} size-3.5 shrink-0 text-stone-500"></span><span class="flex-1 truncate">{name} citing this paper</span>
								<span class="text-xs text-stone-500 tabular-nums">{repos.total}</span>
							</button>
							<ul class="mb-1 ml-5.5">
								{#each repos.top as id (id)}
									<li>
										<button class="-mx-1 block w-full truncate rounded-md px-1 text-left text-xs text-stone-500 hover:bg-stone-200/60 hover:text-stone-800 dark:hover:bg-stone-800/60 dark:hover:text-stone-200" onclick={() => platform.openUrl(`https://huggingface.co/${kind === 'models' ? '' : `${kind}/`}${id}`)}>{id}</button>
									</li>
								{/each}
							</ul>
						</li>
					{/if}
				{/each}
			</ul>
		</div>
	{/if}

	{#if links.length}
		<div>
			<span class={label}>Links</span>
			<ul class="space-y-0.5">
				{#each links as l (l.url)}
					<li>
						<button class="-mx-1 flex w-full items-center gap-2 truncate rounded-md px-1 py-0.5 text-left hover:bg-stone-200/60 dark:hover:bg-stone-800/60" onclick={() => platform.openUrl(l.url)} title={l.url}>
							<span class="{l.icon} size-3.5 shrink-0 text-stone-500"></span><span class="truncate">{l.label}</span>
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<!-- Actions: one row of icons pinned to the bottom (tooltips say what they do). A container
	     with padding sets --details-pad (and --details-bg) so the bar spans it edge to edge. -->
	<div class="sticky bottom-[calc(-1*var(--details-pad,0px))] -mx-(--details-pad) mt-auto -mb-(--details-pad) flex flex-wrap items-center gap-0.5 border-t border-stone-200 bg-(--details-bg,var(--color-stone-50)) px-(--details-pad) py-2 dark:border-stone-800 dark:bg-(--details-bg-dark,var(--color-stone-900))">
		{#snippet action(label: string, icon: string, run: () => unknown, danger = false)}
			<Tip {label}>
				{#snippet child({ props })}<button {...props} class="{btn} {danger ? 'text-red-500! hover:bg-red-50! hover:text-red-600! dark:text-red-400! dark:hover:bg-red-950/50!' : ''}" aria-label={label} onclick={run}><span class="{icon} size-4"></span></button>{/snippet}
			</Tip>
		{/snippet}
		{@render action('Copy BibTeX', 'icon-[lucide--quote]', () => copy(bibtex(paper), 'BibTeX'))}
		{@render actions?.({ btn })}
		{#if platform.reveal}{@render action(`Show in ${fileManager}`, 'icon-[lucide--folder-search]', () => platform.reveal?.(`papers/${paper.id}/paper.pdf`))}{/if}
		{@render action('Refresh metadata (PDF and Hugging Face)', 'icon-[lucide--refresh-cw]', () => library.refreshMetadata(paper.id).then(() => toast('Metadata updated'), fail))}
		<span class="flex-1" aria-hidden="true"></span>
		{@render action(`Move to ${trashName}`, 'icon-[lucide--trash-2]', () => trashPaper(paper), true)}
	</div>
</div>
