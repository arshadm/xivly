<!--
	The reader side panel's Bookmarks view: click to jump, rename / remove on hover.
-->
<script lang="ts">
	import { keys } from '#lib/shortcuts.js';
	import type { Bookmark } from '#lib/types.js';
	import { iconButton } from '#lib/ui/button.js';
	import Kbd from '#lib/ui/Kbd.svelte';
	import Tip from '#lib/ui/Tip.svelte';

	let {
		bookmarks,
		onadd,
		ongo,
		onrename,
		onremove
	}: {
		bookmarks: Bookmark[];
		onadd: () => void;
		ongo: (b: Bookmark) => void;
		onrename: (b: Bookmark) => void;
		onremove: (b: Bookmark) => void;
	} = $props();
</script>

<div class="flex items-center justify-between px-2 pt-1 pb-2">
	<p class="text-[11px] font-medium tracking-wide text-muted uppercase">Bookmarks</p>
	<Tip label="Bookmark this spot" shortcut={keys.addBookmark}>
		{#snippet child({ props })}<button {...props} class={iconButton(6)} aria-label="Bookmark this spot" onclick={onadd}><span class="icon-[lucide--bookmark-plus] size-3.5"></span></button>{/snippet}
	</Tip>
</div>
{#each bookmarks as b (b.id)}
	<div class="group flex items-center rounded-md hover:bg-stone-200/70 dark:hover:bg-stone-800">
		<button class="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left" onclick={() => ongo(b)}>
			<span class="icon-[lucide--bookmark] size-3.5 shrink-0 text-muted"></span>
			<span class="min-w-0 flex-1 truncate font-medium">{b.name}</span>
			<span class="text-[11px] text-muted tabular-nums group-hover:hidden group-focus-within:hidden">p. {Math.floor(b.page)}</span>
		</button>
		<div class="hidden shrink-0 items-center pr-1 group-hover:flex group-focus-within:flex">
			<Tip label="Rename">{#snippet child({ props })}<button {...props} class={iconButton(6)} aria-label="Rename {b.name}" onclick={() => onrename(b)}><span class="icon-[lucide--pencil] size-3.5"></span></button>{/snippet}</Tip>
			<Tip label="Remove">{#snippet child({ props })}<button {...props} class={iconButton(6)} aria-label="Remove {b.name}" onclick={() => onremove(b)}><span class="icon-[lucide--trash-2] size-3.5"></span></button>{/snippet}</Tip>
		</div>
	</div>
{:else}
	<p class="flex flex-wrap items-center gap-1 p-2 text-muted">Press <Kbd>{keys.addBookmark}</Kbd> to bookmark the spot you're reading, or right-click a page.</p>
{/each}
