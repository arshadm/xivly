<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { fade, scale } from 'svelte/transition';
	import { prompts } from './prompt.svelte';

	let text = $state('');
	$effect(() => {
		text = prompts.current?.value ?? '';
	});
	const submit = () => prompts.close(prompts.current?.value !== undefined ? text.trim() || null : true);
</script>

<Dialog.Root open={!!prompts.current} onOpenChange={(o) => !o && prompts.close(null)}>
	<Dialog.Portal>
		<Dialog.Overlay forceMount>
			{#snippet child({ props, open })}
				{#if open}<div {...props} transition:fade={{ duration: 120 }} class="fixed inset-0 z-[80] bg-stone-950/30"></div>{/if}
			{/snippet}
		</Dialog.Overlay>
		<Dialog.Content forceMount>
			{#snippet child({ props, open })}
				{#if open && prompts.current}
					{@const p = prompts.current}
					<form
						{...props}
						transition:scale={{ start: 0.97, duration: 120 }}
						class="fixed top-1/3 left-1/2 z-[80] w-[min(420px,92vw)] -translate-x-1/2 rounded-xl bg-white p-4 text-stone-800 shadow-2xl outline-none dark:bg-stone-900 dark:text-stone-100"
						onsubmit={(e) => (e.preventDefault(), submit())}
					>
						<Dialog.Title class="font-medium">{p.title}</Dialog.Title>
						{#if p.message}<Dialog.Description class="mt-1 text-sm text-stone-500">{p.message}</Dialog.Description>{/if}
						{#if p.value !== undefined}
							<!-- svelte-ignore a11y_autofocus -->
							<input bind:value={text} autofocus placeholder={p.placeholder} class="mt-3 h-9 w-full rounded-md border border-stone-300 bg-transparent px-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 dark:border-stone-700" />
						{/if}
						<div class="mt-4 flex justify-end gap-2 text-sm">
							<button type="button" class="h-8 rounded-md px-3 hover:bg-stone-100 dark:hover:bg-stone-800" onclick={() => prompts.close(null)}>Cancel</button>
							<button type="submit" class="h-8 rounded-md px-3 font-medium text-white {p.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-stone-900 hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900'}">{p.confirmLabel}</button>
						</div>
					</form>
				{/if}
			{/snippet}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
