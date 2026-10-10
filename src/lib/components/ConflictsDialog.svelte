<!--
	Sync conflicts: the copies a sync client left when two devices changed a file
	before either change synced. Each can be merged into its file (notes, details,
	categories…: what either kept is kept), used in its place, or discarded.
-->
<script lang="ts" module>
	export const conflictsDialog = $state({ open: false, paperId: null as string | null });
	/** Open on every conflict, or on one paper's. */
	export const showConflicts = (paperId: string | null = null) => Object.assign(conflictsDialog, { open: true, paperId });
</script>

<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { conflictKind, type Conflict } from '#lib/conflicts.js';
	import { library } from '#lib/library.svelte.js';
	import { button } from '#lib/ui/button.js';
	import UiDialog from '#lib/ui/Dialog.svelte';
	import { prompts } from '#lib/ui/prompt.svelte.js';
	import { toast } from './Toasts.svelte';

	const shown = $derived(conflictsDialog.paperId ? library.conflicts.filter((c) => c.paperId === conflictsDialog.paperId) : library.conflicts);
	let busy = $state<string | null>(null);

	// Nothing left to resolve: closed.
	$effect(() => {
		if (conflictsDialog.open && !shown.length && !busy) conflictsDialog.open = false;
	});

	function what(c: Conflict) {
		const file = c.original.split('/').pop()!;
		if (c.original.includes('/chats/')) return 'A chat';
		if (c.original.startsWith('.xivly/feed/')) return 'The arXiv feed';
		return (
			{
				'paper.json': 'Details (title, tags, bookmarks…)',
				'notes.json': 'Notes',
				'notes.md': 'Notes as Markdown (made from the notes)',
				'paper.pdf': 'The PDF and its annotations',
				'library.json': 'Categories and tags',
				'prompts.json': 'Saved prompts'
			}[file] ?? file
		);
	}
	const where = (c: Conflict) => (c.paperId ? (library.get(c.paperId)?.title ?? c.paperId) : 'The library');

	async function resolve(c: Conflict, action: 'merge' | 'use' | 'discard') {
		if (action !== 'merge') {
			const ok = await prompts.confirm(action === 'use' ? 'Use the other copy?' : 'Discard the other copy?', {
				message: action === 'use' ? `${what(c)} of “${where(c)}” will be the other copy’s; this one goes to the trash.` : `The other copy of ${what(c).toLowerCase()} goes to the trash; this one stays as it is.`,
				confirmLabel: action === 'use' ? 'Use it' : 'Discard',
				danger: true
			});
			if (!ok) return;
		}
		busy = c.path;
		try {
			await library.resolveConflict(c, action);
		} catch (e) {
			toast(`Couldn’t resolve it: ${e instanceof Error ? e.message : String(e)}`, 'error');
		} finally {
			busy = null;
		}
	}
</script>

<UiDialog bind:open={conflictsDialog.open} bare class="w-[min(560px,94vw)] p-5">
	<Dialog.Title class="font-serif text-lg">Sync conflicts</Dialog.Title>
	<Dialog.Description class="mt-1 text-sm text-muted">Two devices changed these files before either change synced, so a copy of the other version was kept next to each. Merge them to keep what either has, or pick one.</Dialog.Description>
	<ul class="mt-4 max-h-[60vh] space-y-2 overflow-y-auto">
		{#each shown as c (c.path)}
			{@const kind = conflictKind(c)}
			<li class="rounded-lg border border-stone-200 p-3 dark:border-stone-800" aria-busy={busy === c.path}>
				<p class="truncate text-sm font-medium text-stone-800 dark:text-stone-100">{where(c)}</p>
				<p class="text-xs text-muted">{what(c)} · <span class="font-mono">{c.path.split('/').pop()}</span></p>
				<div class="mt-2 flex flex-wrap gap-2">
					{#if kind === 'notes' || kind === 'json'}<button class={button('primary')} disabled={!!busy} onclick={() => resolve(c, 'merge')}>Merge</button>{/if}
					{#if kind !== 'derived'}<button class={button('secondary')} disabled={!!busy} onclick={() => resolve(c, 'use')}>Use the other copy</button>{/if}
					<button class={button(kind === 'derived' ? 'primary' : 'secondary')} disabled={!!busy} onclick={() => resolve(c, 'discard')}>{kind === 'derived' ? 'Remove the copy' : 'Keep this one'}</button>
				</div>
			</li>
		{/each}
	</ul>
</UiDialog>
