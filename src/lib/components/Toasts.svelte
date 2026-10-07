<script module lang="ts">
	type Action = { label: string; run: () => void };
	type Toast = { id: number; text: string; kind: 'info' | 'error'; action?: Action };
	let toasts = $state<Toast[]>([]);
	let next = 0;

	const dismiss = (id: number) => (toasts = toasts.filter((t) => t.id !== id));

	/** `action`: a button in the toast (e.g. "Open", which the web only allows in a click). */
	export function toast(text: string, kind: Toast['kind'] = 'info', action?: Action) {
		const id = next++;
		toasts.push({ id, text, kind, action });
		setTimeout(() => dismiss(id), kind === 'error' || action ? 8000 : 3000);
	}
</script>

<script lang="ts">
	import { prefersReducedMotion } from 'svelte/motion';
	import { fly } from 'svelte/transition';
</script>

<!-- Each toast is its own live region: errors interrupt (alert), the rest wait (status). -->
<div class="fixed right-4 bottom-4 z-(--z-toast) flex flex-col items-end gap-2">
	{#each toasts as t (t.id)}
		<div
			role={t.kind === 'error' ? 'alert' : 'status'}
			transition:fly={{ y: 8, duration: prefersReducedMotion.current ? 0 : 150 }}
			class={[
				'flex max-w-sm items-center gap-3 rounded-lg px-3 py-2 text-sm shadow-lg backdrop-blur',
				t.kind === 'error' ? 'bg-red-50/95 text-red-800 dark:bg-red-950/90 dark:text-red-200' : 'bg-stone-900/90 text-stone-50 dark:bg-stone-100/90 dark:text-stone-900'
			]}
		>
			<span class="min-w-0">{t.text}</span>
			{#if t.action}
				{@const action = t.action}
				<button class="shrink-0 rounded-md px-1.5 py-0.5 font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400" onclick={() => (dismiss(t.id), action.run())}>{action.label}</button>
			{/if}
		</div>
	{/each}
</div>
