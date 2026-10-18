<script lang="ts">
	import { iconButton, mutedIcon } from '#lib/ui/button.js';
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import { fade, scale } from 'svelte/transition';
	import { library } from '#lib/library.svelte.js';
	import { coverStyles, settings } from '#lib/settings.svelte.js';
	import { keys, matches } from '#lib/shortcuts.js';
	import PaperCard from '#lib/components/PaperCard.svelte';
	import { warmCovers } from '#lib/covers.js';
	import { settingsDialog } from '#lib/components/SettingsDialog.svelte';
	import Sidebar from '#lib/components/Sidebar.svelte';
	import Kbd from '#lib/ui/Kbd.svelte';
	import SearchBox from '#lib/components/SearchBox.svelte';
	import Tip from '#lib/ui/Tip.svelte';
	import { setFallbackMenu, type MenuItem } from '#lib/ui/context-menu.svelte.js';
	import { LIBRARY_TAB, openNotebook, openPaper, setWindowTitle } from '#lib/windows.js';
	import { notebooks } from '#lib/notebooks/notebooks.svelte.js';
	import { openNotebooks, openPapers, rememberView } from '#lib/session.js';
	import { untrack } from 'svelte';
	import { platform } from '#lib/platform/index.js';
	import { readOptions, sortMenu, sortOptions } from '#lib/sort-menu.js';
	import { onLibraryPaste, pickFiles } from '#lib/add-paper.js';
	import AddPapers, { addPapers } from '#lib/components/AddPapers.svelte';
	import CategoryDialog, { showCategoryDialog } from '#lib/components/CategoryDialog.svelte';
	import CycleButton, { type CycleOption } from '#lib/ui/CycleButton.svelte';
	import type { RecentWindow, SortKey } from '#lib/settings.svelte.js';
	import { starter } from '#lib/onboarding/starter.svelte.js';
	import ToggleGroup from '#lib/ui/ToggleGroup.svelte';
	import VirtualGrid from '#lib/ui/VirtualGrid.svelte';
	import PaperRow from '#lib/components/PaperRow.svelte';
	import ConflictsDialog, { showConflicts } from '#lib/components/ConflictsDialog.svelte';
	import ReadingView from '#lib/components/ReadingView.svelte';
	import FeedView from '#lib/feed/FeedView.svelte';
	import { disjointViewKey } from '#lib/ui/view-key.js';
	import { button } from '#lib/ui/button.js';
	import { ARCHIVED } from '#lib/library.svelte.js';
	import { prefersReducedMotion } from 'svelte/motion';

	let scroller = $state<HTMLElement>();

	const title = $derived.by(() => {
		const v = library.view;
		if (v.kind === 'category') return library.category(v.id)?.name ?? '';
		return { all: 'All papers', recent: 'Recent', uncategorized: 'Uncategorized', feed: 'arXiv feed', reading: 'Reading' }[v.kind];
	});
	$effect(() => void setWindowTitle(library.name ? `Xivly — ${library.name}` : 'Xivly'));
	// Back to this view at the next launch.
	$effect(() => {
		if (library.status === 'ready') rememberView(library.view);
	});
	// At launch (no reader window open yet): the papers open when the app quit, open again.
	$effect(() => {
		if (library.status !== 'ready' || platform.kind !== 'desktop' || !settings.values.reopenPapers) return;
		untrack(() => void reopenPapers());
	});
	let reopened = false;
	async function reopenPapers() {
		if (reopened) return;
		reopened = true;
		const { getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
		if ((await getAllWebviewWindows()).some((w) => w.label.startsWith('paper-') || w.label.startsWith('notebook-'))) return;
		for (const id of openPapers()) {
			const paper = library.get(id);
			if (paper) await openPaper(paper.id, paper.title);
		}
		await notebooks.reload();
		for (const id of openNotebooks()) {
			const n = notebooks.get(id);
			if (n?.kind === 'notebook') await openNotebook(n.id, n.title);
		}
	}
	// Web: a reader opened from this tab switches back to it (showLibrary).
	$effect(() => {
		window.name = LIBRARY_TAB;
		return () => (window.name = '');
	});

	// The grid is rebuilt (a fade) only when the view changes to papers that share none with
	// the previous ones (e.g. one category to another): otherwise shared cards move (flip).
	const viewKey = disjointViewKey();
	const gridKey = $derived(viewKey.next(JSON.stringify(library.view), library.filtered.map((p) => p.id)));

	// Motion: none with reduced motion; long lists don't animate at all (flip measures every
	// card on each change); while typing a search, cards re-flow without easing.
	let typing = $state(false);
	let typingTimer: ReturnType<typeof setTimeout> | undefined;
	function onSearchInput() {
		typing = true;
		clearTimeout(typingTimer);
		typingTimer = setTimeout(() => (typing = false), 400);
	}
	const animated = $derived(library.filtered.length <= 150 && !prefersReducedMotion.current);
	const motion = $derived(animated && !typing ? 1 : 0);
	const minCard = $derived({ small: 140, medium: 170, large: 220 }[settings.values.cardSize]);

	// "First page" covers: the ones not cached yet render ahead of time, once the
	// covers on screen are done (one at a time, only while nothing else renders).
	$effect(() => {
		if (settings.values.coverStyle !== 'page' || library.status !== 'ready') return;
		const ids = library.papers.map((p) => p.id);
		const timer = setTimeout(() => void warmCovers(ids), 2000);
		return () => clearTimeout(timer);
	});

	const newCategory = () => showCategoryDialog();

	// Right-click on empty space.
	const backgroundMenu = (): MenuItem[] => [
		{ label: 'Add papers…', icon: 'icon-[lucide--plus]', shortcut: keys.addArxiv, onSelect: () => (addPapers.open = true) },
		{ label: 'New category…', icon: 'icon-[lucide--folder-plus]', onSelect: newCategory },
		{ label: 'Sort', icon: 'icon-[lucide--arrow-down-wide-narrow]', separatorBefore: true, items: sortMenu() },
		{ label: 'Show', icon: 'icon-[lucide--eye]', items: readOptions.map((o) => ({ label: o.label, checked: settings.values.readFilter === o.value, onSelect: () => settings.set('readFilter', o.value) })) },
		{
			label: 'Card size',
			icon: 'icon-[lucide--layout-grid]',
			items: (['small', 'medium', 'large'] as const).map((v) => ({ label: v[0].toUpperCase() + v.slice(1), checked: settings.values.cardSize === v, onSelect: () => settings.set('cardSize', v) }))
		},
		{ label: 'Cover style', icon: 'icon-[lucide--book]', items: coverStyles.map((c) => ({ label: c.label, checked: settings.values.coverStyle === c.value, onSelect: () => settings.set('coverStyle', c.value) })) },
		{ label: 'Settings…', icon: 'icon-[lucide--settings]', shortcut: keys.settings, separatorBefore: true, onSelect: () => (settingsDialog.open = true) }
	];
	$effect(() => setFallbackMenu(backgroundMenu));

	function onkeydown(e: KeyboardEvent) {
		if (matches(e, keys.addPapers)) {
			e.preventDefault();
			void pickFiles();
		} else if (matches(e, keys.addArxiv)) {
			e.preventDefault();
			addPapers.open = true;
		}
	}

	const sortByOptions: CycleOption<SortKey>[] = sortOptions.map((o) => ({ value: o.value, label: o.label, icon: o.icon }));

	/** What hides papers right now (besides the view), for the empty state. */
	const activeFilters = $derived.by(() => {
		const out: string[] = [];
		if (library.query.trim()) out.push(`matching “${library.query.trim()}”`);
		const rf = settings.values.readFilter;
		if (rf !== 'all') out.push(rf === 'unread' ? 'unread only' : 'read only');
		for (const [t, mode] of Object.entries(library.tagFilter)) {
			if (t === ARCHIVED && mode === 'out') continue; // the default: mentioned only when it hides something
			out.push(mode === 'in' ? `only #${t}` : `hiding #${t}`);
		}
		return out;
	});
	/** Papers of this view before any filter (archived included). */
	const inView = $derived(
		library.papers.filter((p) => {
			const v = library.view;
			if (v.kind === 'category') return p.category === v.id;
			if (v.kind === 'uncategorized') return !library.category(p.category);
			return true;
		})
	);
	const archivedHidden = $derived(library.tagFilter[ARCHIVED] === 'out' && inView.some((p) => p.tags?.includes(ARCHIVED)));
	const filtering = $derived(activeFilters.length > 0 || archivedHidden);
	// Notebooks with the phrase searched for (title or text), above the papers.
	const NOTEBOOKS_SHOWN = 6;
	const foundNotebooks = $derived(notebooks.search(library.query));
	let allNotebooksShown = $state(false);
	$effect(() => {
		void library.query;
		allNotebooksShown = false;
	});

	const emptyMessage = $derived.by(() => {
		if (!library.papers.length) return 'Your library is empty.';
		if (!inView.length) return `Nothing in ${title} yet.`;
		if (library.view.kind === 'recent' && !activeFilters.length) {
			const label = recentOptions.find((o) => o.value === settings.values.recentWindow)?.label.toLowerCase();
			return `Nothing opened in the ${label}.`;
		}
		const why = [...activeFilters, ...(archivedHidden ? ['archived papers are hidden'] : [])];
		return why.length ? `No papers here: ${why.join(', ')}.` : 'No papers match.';
	});
	function clearFilters() {
		library.query = '';
		settings.set('readFilter', 'all');
		for (const t of Object.keys(library.tagFilter)) library.setTagFilter(t, null);
	}
	const recentOptions: CycleOption<RecentWindow>[] = [
		{ value: 'day', label: 'Last day', icon: 'icon-[lucide--clock]' },
		{ value: 'week', label: 'Last 7 days', icon: 'icon-[lucide--calendar-days]' },
		{ value: 'month', label: 'Last 30 days', icon: 'icon-[lucide--calendar-range]' }
	];
	/** Every order label, whatever the sort: the order button keeps room for the longest. */
	const orderLabels = sortOptions.flatMap((o) => [o.desc, o.asc]);
	const orderOptions = $derived.by((): CycleOption<boolean>[] => {
		const o = sortOptions.find((x) => x.value === settings.values.sortBy) ?? sortOptions[0];
		return [
			{ value: true, label: o.desc, icon: 'icon-[lucide--arrow-down-wide-narrow]' },
			{ value: false, label: o.asc, icon: 'icon-[lucide--arrow-up-narrow-wide]' }
		];
	});
	const iconBtn = iconButton(8);
</script>

<svelte:window {onkeydown} onpaste={onLibraryPaste} />

<CategoryDialog />
<ConflictsDialog />

<div class="flex h-full">
	<Sidebar onNewCategory={newCategory} />

	{#if library.view.kind === 'feed'}
		<FeedView />
	{:else if library.view.kind === 'reading'}
		<ReadingView />
	{:else}
	<main class="flex min-w-0 flex-1 flex-col">
		<!-- A container: at narrow widths labels and the read filter fold away (720px windows). -->
		<header class="@container flex h-12 shrink-0 items-center gap-3 px-6 max-lg:gap-2" data-tauri-drag-region>
			<h1 class="min-w-0 shrink-[0.05] truncate font-serif text-xl" data-tauri-drag-region>{title}</h1>
			<span class="text-sm text-muted tabular-nums" data-tauri-drag-region>{library.filtered.length}</span>
			<div class="flex-1" data-tauri-drag-region></div>
			{#if starter.running}
				<span class="flex shrink-0 items-center gap-1.5 text-xs text-muted" transition:fade><span class="icon-[lucide--loader-circle] size-3.5 animate-spin"></span><span class="@max-4xl:hidden">Adding example papers</span> {starter.done}/{starter.total || '…'}</span>
			{:else if library.importing}
				<span class="flex shrink-0 items-center gap-1.5 text-xs text-muted" transition:fade><span class="icon-[lucide--loader-circle] size-3.5 animate-spin"></span><span class="@max-4xl:hidden">Adding {library.importing}…</span></span>
			{/if}
			{#if library.view.kind !== 'recent'}
				<div class="flex items-center">
					<CycleButton title="Sort by" options={sortByOptions} value={settings.values.sortBy} onchange={(v) => settings.set('sortBy', v)} showLabel labelClass="@max-4xl:hidden" class="h-8" />
					<CycleButton title="Order" options={orderOptions} value={settings.values.sortDesc} onchange={(v) => settings.set('sortDesc', v)} showLabel reserve={orderLabels} labelClass="@max-4xl:hidden" class="h-8" />
				</div>
			{:else}
				<CycleButton title="Recent" options={recentOptions} value={settings.values.recentWindow} onchange={(v) => settings.set('recentWindow', v)} showLabel labelClass="@max-4xl:hidden" class="h-8" />
			{/if}
			<ToggleGroup
				label="Layout"
				value={settings.values.libraryLayout}
				onValueChange={(v) => settings.set('libraryLayout', v)}
				items={[
					{ value: 'cards', label: '', title: 'Cards', icon: 'icon-[lucide--layout-grid]' },
					{ value: 'list', label: '', title: 'List', icon: 'icon-[lucide--list]' }
				]}
			/>
			<ToggleGroup class="@max-2xl:hidden" label="Show papers" value={settings.values.readFilter} onValueChange={(v) => settings.set('readFilter', v)} items={readOptions.map((o) => ({ value: o.value, label: o.value === 'all' ? 'All' : o.label }))} />
			<SearchBox placeholder="Search papers & notebooks" oninput={onSearchInput} />
			<AddPapers />
			<Tip label="Settings" shortcut={keys.settings}>
				{#snippet child({ props })}<button {...props} class={iconBtn} aria-label="Settings" onclick={() => (settingsDialog.open = true)}><span class="icon-[lucide--settings] size-4"></span></button>{/snippet}
			</Tip>
		</header>

		{#if library.error}
			<p class="mx-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{library.error}</p>
		{/if}
		{#if library.conflicts.length}
			<div class="mx-6 flex items-center gap-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/60 dark:text-amber-200" role="status">
				<span class="icon-[lucide--git-compare] size-4 shrink-0"></span>
				<p class="min-w-0 flex-1">{library.conflicts.length === 1 ? 'A file was' : `${library.conflicts.length} files were`} changed on two devices at once: a copy of the other version was kept.</p>
				<button class="shrink-0 font-medium underline underline-offset-2" onclick={() => showConflicts()}>Review…</button>
			</div>
		{/if}

		<div bind:this={scroller} class="min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-10">
			{#if foundNotebooks.length}
				<section class="mb-3" aria-label="Notebooks found">
					<h2 class="mb-2 text-[11px] font-medium tracking-wide text-muted uppercase">Notebooks <span class="font-normal">· {foundNotebooks.length}</span></h2>
					<ul class="grid gap-2" style:grid-template-columns="repeat(auto-fill, minmax(280px, 1fr))">
						{#each allNotebooksShown ? foundNotebooks : foundNotebooks.slice(0, NOTEBOOKS_SHOWN) as m (m.node.id)}
							{@const folders = notebooks.path(m.node.id).map((f) => f.title).join(' › ')}
							<li>
								<button class="block h-full w-full rounded-lg border border-stone-200 bg-white/60 px-3 py-2 text-left hover:border-stone-300 hover:bg-white dark:border-stone-800 dark:bg-stone-900/60 dark:hover:border-stone-700 dark:hover:bg-stone-900" onclick={() => void openNotebook(m.node.id, m.node.title)}>
									<span class="flex items-center gap-2">
										<span class="icon-[lucide--notebook-text] size-4 shrink-0 text-stone-500"></span>
										<span class="min-w-0 flex-1 truncate text-[13px] font-medium">{m.node.title}</span>
									</span>
									{#if folders}<span class="mt-0.5 block truncate pl-6 text-xs text-muted">{folders}</span>{/if}
									{#if m.snippet}<span class="mt-1 line-clamp-2 block pl-6 text-xs text-stone-600 dark:text-stone-400">{m.snippet.before}<mark class="rounded-sm bg-amber-200/80 px-0.5 text-inherit dark:bg-amber-700/50">{m.snippet.match}</mark>{m.snippet.after}</span>{/if}
								</button>
							</li>
						{/each}
					</ul>
					{#if foundNotebooks.length > NOTEBOOKS_SHOWN}
						<button class="mt-2 text-xs text-muted hover:underline" onclick={() => (allNotebooksShown = !allNotebooksShown)}>{allNotebooksShown ? 'Show fewer' : `Show all ${foundNotebooks.length}`}</button>
					{/if}
					{#if library.filtered.length}<h2 class="mt-6 text-[11px] font-medium tracking-wide text-muted uppercase">Papers <span class="font-normal">· {library.filtered.length}</span></h2>{/if}
				</section>
			{/if}
			{#if !library.filtered.length && foundNotebooks.length}
				<p class="text-sm text-muted">{emptyMessage}</p>
			{:else if library.filtered.length}
				<!-- Cards move (flip) between views that share papers, and as searching and
				     tag filters re-flow; a view with none in common swaps the grid (a fade). -->
				{#key gridKey}
					{#if settings.values.libraryLayout === 'list'}
						<!-- The list: rows, same order and filters as the cards. -->
						{#if animated}
							<ul in:fade={{ duration: 160 * motion }}>
								{#each library.filtered as paper (paper.id)}
									<li animate:flip={{ duration: 220 * motion, easing: cubicOut }} in:fade={{ duration: 160 * motion }} out:fade={{ duration: 100 * motion }}>
										<PaperRow {paper} />
									</li>
								{/each}
							</ul>
						{:else}
							<!-- One column: only the rows on screen are rendered. -->
							<VirtualGrid items={library.filtered} key={(p) => p.id} min={100_000} gap={0} {scroller}>
								{#snippet cell(paper)}<PaperRow {paper} />{/snippet}
							</VirtualGrid>
						{/if}
					{:else if animated}
						<ul class="grid gap-5" style:grid-template-columns="repeat(auto-fill, minmax({minCard}px, 1fr))" in:fade={{ duration: 160 * motion }}>
							{#each library.filtered as paper (paper.id)}
								<li animate:flip={{ duration: 260 * motion, easing: cubicOut }} in:fade={{ duration: 160 * motion }} out:scale={{ start: 0.96, duration: 120 * motion }}>
									<PaperCard {paper} />
								</li>
							{/each}
						</ul>
					{:else}
						<!-- Too many to animate: only the rows on screen are rendered. -->
						<VirtualGrid items={library.filtered} key={(p) => p.id} min={minCard} gap={20} {scroller}>
							{#snippet cell(paper)}<PaperCard {paper} />{/snippet}
						</VirtualGrid>
					{/if}
				{/key}
			{:else}
				<div class="grid h-full place-items-center text-center text-sm text-muted" in:fade={{ duration: 160 * motion }}>
					<div>
						<p>{emptyMessage}</p>
						{#if filtering && inView.length}
							<button class={button('secondary', 'mt-3')} onclick={clearFilters}>Clear filters</button>
						{:else if !library.papers.length || !inView.length}
							<p class="mt-2 flex items-center justify-center gap-1">Drop PDFs here, press <Kbd>{keys.addPapers}</Kbd>, or paste an arXiv link</p>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</main>
	{/if}
</div>

