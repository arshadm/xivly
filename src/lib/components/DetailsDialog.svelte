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
	import UiDialog from '$lib/ui/Dialog.svelte';
	import { library } from '$lib/library.svelte';
	import PaperActions from './PaperActions.svelte';
	import PaperDetails from './PaperDetails.svelte';

	const paper = $derived(detailsDialog.id ? library.get(detailsDialog.id) : undefined);
	let dialogEl = $state<HTMLElement>();
</script>

<!-- Fixed header (close) and footer (actions); only the details scroll between them.
     Focus goes to the dialog itself on open, not the close button (no ring on open). -->
<UiDialog open={!!paper} onOpenChange={(o) => !o && (detailsDialog.id = null)} bare bind:ref={dialogEl} onOpenAutoFocus={(e) => (e.preventDefault(), dialogEl?.focus())} class="flex max-h-[85vh] w-[min(480px,92vw)] flex-col overflow-hidden">
	{#if paper}
		<Dialog.Title class="sr-only">Paper details</Dialog.Title>
		<Dialog.Close class={iconButton(8, `${mutedIcon} absolute top-3 right-3 z-10 bg-white dark:bg-stone-900`)} aria-label="Close"><span class="icon-[lucide--x] size-4"></span></Dialog.Close>
		<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 pb-5 [&_[aria-label=Title]]:pr-9">
			<PaperDetails {paper} footer={false} />
		</div>
		<PaperActions {paper} class="shrink-0 border-t border-stone-200 px-4 py-2 dark:border-stone-800" />
	{/if}
</UiDialog>
