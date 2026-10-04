<!-- Dialog recipe (bits-ui Dialog) with fade/scale transitions. -->
<script lang="ts">
	import { Dialog } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { cn } from './cn';

	let { open = $bindable(false), title, description, children, class: className }: { open?: boolean; title: string; description?: string; children: Snippet; class?: string } = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay forceMount>
			{#snippet child({ props, open })}
				{#if open}<div {...props} transition:fade={{ duration: 150 }} class="fixed inset-0 z-50 bg-stone-950/40 backdrop-blur-[2px]"></div>{/if}
			{/snippet}
		</Dialog.Overlay>
		<Dialog.Content forceMount>
			{#snippet child({ props, open })}
				{#if open}
					<div {...props} transition:scale={{ start: 0.96, duration: 160 }} class={cn('fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[min(92vw,960px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-white shadow-2xl outline-none dark:bg-stone-900', className)}>
						<div class="flex items-start gap-3 border-b border-stone-200 px-4 py-3 dark:border-stone-800">
							<div class="min-w-0 flex-1">
								<Dialog.Title class="truncate font-serif text-lg">{title}</Dialog.Title>
								{#if description}<Dialog.Description class="text-xs text-stone-500">{description}</Dialog.Description>{/if}
							</div>
							<Dialog.Close class="grid size-8 place-items-center rounded-md hover:bg-stone-100 dark:hover:bg-stone-800" aria-label="Close"><span class="icon-[lucide--x] size-4"></span></Dialog.Close>
						</div>
						{@render children()}
					</div>
				{/if}
			{/snippet}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
