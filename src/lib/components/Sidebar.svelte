<script lang="ts">
	import { paperColors } from 'svelte-pdf-mini';
	import { library, type View } from '$lib/library.svelte';
	import { platform } from '$lib/platform';
	import { keys } from '$lib/shortcuts';
	import type { ColorName } from '$lib/types';
	import Tip from '$lib/ui/Tip.svelte';
	import { contextMenu, type MenuItem } from '$lib/ui/context-menu.svelte';
	import { prompts } from '$lib/ui/prompt.svelte';
	import { settingsDialog } from './SettingsDialog.svelte';
	import { toast } from './Toasts.svelte';

	let { onNewCategory }: { onNewCategory: () => void } = $props();

	const accent = (c: string) => paperColors.find((p) => p.name === c)?.accent;
	const count = (pred: (p: (typeof library.papers)[number]) => boolean) => library.papers.filter(pred).length;
	const isView = (v: View) => JSON.stringify(v) === JSON.stringify(library.view);
	const fail = (e: unknown) => toast(String(e), 'error');

	function categoryMenu(id: string): MenuItem[] {
		const c = library.category(id)!;
		return [
			{
				label: 'Rename…',
				icon: 'icon-[lucide--pencil]',
				onSelect: async () => {
					const name = await prompts.ask('Rename category', { value: c.name, confirmLabel: 'Rename' });
					if (name) await library.editCategory(id, { name }).catch(fail);
				}
			},
			{
				label: 'Colour',
				icon: 'icon-[lucide--palette]',
				items: paperColors.map((p) => ({ label: p.name[0].toUpperCase() + p.name.slice(1), color: p.accent, checked: c.color === p.name, onSelect: () => library.editCategory(id, { color: p.name as ColorName }).catch(fail) }))
			},
			{
				label: 'Delete…',
				icon: 'icon-[lucide--trash-2]',
				danger: true,
				separatorBefore: true,
				onSelect: async () => {
					const n = count((p) => p.category === id);
					const ok = await prompts.confirm(`Delete “${c.name}”?`, { message: n ? `Its ${n} paper${n > 1 ? 's' : ''} stay in the library, uncategorized.` : undefined, confirmLabel: 'Delete', danger: true });
					if (ok) await library.removeCategory(id).catch(fail);
				}
			}
		];
	}

	function tagMenu(tag: string): MenuItem[] {
		return [
			{ label: library.tags.includes(tag) ? 'Stop filtering' : 'Filter by tag', icon: 'icon-[lucide--filter]', onSelect: () => library.toggleTag(tag) },
			{
				label: 'Remove from all papers…',
				icon: 'icon-[lucide--trash-2]',
				danger: true,
				separatorBefore: true,
				onSelect: async () => {
					const papers = library.papers.filter((p) => p.tags?.includes(tag));
					if (!(await prompts.confirm(`Remove #${tag} from ${papers.length} paper${papers.length > 1 ? 's' : ''}?`, { confirmLabel: 'Remove', danger: true }))) return;
					for (const p of papers) await library.update(p.id, { tags: p.tags!.filter((t) => t !== tag) }).catch(fail);
					if (library.tags.includes(tag)) library.toggleTag(tag);
				}
			}
		];
	}

	const item = 'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] hover:bg-stone-200/60 data-[active]:bg-stone-200 dark:hover:bg-stone-800/60 dark:data-[active]:bg-stone-800';
	const iconBtn = 'grid size-6 place-items-center rounded-md text-stone-500 hover:bg-stone-200 hover:text-stone-800 dark:hover:bg-stone-800 dark:hover:text-stone-200';
</script>

