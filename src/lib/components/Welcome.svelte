<script lang="ts">
	import { library } from '$lib/library.svelte';
	import { platform } from '$lib/platform';

	const btn = 'rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900';
</script>

<div class="grid h-full place-items-center px-6" data-tauri-drag-region>
	<div class="max-w-md text-center">
		<h1 class="font-serif text-5xl tracking-tight"><span class="italic">χ</span>ivly</h1>
		<p class="mt-2 text-stone-500">Papers, without distraction.</p>

		{#if library.status === 'error'}
			<p class="mt-8 text-sm text-red-700 select-text dark:text-red-300">Couldn't open the library: {library.error}</p>
			<button class="{btn} mt-6" onclick={() => library.choose()}>Choose library folder…</button>
		{:else if library.status === 'needs-permission'}
			<p class="mt-8 text-sm text-stone-600 dark:text-stone-400">Your browser needs permission again to open <strong>{library.name}</strong>.</p>
			<div class="mt-6 flex justify-center gap-3">
				<button class={btn} onclick={() => library.reconnect()}>Open {library.name}</button>
				<button class="text-sm text-stone-500 hover:text-stone-800" onclick={() => library.choose()}>Choose another…</button>
			</div>
		{:else}
			<p class="mt-8 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
				{#if platform.onDisk}
					Xivly keeps your library as plain files in a folder you choose: one folder per paper, with the PDF (annotations inside) and a <code>paper.json</code>. Put it in iCloud Drive to sync, or open it with Claude Code.
				{:else}
					This browser can't open a folder on your disk, so your library will live in the browser's private storage. Use Chrome, Edge or Arc (or the macOS app) to keep it as plain files.
				{/if}
			</p>
			<button class="{btn} mt-8" onclick={() => library.choose()}>
				{platform.onDisk ? 'Choose library folder…' : 'Start a library'}
			</button>
		{/if}
	</div>
</div>
