<!--
	Add to notebook…: link a paper to a notebook, from the paper's menu (library, reader).
	Notebooks used lately first, each with the folders it's in; the ones the paper is
	linked to are ticked, and picking one again unlinks it. New notebook… makes one (at
	the top level) and links the paper to it.
-->
<script module lang="ts">
	export const notebookPicker = $state({
		paper: null as { id: string; title: string } | null,
		show(paper: { id: string; title: string }) {
			this.paper = paper;
		}
	});
</script>

<script lang="ts">
	import { toast } from '#lib/components/Toasts.svelte';
	import { recentNotebooks, usedNotebook } from '#lib/session.js';
	import Dialog from '#lib/ui/Dialog.svelte';
	import { prompts } from '#lib/ui/prompt.svelte.js';
	import { notebooks } from './notebooks.svelte';
	import type { NotebookNode } from './tree';

	const fail = (e: unknown) => toast(String(e), 'error');
	const paper = $derived(notebookPicker.paper);

	let query = $state('');
	let active = $state(0);
	let recent = $state<string[]>([]);

	$effect(() => {
		if (!paper) return;
		[query, active, recent] = ['', 0, recentNotebooks()];
		// A reader window doesn't keep the notebooks: read them now.
		void notebooks.reload();
	});

	const where = (n: NotebookNode) => notebooks.path(n.id).map((f) => f.title).join(' / ');
	const choices = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const rank = (n: NotebookNode) => {
			const i = recent.indexOf(n.id);
			return i < 0 ? recent.length : i;
		};
		return notebooks.nodes
			.filter((n) => n.kind === 'notebook' && (!q || `${n.title} ${where(n)}`.toLowerCase().includes(q)))
			.toSorted((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
	});

	function close() {
		notebookPicker.paper = null;
	}

	async function pick(n: NotebookNode | undefined) {
		if (!paper || !n) return;
		const { id: paperId, title } = paper;
		const on = !n.papers.includes(paperId);
		close();
		try {
			await notebooks.link(n.id, paperId, on);
			if (on) usedNotebook(n.id);
			toast(on ? `Linked “${title}” to “${n.title}”` : `Unlinked “${title}” from “${n.title}”`);
		} catch (e) {
			fail(e);
		}
	}

	async function create() {
		if (!paper) return;
		const target = paper;
		close();
		const name = await prompts.ask('New notebook', { value: query.trim(), placeholder: 'e.g. Sparse attention', confirmLabel: 'Create and link' });
		if (!name?.trim()) return;
		try {
			const n = await notebooks.create('notebook', name);
			await notebooks.link(n.id, target.id);
			usedNotebook(n.id);
			toast(`Linked “${target.title}” to “${n.title}”`);
		} catch (e) {
			fail(e);
		}
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') active = Math.min(active + 1, choices.length);
		else if (e.key === 'ArrowUp') active = Math.max(active - 1, 0);
		else if (e.key === 'Enter') void (active === choices.length ? create() : pick(choices[active]));
		else return;
		e.preventDefault();
	}

	const row = 'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-stone-100 data-[active]:bg-stone-200 dark:hover:bg-stone-800 dark:data-[active]:bg-stone-800';
</script>

<Dialog open={!!paper} onOpenChange={(open) => !open && close()} title="Add to notebook" description={paper?.title} class="w-[min(92vw,460px)]">
	<div class="flex min-h-0 flex-col gap-2 p-3">
		<!-- svelte-ignore a11y_autofocus -->
		<input
			class="w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-stone-700 dark:bg-stone-950"
			placeholder="Find a notebook"
			aria-label="Find a notebook"
			autofocus
			bind:value={query}
			oninput={() => (active = 0)}
			{onkeydown}
		/>
		<ul class="max-h-80 min-h-0 overflow-y-auto" role="listbox" aria-label="Notebooks">
			{#each choices as n, i (n.id)}
				{@const linked = !!paper && n.papers.includes(paper.id)}
				<li role="option" aria-selected={i === active} aria-checked={linked}>
					<button class={row} data-active={i === active || undefined} onclick={() => pick(n)} onmousemove={() => (active = i)}>
						<span class="size-4 shrink-0 {linked ? 'icon-[lucide--check] text-emerald-600 dark:text-emerald-400' : 'icon-[lucide--notebook-text] text-stone-500'}"></span>
						<span class="min-w-0 flex-1 truncate">{n.title}</span>
						{#if where(n)}<span class="max-w-40 shrink-0 truncate text-xs text-muted">{where(n)}</span>{/if}
					</button>
				</li>
			{:else}
				{#if notebooks.loaded}<li class="px-2 py-2 text-sm text-muted">{query ? 'No notebook matches.' : 'No notebooks yet.'}</li>{/if}
			{/each}
			<li role="option" aria-selected={active === choices.length}>
				<button class="{row} border-t border-stone-200 dark:border-stone-800" data-active={active === choices.length || undefined} onclick={create} onmousemove={() => (active = choices.length)}>
					<span class="icon-[lucide--plus] size-4 shrink-0 text-stone-500"></span>
					<span class="flex-1">New notebook…</span>
				</button>
			</li>
		</ul>
	</div>
</Dialog>
