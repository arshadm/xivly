<script lang="ts">
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import { fade, scale } from 'svelte/transition';
	import { library } from '$lib/library.svelte';
	import { settings } from '$lib/settings.svelte';
	import { keys, matches } from '$lib/shortcuts';
	import PaperCard from '$lib/components/PaperCard.svelte';
	import { settingsDialog } from '$lib/components/SettingsDialog.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import Kbd from '$lib/ui/Kbd.svelte';
	import Tip from '$lib/ui/Tip.svelte';
	import { setFallbackMenu, type MenuItem } from '$lib/ui/context-menu.svelte';
	import { prompts } from '$lib/ui/prompt.svelte';
	import { setWindowTitle } from '$lib/windows';

	let search = $state<HTMLInputElement>();
	let searchFocused = $state(false);

	const title = $derived.by(() => {
		const v = library.view;
		if (v.kind === 'category') return library.category(v.id)?.name ?? '';
		return { all: 'All papers', recent: 'Recent', uncategorized: 'Uncategorized' }[v.kind];
	});
	$effect(() => void setWindowTitle(library.name ? `Xivly — ${library.name}` : 'Xivly'));

	const viewKey = $derived(JSON.stringify(library.view));
	const minCard = $derived({ small: 140, medium: 170, large: 220 }[settings.values.cardSize]);

	async function newCategory() {
		const name = await prompts.ask('New category', { placeholder: 'e.g. Robotics', confirmLabel: 'Create' });
		if (name) library.view = { kind: 'category', id: await library.addCategory(name, 'sage') };
	}

	// Right-click on empty space.
	const backgroundMenu = (): MenuItem[] => [
		{ label: 'Add papers…', icon: 'icon-[lucide--file-plus]', shortcut: keys.addPapers, onSelect: () => library.pickAndImport() },
		{ label: 'New category…', icon: 'icon-[lucide--folder-plus]', onSelect: newCategory },
		{
			label: 'Sort by',
			icon: 'icon-[lucide--arrow-down-wide-narrow]',
			separatorBefore: true,
			items: (
				[
					['added', 'Date added'],
					['opened', 'Last opened'],
					['year', 'Year'],
					['title', 'Title']
				] as const
			).map(([v, label]) => ({ label, checked: settings.values.sortBy === v, onSelect: () => settings.set('sortBy', v) }))
		},
		{
			label: 'Card size',
			icon: 'icon-[lucide--layout-grid]',
			items: (['small', 'medium', 'large'] as const).map((v) => ({ label: v[0].toUpperCase() + v.slice(1), checked: settings.values.cardSize === v, onSelect: () => settings.set('cardSize', v) }))
		},
		{ label: 'Settings…', icon: 'icon-[lucide--settings]', shortcut: keys.settings, separatorBefore: true, onSelect: () => (settingsDialog.open = true) }
	];
	$effect(() => setFallbackMenu(backgroundMenu));

	function onkeydown(e: KeyboardEvent) {
		if (matches(e, keys.search)) {
			e.preventDefault();
			search?.focus();
			search?.select();
		} else if (matches(e, keys.addPapers)) {
			e.preventDefault();
			library.pickAndImport();
		} else if (e.key === 'Escape' && e.target === search) {
			library.query = '';
			search?.blur();
		}
	}

	const iconBtn = 'grid size-8 place-items-center rounded-md text-stone-600 hover:bg-stone-200/70 dark:text-stone-300 dark:hover:bg-stone-800';
</script>

<svelte:window {onkeydown} />

<div class="flex h-full">
	<Sidebar onNewCategory={newCategory} />

	<main class="flex min-w-0 flex-1 flex-col">
		<header class="flex h-12 shrink-0 items-center gap-3 px-6" data-tauri-drag-region>
			<h1 class="font-serif text-xl" data-tauri-drag-region>{title}</h1>
			<span class="text-sm text-stone-400 tabular-nums" data-tauri-drag-region>{library.filtered.length}</span>
			<div class="flex-1" data-tauri-drag-region></div>
			{#if library.importing}
				<span class="flex items-center gap-1.5 text-xs text-stone-500" transition:fade><span class="icon-[lucide--loader-circle] size-3.5 animate-spin"></span>Adding {library.importing}…</span>
			{/if}
			<label class="flex h-8 w-64 items-center gap-2 rounded-lg bg-stone-200/60 pr-1.5 pl-2.5 ring-stone-400/50 focus-within:bg-white focus-within:ring-2 dark:bg-stone-800/60 dark:focus-within:bg-stone-900">
				<span class="icon-[lucide--search] size-3.5 shrink-0 text-stone-400"></span>
				<input
					bind:this={search}
					bind:value={library.query}
					onfocus={() => (searchFocused = true)}
					onblur={() => (searchFocused = false)}
					placeholder="Search papers"
					aria-label="Search papers"
					class="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-stone-400 focus:placeholder:text-transparent"
				/>
				{#if library.query}
					<button class="grid size-5 place-items-center rounded text-stone-400 hover:text-stone-700" aria-label="Clear search" onclick={() => ((library.query = ''), search?.focus())}><span class="icon-[lucide--x] size-3.5"></span></button>
				{:else if !searchFocused}
					<Kbd>{keys.search}</Kbd>
				{/if}
			</label>
			<Tip label="Add papers" shortcut={keys.addPapers}>
				{#snippet child({ props })}<button {...props} class={iconBtn} aria-label="Add papers" onclick={() => library.pickAndImport()}><span class="icon-[lucide--plus] size-4"></span></button>{/snippet}
			</Tip>
			<Tip label="Settings" shortcut={keys.settings}>
				{#snippet child({ props })}<button {...props} class={iconBtn} aria-label="Settings" onclick={() => (settingsDialog.open = true)}><span class="icon-[lucide--settings] size-4"></span></button>{/snippet}
			</Tip>
		</header>

		{#if library.error}
			<p class="mx-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{library.error}</p>
		{/if}

		<div class="min-h-0 flex-1 overflow-y-auto px-6 pt-2 pb-10">
			{#if library.filtered.length}
				<!-- Switching category swaps the whole grid (a short fade); searching
				     and tag filters within it re-flow with flip (local transitions). -->
				{#key viewKey}
					<ul class="grid gap-5" style:grid-template-columns="repeat(auto-fill, minmax({minCard}px, 1fr))" in:fade={{ duration: 160 }}>
						{#each library.filtered as paper (paper.id)}
							<li animate:flip={{ duration: 260, easing: cubicOut }} in:fade={{ duration: 160 }} out:scale={{ start: 0.96, duration: 120 }}>
								<PaperCard {paper} />
							</li>
						{/each}
					</ul>
				{/key}
			{:else}
				<div class="grid h-full place-items-center text-center text-sm text-stone-500" in:fade>
					<div>
						<p>{library.papers.length ? 'No papers match.' : 'Your library is empty.'}</p>
						<p class="mt-2 flex items-center justify-center gap-1">Drop PDFs here, or press <Kbd>{keys.addPapers}</Kbd></p>
					</div>
				</div>
			{/if}
		</div>
	</main>
</div>

