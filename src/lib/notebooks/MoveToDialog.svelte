<!--
	Move to…: the folders an item may go into (not itself, nor one inside it), indented
	as in the tree, plus the top level. Filter as you type; ↑ ↓ to choose, ↵ to move.
-->
<script lang="ts">
	import Dialog from '#lib/ui/Dialog.svelte';
	import { notebooks } from './notebooks.svelte';
	import { canMove, type NotebookNode } from './tree';

	let { item, onclose, onmove }: { item: NotebookNode | null; onclose: () => void; onmove: (parent: string | undefined) => void } = $props();

	let query = $state('');
	let active = $state(0);

	interface Target {
		id: string | undefined;
		title: string;
		depth: number;
	}

	function folders(parent: string | undefined, depth: number): Target[] {
		return notebooks.children(parent).flatMap((n) => (n.kind === 'folder' ? [{ id: n.id, title: n.title, depth }, ...folders(n.id, depth + 1)] : []));
	}

	const targets = $derived.by(() => {
		if (!item) return [];
		const all = [{ id: undefined, title: 'Top level', depth: 0 }, ...folders(undefined, 1)].filter((t) => canMove(notebooks.nodes, item.id, t.id));
		const q = query.trim().toLowerCase();
		return q ? all.filter((t) => t.title.toLowerCase().includes(q)).map((t) => ({ ...t, depth: 0 })) : all;
	});
	const current = $derived(item && notebooks.parentOf(item.id));

	$effect(() => {
		if (item) [query, active] = ['', 0];
	});

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') active = Math.min(active + 1, targets.length - 1);
		else if (e.key === 'ArrowUp') active = Math.max(active - 1, 0);
		else if (e.key === 'Enter' && targets[active]) onmove(targets[active].id);
		else return;
		e.preventDefault();
	}
</script>

<Dialog open={!!item} onOpenChange={(open) => !open && onclose()} title="Move “{item?.title ?? ''}” to…" class="w-[min(92vw,420px)]">
	<div class="flex min-h-0 flex-col gap-2 p-3">
		<!-- svelte-ignore a11y_autofocus -->
		<input
			class="w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-stone-700 dark:bg-stone-950"
			placeholder="Find a folder"
			aria-label="Find a folder"
			autofocus
			bind:value={query}
			oninput={() => (active = 0)}
			{onkeydown}
		/>
		<ul class="max-h-80 min-h-0 overflow-y-auto" role="listbox" aria-label="Folders">
			{#each targets as t, i (t.id ?? '')}
				<li role="option" aria-selected={i === active}>
					<button
						class="flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-[13px] hover:bg-stone-100 data-[active]:bg-stone-200 dark:hover:bg-stone-800 dark:data-[active]:bg-stone-800"
						style:padding-left="{t.depth * 14 + 8}px"
						data-active={i === active || undefined}
						onclick={() => onmove(t.id)}
						onmousemove={() => (active = i)}
					>
						<span class="size-4 shrink-0 text-stone-500 {t.id ? 'icon-[lucide--folder]' : 'icon-[lucide--list-tree]'}"></span>
						<span class="min-w-0 flex-1 truncate">{t.title}</span>
						{#if t.id === current}<span class="text-xs text-muted">current</span>{/if}
					</button>
				</li>
			{:else}
				<li class="px-2 py-3 text-sm text-muted">No folder matches.</li>
			{/each}
		</ul>
	</div>
</Dialog>
