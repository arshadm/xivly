<!--
	Go to a bookmark (⌘J): type to filter by name, ↑ ↓ to choose, ↵ to jump.
-->
<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { filterBookmarks } from '#lib/bookmarks.js';
	import type { Bookmark } from '#lib/types.js';
	import UiDialog from '#lib/ui/Dialog.svelte';

	let { open = $bindable(false), bookmarks, onpick }: { open?: boolean; bookmarks: Bookmark[]; onpick: (bookmark: Bookmark) => void } = $props();

	let query = $state('');
	let active = $state(0);
	let list = $state<HTMLElement>();
	const shown = $derived(filterBookmarks(bookmarks, query));

	// Fresh each time it opens; the first match is the one ↵ picks.
	$effect(() => {
		if (open) query = '';
	});
	$effect(() => {
		void query;
		active = 0;
	});
	$effect(() => {
		list?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
	});

	function pick(bookmark: Bookmark | undefined) {
		if (!bookmark) return;
		open = false;
		onpick(bookmark);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			if (shown.length) active = (active + (e.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			pick(shown[active]);
		}
	}
</script>

<UiDialog bind:open bare class="top-[20vh] w-[min(440px,92vw)] translate-y-0 overflow-hidden">
	<Dialog.Title class="sr-only">Go to bookmark</Dialog.Title>
	<div class="flex items-center gap-2 border-b border-stone-200 px-3 dark:border-stone-800">
		<span class="icon-[lucide--bookmark] size-4 text-stone-400"></span>
		<!-- svelte-ignore a11y_autofocus -->
		<input bind:value={query} {onkeydown} autofocus class="min-w-0 flex-1 bg-transparent py-3 text-[14px] outline-none placeholder:text-muted" placeholder="Go to bookmark" aria-label="Bookmark name" role="combobox" aria-expanded="true" aria-controls="bookmark-list" />
	</div>
	<div bind:this={list} id="bookmark-list" role="listbox" class="max-h-80 overflow-y-auto p-1 text-[13px]">
		{#each shown as bookmark, i (bookmark.id)}
			<button
				role="option"
				aria-selected={i === active}
				data-index={i}
				class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left aria-selected:bg-stone-100 dark:aria-selected:bg-stone-800"
				onpointermove={() => (active = i)}
				onclick={() => pick(bookmark)}
			>
				<span class="min-w-0 flex-1 truncate">{bookmark.name}</span>
				<span class="text-[11px] text-muted tabular-nums">p. {Math.floor(bookmark.page)}</span>
			</button>
		{:else}
			<p class="px-2 py-1.5 text-muted">{bookmarks.length ? 'No bookmark matches.' : 'No bookmarks in this paper yet.'}</p>
		{/each}
	</div>
</UiDialog>
