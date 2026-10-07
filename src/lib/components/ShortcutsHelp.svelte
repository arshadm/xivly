<!-- `?`: every shortcut. App keys always; reading & annotation keys (from
     svelte-pdf-mini's keymap) when a paper is open. -->
<script module lang="ts">
	import type { Group } from '#lib/shortcuts.js';
	export const shortcutsHelp = $state({ open: false, pdf: null as null | (() => Group[]) });
</script>

<script lang="ts">
	import { shortcuts } from '#lib/shortcuts.js';
	import Dialog from '#lib/ui/Dialog.svelte';
	import Kbd from '#lib/ui/Kbd.svelte';

	const groups = $derived(shortcutsHelp.open ? [...(shortcutsHelp.pdf?.() ?? []), ...shortcuts] : []);
</script>

<Dialog bind:open={shortcutsHelp.open} title="Keyboard shortcuts" class="max-w-4xl">
	<div class="columns-1 gap-x-10 overflow-y-auto p-5 sm:columns-2 lg:columns-3">
		{#each groups as g (g.title)}
			<section class="mb-5 break-inside-avoid">
				<h3 class="mb-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">{g.title}</h3>
				<ul class="space-y-1 text-[13px]">
					{#each g.items as it (it.label)}
						<li class="flex items-center justify-between gap-3">
							<span>{it.label}</span>
							<span class="flex shrink-0 gap-1">{#each it.keys.slice(0, 2) as k (k)}<Kbd>{k}</Kbd>{/each}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
</Dialog>
