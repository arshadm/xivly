<!-- The active annotation color (a note's emoji with the note tool) as one button; the choices open in a popover. -->
<script lang="ts">
	import { iconButton } from '#lib/ui/button.js';
	import { Popover } from 'bits-ui';
	import { scale } from 'svelte/transition';
	import { Annotations, AnnotationsContext } from 'svelte-pdf-mini';
	import Tip from '../ui/Tip.svelte';
	import { emojiChip, noteEmojiLabel } from './note-emoji';

	let { class: className }: { class?: string } = $props();
	const store = AnnotationsContext.get();
	const current = $derived(store.palette.find((c) => c.key === store.color) ?? store.palette[0]);
	const emoji = $derived(store.pickingNoteEmoji);
</script>

<Popover.Root>
	<Tip label={emoji ? 'Note emoji' : 'Color'}>
		{#snippet child({ props })}
			<Popover.Trigger {...props} aria-label={emoji ? 'Note emoji' : 'Annotation color'} class={iconButton(7, className)}>
				{#if emoji}
					<span class="font-emoji text-[15px] leading-none">{store.noteEmoji}</span>
				{:else}
					<span class="size-4 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)]" style:background={current?.light}></span>
				{/if}
			</Popover.Trigger>
		{/snippet}
	</Tip>
	<Popover.Portal>
		<Popover.Content sideOffset={6} forceMount>
			{#snippet child({ wrapperProps, props, open })}
				{#if open}
					<div {...wrapperProps}>
						<div {...props} transition:scale={{ start: 0.96, duration: 110 }} class="z-(--z-menu) flex gap-1.5 rounded-xl border border-stone-200 bg-white p-2 shadow-xl dark:border-stone-700 dark:bg-stone-900">
							{#if emoji}
								{#each store.noteEmojis.slice(0, 8) as e, i (i)}
									<Tip label={noteEmojiLabel(e)} shortcut={String(i + 1)}>
										{#snippet child({ props: tip })}<Annotations.NoteEmoji {...tip} emoji={e} class={emojiChip} />{/snippet}
									</Tip>
								{/each}
							{:else}
								{#each store.palette.slice(0, 9) as c, i (c.key)}
									<Tip label={c.label} shortcut={String(i + 1)}>
										{#snippet child({ props: tip })}
											<Annotations.Color {...tip} color={c.key} class="size-5 rounded-full bg-(--swatch) shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)] ring-offset-[1.5px] ring-offset-white data-[active]:ring-[1.5px] data-[active]:ring-stone-800 dark:ring-offset-stone-900 dark:data-[active]:ring-stone-100" />
										{/snippet}
									</Tip>
								{/each}
							{/if}
						</div>
					</div>
				{/if}
			{/snippet}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
