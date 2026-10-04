<!-- "Edit details…" for a paper (library). -->
<script module lang="ts">
	export const detailsDialog = $state({
		id: null as string | null,
		show(id: string) {
			this.id = id;
		}
	});
</script>

<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { fade, scale } from 'svelte/transition';
	import { library } from '$lib/library.svelte';
	import PaperDetails from './PaperDetails.svelte';

	const paper = $derived(detailsDialog.id ? library.get(detailsDialog.id) : undefined);
</script>

<Dialog.Root open={!!paper} onOpenChange={(o) => !o && (detailsDialog.id = null)}>
	<Dialog.Portal>
		<Dialog.Overlay forceMount>
			{#snippet child({ props, open })}
				{#if open}<div {...props} transition:fade={{ duration: 120 }} class="fixed inset-0 z-50 bg-stone-950/30"></div>{/if}
			{/snippet}
		</Dialog.Overlay>
		<Dialog.Content forceMount>
			{#snippet child({ props, open })}
				{#if open && paper}
					<div {...props} transition:scale={{ start: 0.97, duration: 140 }} class="fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-[min(480px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-5 text-stone-800 shadow-2xl outline-none dark:bg-stone-900 dark:text-stone-100">
						<Dialog.Title class="sr-only">Paper details</Dialog.Title>
						<Dialog.Close class="absolute top-3 right-3 grid size-8 place-items-center rounded-md text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800" aria-label="Close"><span class="icon-[lucide--x] size-4"></span></Dialog.Close>
						<PaperDetails {paper} />
					</div>
				{/if}
			{/snippet}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
