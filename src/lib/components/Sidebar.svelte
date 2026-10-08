<script lang="ts">
	import { iconButton, mutedIcon } from '#lib/ui/button.js';
	import { paperColors } from 'svelte-pdf-mini';
	import { ARCHIVED, categoryColor, library, type View } from '#lib/library.svelte.js';
	import { platform } from '#lib/platform/index.js';
	import { keys } from '#lib/shortcuts.js';
	import { fileManager } from '#lib/os.js';
	import type { CategoryColor, ColorName } from '#lib/types.js';
	import Tip from '#lib/ui/Tip.svelte';
	import { contextMenu, type MenuItem } from '#lib/ui/context-menu.svelte.js';
	import { prompts } from '#lib/ui/prompt.svelte.js';
	import { showCategoryDialog } from './CategoryDialog.svelte';
	import { settingsDialog } from './SettingsDialog.svelte';
	import { toast } from './Toasts.svelte';

	let { onNewCategory }: { onNewCategory: () => void } = $props();

	const accent = (c: CategoryColor) => categoryColor(c).accent;
	// Counts match the grid: archived papers don't count while they're hidden (the default).
	const counted = $derived(library.tagFilter[ARCHIVED] === 'out' ? library.papers.filter((p) => !p.tags?.includes(ARCHIVED)) : library.papers);
	const count = (pred: (p: (typeof library.papers)[number]) => boolean) => counted.filter(pred).length;
	const isView = (v: View) => JSON.stringify(v) === JSON.stringify(library.view);
	const fail = (e: unknown) => toast(String(e), 'error');

	function categoryMenu(id: string): MenuItem[] {
		const c = library.category(id)!;
		return [
			{ label: 'Edit…', icon: 'icon-[lucide--pencil]', onSelect: () => showCategoryDialog(id) },
			{
				label: 'Color',
				icon: 'icon-[lucide--palette]',
				items: [
					...paperColors.map((p) => ({ label: p.name[0].toUpperCase() + p.name.slice(1), color: p.accent, checked: c.color === p.name, onSelect: () => library.editCategory(id, { color: p.name as ColorName }).catch(fail) })),
					{ label: 'Custom…', icon: 'icon-[lucide--pipette]', checked: c.color.startsWith('#'), separatorBefore: true, onSelect: () => showCategoryDialog(id) }
				]
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
			{ label: `Only #${tag}`, icon: 'icon-[lucide--filter]', checked: library.tagFilter[tag] === 'in', onSelect: () => library.setTagFilter(tag, 'in') },
			{ label: `Hide #${tag}`, icon: 'icon-[lucide--eye-off]', checked: library.tagFilter[tag] === 'out', onSelect: () => library.setTagFilter(tag, 'out') },
			{ label: 'Don’t filter', icon: 'icon-[lucide--filter-x]', disabled: !library.tagFilter[tag], onSelect: () => library.setTagFilter(tag, null) },
			{
				label: 'Remove from all papers…',
				icon: 'icon-[lucide--trash-2]',
				danger: true,
				separatorBefore: true,
				onSelect: async () => {
					const papers = library.papers.filter((p) => p.tags?.includes(tag));
					if (!(await prompts.confirm(`Remove #${tag} from ${papers.length} paper${papers.length > 1 ? 's' : ''}?`, { confirmLabel: 'Remove', danger: true }))) return;
					await library.removeTag(tag).catch(fail);
				}
			}
		];
	}

	/** What a tag chip does now, and what a click does next (none → only these → hide these → none): the chip's accessible name. */
	function tagLabel(tag: string, mode: 'in' | 'out' | undefined) {
		const papers = tag === ARCHIVED ? 'archived papers' : `papers tagged #${tag}`;
		if (mode === 'in') return `Showing only ${papers}. Click to hide them`;
		if (mode === 'out') return `Hiding ${papers}. Click to show them too`;
		return `Click to show only ${papers}`;
	}

	// Many tags: the most used ones, then a More chip. A tag being filtered on always shows.
	const TAGS_SHOWN = 16;
	let allTagsShown = $state(false);
	const tags = $derived(library.allTags.filter((t) => t !== ARCHIVED));
	const shownTags = $derived(allTagsShown || tags.length <= TAGS_SHOWN + 2 ? tags : tags.filter((t, i) => i < TAGS_SHOWN || library.tagFilter[t]));

	const item = 'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] hover:bg-stone-200/60 data-[active]:bg-stone-200 dark:hover:bg-stone-800/60 dark:data-[active]:bg-stone-800';
	const iconBtn = iconButton(6, mutedIcon);
</script>

<aside class="flex h-full w-56 shrink-0 flex-col border-r border-stone-200 bg-stone-100/70 dark:border-stone-800 dark:bg-stone-900/70">
	<!-- Room for the traffic lights (macOS overlay title bar). -->
	<div class="h-3 shrink-0 lights:h-12" data-tauri-drag-region></div>

	<nav class="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
		<button class={item} data-active={isView({ kind: 'all' }) || undefined} aria-current={isView({ kind: 'all' }) ? 'page' : undefined} onclick={() => (library.view = { kind: 'all' })}>
			<span class="icon-[lucide--library] size-4 text-stone-500"></span><span class="flex-1">All papers</span>
			<span class="text-xs text-muted tabular-nums">{counted.length}</span>
		</button>
		<button class={item} data-active={isView({ kind: 'recent' }) || undefined} aria-current={isView({ kind: 'recent' }) ? 'page' : undefined} onclick={() => (library.view = isView({ kind: 'recent' }) ? { kind: 'all' } : { kind: 'recent' })}>
			<span class="icon-[lucide--clock] size-4 text-stone-500"></span><span class="flex-1">Recent</span>
		</button>
		<button class={item} data-active={isView({ kind: 'uncategorized' }) || undefined} aria-current={isView({ kind: 'uncategorized' }) ? 'page' : undefined} onclick={() => (library.view = isView({ kind: 'uncategorized' }) ? { kind: 'all' } : { kind: 'uncategorized' })}>
			<span class="icon-[lucide--inbox] size-4 text-stone-500"></span><span class="flex-1">Uncategorized</span>
			<span class="text-xs text-muted tabular-nums">{count((p) => !library.category(p.category))}</span>
		</button>

		<div class="mt-5 mb-1 flex items-center justify-between px-2 text-[11px] font-medium tracking-wide text-muted uppercase">
			Categories
			<Tip label="New category">
				{#snippet child({ props })}<button {...props} class={iconButton(6, `${mutedIcon} -m-1 hover:bg-transparent`)} aria-label="New category" onclick={onNewCategory}><span class="icon-[lucide--plus] size-3.5"></span></button>{/snippet}
			</Tip>
		</div>
		{#each library.categories as c (c.id)}
			<button class={item} data-active={isView({ kind: 'category', id: c.id }) || undefined} aria-current={isView({ kind: 'category', id: c.id }) ? 'page' : undefined} onclick={() => (library.view = isView({ kind: 'category', id: c.id }) ? { kind: 'all' } : { kind: 'category', id: c.id })} {@attach contextMenu(() => categoryMenu(c.id))}>
				<span class="swatch size-2.5 rounded-full" style:--swatch={accent(c.color)}></span>
				<span class="flex-1 truncate">{c.name}</span>
				<span class="text-xs text-muted tabular-nums">{count((p) => p.category === c.id)}</span>
			</button>
		{/each}

		<div class="mt-5 mb-1 px-2 text-[11px] font-medium tracking-wide text-muted uppercase">Tags</div>
		<!-- Click: only papers with the tag (filled, ✓); again: hide them (dashed, eye off); again: no filter. -->
		<div class="flex flex-wrap gap-1 px-2">
			{#each [...shownTags, ARCHIVED] as tag (tag)}
				{@const mode = library.tagFilter[tag]}
				<button
					class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400
						data-[mode=in]:border-stone-700 data-[mode=in]:bg-stone-700 data-[mode=in]:text-white data-[mode=in]:hover:bg-stone-600
						data-[mode=out]:border-dashed data-[mode=out]:border-stone-400 data-[mode=out]:text-muted data-[mode=out]:hover:bg-stone-200/70
						dark:data-[mode=in]:border-stone-200 dark:data-[mode=in]:bg-stone-200 dark:data-[mode=in]:text-stone-900 dark:data-[mode=in]:hover:bg-stone-300
						dark:data-[mode=out]:border-stone-600 dark:data-[mode=out]:hover:bg-stone-800
						{mode ? '' : 'border-stone-300 text-stone-600 hover:border-stone-400 hover:bg-stone-200/70 hover:text-stone-800 dark:border-stone-700 dark:text-stone-400 dark:hover:border-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-200'}"
					data-mode={mode}
					aria-label={tagLabel(tag, mode)}
					onclick={() => library.cycleTag(tag)}
					{@attach contextMenu(() => tagMenu(tag))}
				>
					{#if tag === ARCHIVED}<span class="icon-[lucide--archive] size-3"></span>{tag}{:else}#{tag}{/if}
					{#if mode === 'in'}<span class="icon-[lucide--check] size-3"></span>{:else if mode === 'out'}<span class="icon-[lucide--eye-off] size-3"></span>{/if}
				</button>
			{/each}
			{#if tags.length > TAGS_SHOWN + 2}
				<button
					class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-muted outline-none hover:bg-stone-200/70 hover:text-stone-800 focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-stone-800 dark:hover:text-stone-200 dark:focus-visible:ring-blue-400"
					aria-expanded={allTagsShown}
					onclick={() => (allTagsShown = !allTagsShown)}
				>
					{allTagsShown ? 'Less' : `${tags.length - shownTags.length} more`}<span class="size-3 {allTagsShown ? 'icon-[lucide--chevron-up]' : 'icon-[lucide--chevron-down]'}"></span>
				</button>
			{/if}
		</div>
	</nav>

	<div class="flex items-center gap-1 border-t border-stone-200 px-2 py-2 text-xs text-muted dark:border-stone-800">
		<Tip label={platform.reveal ? `Show in ${fileManager}` : library.name} side="top">
			{#snippet child({ props })}
				<button {...props} class="flex min-w-0 flex-1 items-center gap-1 truncate rounded-md px-1 py-0.5 text-left enabled:hover:text-stone-800 dark:enabled:hover:text-stone-200" disabled={!platform.reveal} onclick={() => platform.reveal?.('.')}>
					<span class="icon-[lucide--folder] size-3.5 shrink-0"></span><span class="truncate">{library.name}</span>
				</button>
			{/snippet}
		</Tip>
		<Tip label="Settings" shortcut={keys.settings} side="top">
			{#snippet child({ props })}<button {...props} class={iconBtn} aria-label="Settings" onclick={() => (settingsDialog.open = true)}><span class="icon-[lucide--settings] size-3.5"></span></button>{/snippet}
		</Tip>
	</div>
</aside>
