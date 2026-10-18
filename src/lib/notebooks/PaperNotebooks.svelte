<!--
	A paper's notebooks, in its reader's side panel: the ones that link it, by hand or
	with chips in their text (how many). Click to open one; Add to notebook… links it to
	another. Read again when a notebook changes (here, in another window, or on disk).
-->
<script lang="ts">
	import { onBroadcast } from '#lib/broadcast.js';
	import { onDiskChange, touchesNotebooks } from '#lib/disk-changes.js';
	import type { Paper } from '#lib/types.js';
	import { button } from '#lib/ui/button.js';
	import { openNotebook } from '#lib/windows.js';
	import { notebooks } from './notebooks.svelte';
	import { notebookPicker } from './NotebookPicker.svelte';

	/** `active`: the tab is shown (it stays mounted while hidden). */
	let { paper, active }: { paper: Paper; active: boolean } = $props();

	// A reader window doesn't read the notebooks otherwise (their texts are read again as they change: +layout.svelte).
	$effect(() => {
		if (!active) return;
		void notebooks.loadTexts(0);
		void notebooks.reload();
	});
	const changed = () => active && void notebooks.reload();
	$effect(() => onDiskChange((paths) => paths.some(touchesNotebooks) && changed()));
	$effect(() => onBroadcast('notebook-changed', changed));
	$effect(() => onBroadcast('notebook-removed', changed));
	const onfocus = changed;

	const list = $derived(notebooks.linking(paper.id));
	const where = (id: string) => notebooks.path(id).map((f) => f.title).join(' › ');
	const how = (l: { byHand: boolean; mentions: number }) => [l.mentions ? `mentioned ${l.mentions}×` : '', l.byHand ? 'linked' : ''].filter(Boolean).join(' · ');
</script>

<svelte:window {onfocus} />

<p class="px-2 pt-1 pb-2 text-[11px] font-medium tracking-wide text-muted uppercase">Notebooks</p>
{#if !notebooks.loaded}
	<p class="p-2 text-muted">Reading the notebooks…</p>
{:else if list.length}
	<ul class="space-y-0.5" aria-label="Notebooks with this paper">
		{#each list as l (l.node.id)}
			{@const folders = where(l.node.id)}
			<li>
				<button class="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-stone-200/70 dark:hover:bg-stone-800" onclick={() => void openNotebook(l.node.id, l.node.title)}>
					<span class="icon-[lucide--notebook-text] mt-0.5 size-4 shrink-0 text-stone-500"></span>
					<span class="min-w-0 flex-1">
						<span class="block truncate font-medium">{l.node.title}</span>
						<span class="block truncate text-xs text-muted">{[folders, how(l)].filter(Boolean).join(' · ')}</span>
					</span>
				</button>
			</li>
		{/each}
	</ul>
{:else}
	<p class="p-2 text-muted">Not in a notebook yet.</p>
{/if}
<div class="px-2 pt-3">
	<button class={button('secondary')} onclick={() => notebookPicker.show(paper)}><span class="icon-[lucide--notebook-pen] size-4"></span>Add to notebook…</button>
</div>
