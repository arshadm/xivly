<!--
	The library's "+": one panel to add papers. Paste an arXiv link, or drop PDF
	files on the zone (the window's drop handler imports them) or click it to pick.
-->
<script lang="ts" module>
	export const addPapers = $state({ open: false });
</script>

<script lang="ts">
	import { Popover } from 'bits-ui';
	import { scale } from 'svelte/transition';
	import { addFromArxiv, pickFiles } from '$lib/add-paper';
	import { parseArxiv } from '$lib/arxiv';
	import { keys } from '$lib/shortcuts';
	import Kbd from '$lib/ui/Kbd.svelte';
	import Tip from '$lib/ui/Tip.svelte';
	import { button, iconButton } from '$lib/ui/button';

	let { class: className = '' }: { class?: string } = $props();
	let link = $state('');
	let dragging = $state(false);
	const valid = $derived(!!parseArxiv(link));

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!valid) return;
		const text = link;
		addPapers.open = false;
		link = '';
		void addFromArxiv(text);
	}
	function pick() {
		addPapers.open = false;
		void pickFiles();
	}
</script>

<Popover.Root bind:open={addPapers.open} onOpenChange={(o) => !o && ((link = ''), (dragging = false))}>
	<Tip label="Add papers">
		{#snippet child({ props })}
			<Popover.Trigger {...props} aria-label="Add papers" class={iconButton(8, className)}>
				<span class="icon-[lucide--plus] size-4"></span>
			</Popover.Trigger>
		{/snippet}
	</Tip>
	<Popover.Portal>
		<Popover.Content sideOffset={8} align="end" forceMount>
			{#snippet child({ wrapperProps, props, open })}
				{#if open}
					<div {...wrapperProps}>
						<div {...props} transition:scale={{ start: 0.96, duration: 120 }} class="z-(--z-menu) w-80 space-y-3 rounded-xl border border-stone-200 bg-white p-3 text-sm text-stone-800 shadow-xl outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
							<form class="flex gap-2" onsubmit={submit}>
								<label class="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg bg-stone-100 px-2.5 ring-blue-500/60 focus-within:ring-2 dark:bg-stone-800">
									<span class="icon-[lucide--link] size-3.5 shrink-0 text-stone-400"></span>
									<!-- svelte-ignore a11y_autofocus -->
									<input bind:value={link} autofocus placeholder="arXiv link or id" aria-label="arXiv link or id" class="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-stone-400" />
								</label>
								<button type="submit" class={button('primary')} disabled={!valid}>Add</button>
							</form>
							<button
								type="button"
								class="flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed px-3 py-5 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 {dragging ? 'border-stone-500 bg-stone-100 dark:border-stone-400 dark:bg-stone-800' : 'border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800/60'}"
								onclick={pick}
								ondragenter={() => (dragging = true)}
								ondragleave={() => (dragging = false)}
								ondrop={() => (addPapers.open = false)}
							>
								<span class="icon-[lucide--file-up] size-5 text-stone-400"></span>
								<span class="text-[13px] text-stone-700 dark:text-stone-200">Drop PDF files, or click to choose</span>
								<span class="flex items-center gap-1 text-xs text-stone-400">or press <Kbd>{keys.addPapers}</Kbd></span>
							</button>
						</div>
					</div>
				{/if}
			{/snippet}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
