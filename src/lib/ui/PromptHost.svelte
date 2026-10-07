<script lang="ts">
	import { button } from '#lib/ui/button.js';
	import { Dialog } from 'bits-ui';
	import UiDialog from './Dialog.svelte';
	import { prompts } from './prompt.svelte';

	// Starts from each prompt's value; the field edits it.
	let text = $derived(prompts.current?.value ?? '');
	const submit = () => prompts.close(prompts.current?.value !== undefined ? text.trim() || null : true);
</script>

<UiDialog open={!!prompts.current} onOpenChange={(o) => !o && prompts.close(null)} layer="alert" bare form onsubmit={(e) => (e.preventDefault(), submit())} class="w-[min(420px,92vw)] p-5">
	{#if prompts.current}
		{@const p = prompts.current}
		<Dialog.Title class="font-serif text-lg">{p.title}</Dialog.Title>
		{#if p.message}<Dialog.Description class="mt-1 text-sm text-stone-500">{p.message}</Dialog.Description>{/if}
		{#if p.value !== undefined}
			<!-- svelte-ignore a11y_autofocus -->
			<input bind:value={text} autofocus placeholder={p.placeholder} class="mt-3 h-8 w-full rounded-md border border-stone-300 bg-transparent px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:border-stone-700" />
		{/if}
		<div class="mt-4 flex justify-end gap-2 text-sm">
			<button type="button" class={button('secondary')} onclick={() => prompts.close(null)}>Cancel</button>
			<button type="submit" class={button(p.danger ? 'destructive' : 'primary')}>{p.confirmLabel}</button>
		</div>
	{/if}
</UiDialog>
