<!--
	The arXiv feed (library › arXiv feed): papers found on arXiv for your topics,
	scored P1–P5, newest day first or by priority. Filter by priority and topic,
	search, show the dismissed ones.
-->
<script lang="ts">
	import { settingsDialog } from '#lib/components/SettingsDialog.svelte';
	import { platform } from '#lib/platform/index.js';
	import { keys } from '#lib/shortcuts.js';
	import { button, iconButton, mutedIcon } from '#lib/ui/button.js';
	import Tip from '#lib/ui/Tip.svelte';
	import ToggleGroup from '#lib/ui/ToggleGroup.svelte';
	import FeedCard from './FeedCard.svelte';
	import { feed } from './feed.svelte';
	import { byDay } from './filter';

	// Rendered in batches as you scroll: the feed can hold thousands of papers.
	const BATCH = 60;
	let limit = $state(BATCH);
	$effect(() => {
		void feed.visible;
		limit = BATCH;
	});
	const shown = $derived(feed.visible.slice(0, limit));
	const groups = $derived(feed.sort === 'date' ? byDay(shown) : [{ day: '', papers: shown }]);

	/** More cards when the end of the list comes into view. */
	function more(node: HTMLElement) {
		const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && (limit += BATCH), { rootMargin: '600px' });
		io.observe(node);
		return () => io.disconnect();
	}

	const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
	const chip = 'h-7 rounded-full border px-3 text-xs whitespace-nowrap transition-colors border-stone-300 text-stone-600 hover:bg-stone-200/60 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800 aria-pressed:border-stone-800 aria-pressed:bg-stone-800 aria-pressed:text-white dark:aria-pressed:border-stone-200 dark:aria-pressed:bg-stone-200 dark:aria-pressed:text-stone-900';
	const openSettings = () => Object.assign(settingsDialog, { open: true, section: 'feed' });

	$effect(() => {
		if (!feed.loaded) void feed.load();
	});
</script>

<svelte:window onfocus={() => void feed.load()} />

<main class="flex min-w-0 flex-1 flex-col">
	<header class="@container flex h-12 shrink-0 items-center gap-3 px-6 max-lg:gap-2" data-tauri-drag-region>
		<h1 class="min-w-0 shrink-[0.05] truncate font-serif text-xl" data-tauri-drag-region>{feed.dismissed ? 'Dismissed' : 'arXiv feed'}</h1>
		<span class="text-sm text-muted tabular-nums" data-tauri-drag-region>{feed.visible.length}</span>
		<div class="flex-1" data-tauri-drag-region></div>
		<ToggleGroup label="Sort" value={feed.sort} onValueChange={(v) => (feed.sort = v)} items={[{ value: 'date', label: 'Newest' }, { value: 'priority', label: 'Priority' }]} />
		<label class="flex h-8 w-64 min-w-28 shrink-[4] items-center gap-2 rounded-lg bg-stone-200/60 pr-1.5 pl-2.5 ring-blue-500 focus-within:bg-white focus-within:ring-2 dark:bg-stone-800/60 dark:ring-blue-400 dark:focus-within:bg-stone-900">
			<span class="icon-[lucide--search] size-3.5 shrink-0 text-stone-400"></span>
			<input bind:value={feed.query} placeholder="Search the feed" aria-label="Search the feed" class="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted" />
			{#if feed.query}<button class={iconButton(6, `${mutedIcon} size-5`)} aria-label="Clear search" onclick={() => (feed.query = '')}><span class="icon-[lucide--x] size-3.5"></span></button>{/if}
		</label>
		<Tip label="Settings" shortcut={keys.settings}>
			{#snippet child({ props })}<button {...props} class={iconButton(8)} aria-label="Feed settings" onclick={openSettings}><span class="icon-[lucide--settings] size-4"></span></button>{/snippet}
		</Tip>
	</header>

	<div class="flex shrink-0 flex-wrap items-center gap-1.5 px-6 pb-3" role="toolbar" aria-label="Filters">
		{#if !feed.dismissed}
			{#each [1, 2, 3, 4, 5] as n (n)}
				<button class={chip} aria-pressed={feed.priorities.has(n)} onclick={() => feed.togglePriority(n)}>P{n} <span class="tabular-nums opacity-70">{feed.counts[n] ?? 0}</span></button>
			{/each}
			{#if feed.counts[0]}<button class={chip} aria-pressed={feed.priorities.has(0)} onclick={() => feed.togglePriority(0)}>Not scored <span class="tabular-nums opacity-70">{feed.counts[0]}</span></button>{/if}
			{#if feed.allTopics.length}<span class="mx-1 h-5 w-px bg-stone-300 dark:bg-stone-700"></span>{/if}
		{/if}
		{#each feed.allTopics as t (t)}
			<button class={chip} aria-pressed={feed.topics.has(t)} onclick={() => feed.toggleTopic(t)}>{t}</button>
		{/each}
		<div class="flex-1"></div>
		{#if feed.dismissedCount || feed.dismissed}
			<button class={chip} aria-pressed={feed.dismissed} onclick={() => (feed.dismissed = !feed.dismissed)}><span class="icon-[lucide--archive] mr-1 size-3 align-[-1px]"></span>Dismissed <span class="tabular-nums opacity-70">{feed.dismissedCount}</span></button>
		{/if}
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto px-6 pb-10">
		{#if feed.error}
			<p class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">The feed couldn’t be read: {feed.error}</p>
		{:else if !feed.loaded}
			<div class="grid h-full place-items-center"><span class="icon-[lucide--loader-circle] size-5 animate-spin text-stone-400" aria-label="Loading the feed"></span></div>
		{:else if !feed.papers.length}
			<div class="grid h-full place-items-center text-center text-sm text-muted">
				<div class="max-w-sm">
					<p>No papers in the feed yet.</p>
					{#if platform.importArxivFetch}
						<p class="mt-2">Set your categories and topics, or import them (with the papers found so far) from arxiv_fetch.</p>
						<button class={button('secondary', 'mt-3')} onclick={openSettings}>Feed settings…</button>
					{:else}
						<p class="mt-2">Checking arXiv runs in the desktop app; its papers show here too.</p>
					{/if}
				</div>
			</div>
		{:else if !feed.visible.length}
			<div class="grid h-full place-items-center text-sm text-muted">Nothing matches those filters.</div>
		{:else}
			<div class="mx-auto max-w-4xl">
				{#each groups as g (g.day)}
					<section>
						{#if g.day}<h2 class="mt-4 mb-2 text-[11px] font-medium tracking-wide text-muted uppercase first:mt-0">{dayLabel(g.day)}</h2>{/if}
						<div class="space-y-2">
							{#each g.papers as paper (paper.id)}
								<FeedCard {paper} />
							{/each}
						</div>
					</section>
				{/each}
				{#if limit < feed.visible.length}<div {@attach more} class="h-10"></div>{/if}
			</div>
		{/if}
	</div>
</main>
