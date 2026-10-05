<!--
	New category (or edit one): a color and a name. The swatch steps through the
	palette colors not used yet; the palette button opens the system color picker.
-->
<script lang="ts" module>
	export const categoryDialog = $state({ open: false, id: null as string | null });
	/** Open for a new category, or to edit `id`. */
	export const showCategoryDialog = (id: string | null = null) => Object.assign(categoryDialog, { open: true, id });
</script>

<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { paperColors } from 'svelte-pdf-mini';
	import { untrack } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { categoryColor, library } from '$lib/library.svelte';
	import type { CategoryColor } from '$lib/types';
	import { button } from '$lib/ui/button';
	import Tip from '$lib/ui/Tip.svelte';
	import { toast } from './Toasts.svelte';

	const editing = $derived(categoryDialog.id ? library.category(categoryDialog.id) : undefined);
	let name = $state('');
	let color = $state<CategoryColor>('sage');
	let picker = $state<HTMLInputElement>();

	/** Palette colors no category uses yet (all of them once every one is taken). */
	const presets = $derived.by(() => {
		const used = new Set(library.categories.filter((c) => c.id !== categoryDialog.id).map((c) => c.color));
		const free = paperColors.filter((p) => !used.has(p.name as CategoryColor));
		return (free.length ? free : paperColors).map((p) => p.name as CategoryColor);
	});
	const custom = $derived(!paperColors.some((p) => p.name === color));
	const label = (c: CategoryColor) => (c.startsWith('#') ? 'Custom color' : c[0].toUpperCase() + c.slice(1));

	// Fresh values each time it opens.
	$effect(() => {
		if (!categoryDialog.open) return;
		untrack(() => {
			name = editing?.name ?? '';
			color = editing?.color ?? presets[0];
		});
	});

	function nextPreset() {
		const i = presets.indexOf(color);
		color = presets[(i + 1) % presets.length];
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		const value = name.trim();
		if (!value) return;
		try {
			if (editing) await library.editCategory(editing.id, { name: value, color });
			else library.view = { kind: 'category', id: await library.addCategory(value, color) };
			categoryDialog.open = false;
		} catch (err) {
			toast(String(err), 'error');
		}
	}
</script>

<Dialog.Root bind:open={categoryDialog.open}>
	<Dialog.Portal>
		<Dialog.Overlay forceMount>
			{#snippet child({ props, open })}
				{#if open}<div {...props} transition:fade={{ duration: 150 }} class="fixed inset-0 z-(--z-dialog) bg-stone-950/30 backdrop-blur-[2px]"></div>{/if}
			{/snippet}
		</Dialog.Overlay>
		<Dialog.Content forceMount>
			{#snippet child({ props, open })}
				{#if open}
					<form {...props} onsubmit={submit} transition:scale={{ start: 0.97, duration: 150 }} class="fixed top-1/2 left-1/2 z-(--z-dialog) w-[min(400px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 text-stone-800 shadow-2xl outline-none dark:bg-stone-900 dark:text-stone-100">
						<Dialog.Title class="font-serif text-lg">{editing ? 'Edit category' : 'New category'}</Dialog.Title>
						<div class="mt-4 flex items-center gap-2">
							<Tip label="{label(color)} (click for another)">
								{#snippet child({ props })}
									<button {...props} type="button" aria-label="Color: {label(color)}" onclick={nextPreset} class="grid size-8 shrink-0 place-items-center rounded-lg bg-stone-100 outline-none hover:bg-stone-200/80 focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:bg-stone-800 dark:hover:bg-stone-700">
										<span class="size-4 rounded-full ring-1 ring-black/10" style:background={categoryColor(color).accent}></span>
									</button>
								{/snippet}
							</Tip>
							<Tip label="Pick any color">
								{#snippet child({ props })}
									<button {...props} type="button" aria-label="Pick any color" onclick={() => picker?.click()} class="relative grid size-8 shrink-0 place-items-center rounded-lg outline-none hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:hover:bg-stone-800 {custom ? 'bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-100' : 'text-stone-500'}">
										<span class="icon-[lucide--pipette] size-4"></span>
										<input bind:this={picker} type="color" tabindex="-1" aria-hidden="true" class="pointer-events-none absolute inset-0 opacity-0" value={categoryColor(color).accent} oninput={(e) => (color = e.currentTarget.value as CategoryColor)} />
									</button>
								{/snippet}
							</Tip>
							<!-- svelte-ignore a11y_autofocus -->
							<input bind:value={name} autofocus placeholder="Name, e.g. Robotics" aria-label="Name" class="h-8 min-w-0 flex-1 rounded-lg bg-stone-100 px-2.5 text-[13px] outline-none placeholder:text-stone-400 focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:bg-stone-800" />
						</div>
						<div class="mt-5 flex justify-end gap-2">
							<Dialog.Close type="button" class={button('secondary')}>Cancel</Dialog.Close>
							<button type="submit" class={button('primary')} disabled={!name.trim()}>{editing ? 'Save' : 'Create'}</button>
						</div>
					</form>
				{/if}
			{/snippet}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
