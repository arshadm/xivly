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
	import { iconButton, mutedIcon } from '$lib/ui/button';
	import { Dialog } from 'bits-ui';
	import { fade, scale } from 'svelte/transition';
	import { library } from '$lib/library.svelte';
	import PaperActions from './PaperActions.svelte';
	import PaperDetails from './PaperDetails.svelte';

	const paper = $derived(detailsDialog.id ? library.get(detailsDialog.id) : undefined);
	let dialogEl = $state<HTMLElement>();
</script>

<Dialog.Root open={!!paper} onOpenChange={(o) => !o && (detailsDialog.id = null)}>
	<Dialog.Portal>
		<Dialog.Overlay forceMount>
			{#snippet child({ props, open })}
				{#if open}<div {...props} transition:fade={{ duration: 150 }} class="fixed inset-0 z-(--z-dialog) bg-stone-950/30 backdrop-blur-[2px]"></div>{/if}
			{/snippet}
		</Dialog.Overlay>
		<!-- Focus the dialog itself on open, not the close button (no ring on open). -->
		<Dialog.Content forceMount onOpenAutoFocus={(e) => (e.preventDefault(), dialogEl?.focus())}>
			{#snippet child({ props, open })}
				{#if open && paper}
					<!-- Fixed header (close) and footer (actions); only the details scroll between them. -->
					<div {...props} bind:this={dialogEl} tabindex="-1" transition:scale={{ start: 0.97, duration: 150 }} class="fixed top-1/2 left-1/2 z-(--z-dialog) flex max-h-[85vh] w-[min(480px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white text-stone-800 shadow-2xl outline-none dark:bg-stone-900 dark:text-stone-100">
						<Dialog.Title class="sr-only">Paper details</Dialog.Title>
						<Dialog.Close class={iconButton(8, `${mutedIcon} absolute top-3 right-3 z-10 bg-white dark:bg-stone-900`)} aria-label="Close"><span class="icon-[lucide--x] size-4"></span></Dialog.Close>
						<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 pb-5 [&_[aria-label=Title]]:pr-9">
							<PaperDetails {paper} footer={false} />
						</div>
						<PaperActions {paper} class="shrink-0 border-t border-stone-200 px-4 py-2 dark:border-stone-800" />
					</div>
				{/if}
			{/snippet}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
