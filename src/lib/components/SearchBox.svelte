<!--
	The library's search box (the library and the Reading list): what's typed is
	`library.query`, matched against papers' details and notes (filter.ts), and
	notebooks'. ⌘K focuses it, Esc clears it. Notes and notebooks are read once a
	search starts.
-->
<script lang="ts">
	import { library } from '#lib/library.svelte.js';
	import { notebooks } from '#lib/notebooks/notebooks.svelte.js';
	import { keys, matches } from '#lib/shortcuts.js';
	import { iconButton, mutedIcon } from '#lib/ui/button.js';
	import Kbd from '#lib/ui/Kbd.svelte';

	let { placeholder = 'Search papers', oninput }: { placeholder?: string; oninput?: () => void } = $props();

	let input = $state<HTMLInputElement>();
	let focused = $state(false);

	function typed() {
		if (library.query.trim()) void Promise.all([library.loadNotesText(), notebooks.loadTexts()]);
		oninput?.();
	}

	function onkeydown(e: KeyboardEvent) {
		if (matches(e, keys.search)) {
			e.preventDefault();
			input?.focus();
			input?.select();
		} else if (e.key === 'Escape' && e.target === input) {
			library.query = '';
			input?.blur();
		}
	}
</script>

<svelte:window {onkeydown} />

<label class="flex h-8 w-64 min-w-28 shrink-[4] items-center gap-2 rounded-lg bg-stone-200/60 pr-1.5 pl-2.5 ring-blue-500 dark:ring-blue-400 focus-within:bg-white focus-within:ring-2 dark:bg-stone-800/60 dark:focus-within:bg-stone-900">
	<span class="icon-[lucide--search] size-3.5 shrink-0 text-stone-400"></span>
	<input
		bind:this={input}
		bind:value={library.query}
		oninput={typed}
		onfocus={() => (focused = true)}
		onblur={() => (focused = false)}
		{placeholder}
		aria-label="Search papers"
		class="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted focus:placeholder:text-transparent"
	/>
	{#if library.query}
		<button class={iconButton(6, `${mutedIcon} size-5`)} aria-label="Clear search" onclick={() => ((library.query = ''), input?.focus())}><span class="icon-[lucide--x] size-3.5"></span></button>
	{:else if !focused}
		<Kbd>{keys.search}</Kbd>
	{/if}
</label>
