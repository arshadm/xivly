<script module lang="ts">
	type Toast = { id: number; text: string; kind: 'info' | 'error' };
	let toasts = $state<Toast[]>([]);
	let next = 0;

	export function toast(text: string, kind: Toast['kind'] = 'info') {
		const id = next++;
		toasts.push({ id, text, kind });
		setTimeout(() => (toasts = toasts.filter((t) => t.id !== id)), kind === 'error' ? 8000 : 3000);
	}
</script>

<script lang="ts">
	import { fly } from 'svelte/transition';
</script>

<div class="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-2">
	{#each toasts as t (t.id)}
		<div
			transition:fly={{ y: 8, duration: 150 }}
			class={[
				'max-w-sm rounded-lg px-3 py-2 text-sm shadow-lg backdrop-blur',
				t.kind === 'error' ? 'bg-red-50/95 text-red-800 dark:bg-red-950/90 dark:text-red-200' : 'bg-stone-900/90 text-stone-50 dark:bg-stone-100/90 dark:text-stone-900'
			]}
		>
			{t.text}
		</div>
	{/each}
</div>