<aside class="flex h-full w-56 shrink-0 flex-col border-r border-stone-200 bg-stone-100/70 dark:border-stone-800 dark:bg-stone-900/70">
	<!-- Room for the traffic lights (overlay title bar). -->
	<div class="h-12 shrink-0" data-tauri-drag-region></div>

	<nav class="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
		<button class={item} data-active={isView({ kind: 'all' }) || undefined} onclick={() => (library.view = { kind: 'all' })}>
			<span class="icon-[lucide--library] size-4 text-stone-500"></span><span class="flex-1">All papers</span>
			<span class="text-xs text-stone-400 tabular-nums">{library.papers.length}</span>
		</button>
		<button class={item} data-active={isView({ kind: 'recent' }) || undefined} onclick={() => (library.view = { kind: 'recent' })}>
			<span class="icon-[lucide--clock] size-4 text-stone-500"></span><span class="flex-1">Recent</span>
		</button>
		<button class={item} data-active={isView({ kind: 'uncategorized' }) || undefined} onclick={() => (library.view = { kind: 'uncategorized' })}>
			<span class="icon-[lucide--inbox] size-4 text-stone-500"></span><span class="flex-1">Uncategorized</span>
			<span class="text-xs text-stone-400 tabular-nums">{count((p) => !library.category(p.category))}</span>
		</button>

		<div class="mt-5 mb-1 flex items-center justify-between px-2 text-[11px] font-medium tracking-wide text-stone-400 uppercase">
			Categories
			<Tip label="New category">
				{#snippet child({ props })}<button {...props} class="icon-[lucide--plus] size-3.5 hover:text-stone-700" aria-label="New category" onclick={onNewCategory}></button>{/snippet}
			</Tip>
		</div>
		{#each library.categories as c (c.id)}
			<button class={item} data-active={isView({ kind: 'category', id: c.id }) || undefined} onclick={() => (library.view = { kind: 'category', id: c.id })} {@attach contextMenu(() => categoryMenu(c.id))}>
				<span class="size-2.5 rounded-full" style:background={accent(c.color)}></span>
				<span class="flex-1 truncate">{c.name}</span>
				<span class="text-xs text-stone-400 tabular-nums">{count((p) => p.category === c.id)}</span>
			</button>
		{/each}

		{#if library.allTags.length}
			<div class="mt-5 mb-1 px-2 text-[11px] font-medium tracking-wide text-stone-400 uppercase">Tags</div>
			<div class="flex flex-wrap gap-1 px-2">
				{#each library.allTags as tag (tag)}
					<button
						class="rounded-full border border-stone-300 px-2 py-0.5 text-xs text-stone-600 data-[active]:border-stone-700 data-[active]:bg-stone-700 data-[active]:text-white dark:border-stone-700 dark:text-stone-400 dark:data-[active]:bg-stone-200 dark:data-[active]:text-stone-900"
						data-active={library.tags.includes(tag) || undefined}
						onclick={() => library.toggleTag(tag)}
						{@attach contextMenu(() => tagMenu(tag))}>#{tag}</button
					>
				{/each}
			</div>
		{/if}
	</nav>

	<div class="flex items-center gap-1 border-t border-stone-200 px-2 py-2 text-xs text-stone-500 dark:border-stone-800">
		<Tip label={platform.reveal ? 'Show in Finder' : library.name} side="top">
			{#snippet child({ props })}
				<button {...props} class="flex min-w-0 flex-1 items-center gap-1 truncate rounded px-1 py-0.5 text-left enabled:hover:text-stone-800 dark:enabled:hover:text-stone-200" disabled={!platform.reveal} onclick={() => platform.reveal?.('.')}>
					<span class="icon-[lucide--folder] size-3.5 shrink-0"></span><span class="truncate">{library.name}</span>
				</button>
			{/snippet}
		</Tip>
		<Tip label="Settings" shortcut={keys.settings} side="top">
			{#snippet child({ props })}<button {...props} class={iconBtn} aria-label="Settings" onclick={() => (settingsDialog.open = true)}><span class="icon-[lucide--settings] size-3.5"></span></button>{/snippet}
		</Tip>
	</div>
</aside>
