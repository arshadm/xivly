<script lang="ts">
	import { button } from '$lib/ui/button';
	import { Dialog } from 'bits-ui';
	import { fade, scale } from 'svelte/transition';
	import { prompts } from './prompt.svelte';

	// Starts from each prompt's value; the field edits it.
	let text = $derived(prompts.current?.value ?? '');
	const submit = () => prompts.close(prompts.current?.value !== undefined ? text.trim() || null : true);
</script>

<Dialog.Root open={!!prompts.current} onOpenChange={(o) => !o && prompts.close(null)}>
	<Dialog.Portal>
		<Dialog.Overlay forceMount>
			{#snippet child({ props, open })}
				{#if open}<div {...props} transition:fade={{ duration: 150 }} class="fixed inset-0 z-(--z-alert) bg-stone-950/30 backdrop-blur-[2px]"></div>{/if}
			{/snippet}
		</Dialog.Overlay>
		<Dialog.Content forceMount>
			{#snippet child({ props, open })}
				{#if open && prompts.current}
					{@const p = prompts.current}
					<form
						{...props}
						transition:scale={{ start: 0.97, duration: 150 }}
						class="fixed top-1/2 left-1/2 z-(--z-alert) w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 text-stone-800 shadow-2xl outline-none dark:bg-stone-900 dark:text-stone-100"
						onsubmit={(e) => (e.preventDefault(), submit())}
					>
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
					</form>
				{/if}
			{/snippet}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
