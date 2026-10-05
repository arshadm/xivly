<!--
	Annotation toolbar recipe: headless Annotations.* parts inside a bits-ui Toolbar
	(one tab stop, arrow keys move, Home/End) with tooltips showing the store's keymap
	shortcut. Composition: Tip → Toolbar.Button → our part, each through `child`.
-->
<script lang="ts">
	import { iconButton } from '$lib/ui/button';
	import Separator from '$lib/ui/Separator.svelte';
	import { Toolbar } from 'bits-ui';
	import { Annotations, AnnotationsContext, comboLabel, type AnnotationTool, type KeymapAction } from 'svelte-pdf-mini';
	import Tip from '../ui/Tip.svelte';
	import CompactColor from './CompactColor.svelte';
	import { cn } from '../ui/cn';
	import { icons, toolIcons } from './icons';

	let {
		tools = ['select', 'hand', 'highlight', 'underline', 'area', 'note', 'ink', 'arrow', 'rect', 'freetext', 'eraser'] as AnnotationTool[],
		colors = true,
		history = true,
		label = 'Annotation tools',
		class: className
	}: { tools?: AnnotationTool[]; colors?: boolean; history?: boolean; label?: string; class?: string } = $props();
	const store = AnnotationsContext.get();
	// The current tool looks inked, not just pressed.
	const btn = iconButton(7, 'data-[active]:bg-stone-900 data-[active]:text-white dark:data-[active]:bg-stone-100 dark:data-[active]:text-stone-900');
	const names: Record<string, string> = { select: 'Select', hand: 'Pan', highlight: 'Highlight', underline: 'Underline', strikeout: 'Strike out', squiggly: 'Squiggly', area: 'Box', note: 'Note', ink: 'Pen', rect: 'Box', ellipse: 'Ellipse', line: 'Line', arrow: 'Arrow', freetext: 'Text', eraser: 'Eraser' };
	const key = (a: string) => (a in store.keymap ? comboLabel(store.keymap, a as KeymapAction) : undefined);
</script>

<Toolbar.Root class={cn('flex min-w-0 flex-nowrap items-center gap-0.5', className)} aria-label={label}>
	{#each tools as t (t)}
		<Tip label={names[t]} shortcut={key(`tool.${t}`)}>
			{#snippet child({ props: tip })}
				<Toolbar.Button {...tip}>
					{#snippet child({ props })}
						<Annotations.Tool tool={t} {...props} class={btn}><span class="{toolIcons[t]} size-4" aria-hidden="true"></span></Annotations.Tool>
					{/snippet}
				</Toolbar.Button>
			{/snippet}
		</Tip>
	{/each}
	{#if colors}
		<Separator class="mx-1" />
		<!-- Narrow windows: one color button with a popover (the toolbar row is a @container). -->
		<CompactColor class="@4xl:hidden" />
		<!-- Colors: one roving group; the selected chip's ring stays inside the gap (gap 6px, ring 1.5 + 1.5px). -->
		<div class="hidden shrink-0 items-center gap-1.5 px-1 @4xl:flex" role="group" aria-label="Color">
			{#each store.palette.slice(0, 9) as c, i (c.key)}
				<Tip label={c.label} shortcut={String(i + 1)}>
					{#snippet child({ props: tip })}
						<Toolbar.Button {...tip}>
							{#snippet child({ props })}
								<Annotations.Color
									color={c.key}
									{...props}
									class="size-5 rounded-full bg-(--swatch) shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)] outline-none ring-offset-[1.5px] ring-offset-white focus-visible:ring-[1.5px] focus-visible:ring-blue-500 data-[active]:ring-[1.5px] data-[active]:ring-stone-800 dark:ring-offset-stone-900 dark:data-[active]:ring-stone-100"
								/>
							{/snippet}
						</Toolbar.Button>
					{/snippet}
				</Tip>
			{/each}
		</div>
	{/if}
	{#if history}
		<Separator class="mx-1" />
		<Tip label="Undo" shortcut={key('undo')}>
			{#snippet child({ props: tip })}
				<Toolbar.Button {...tip}>
					{#snippet child({ props })}<Annotations.Undo {...props} class={btn}><span class="{icons.undo} size-4" aria-hidden="true"></span></Annotations.Undo>{/snippet}
				</Toolbar.Button>
			{/snippet}
		</Tip>
		<Tip label="Redo" shortcut={key('redo')}>
			{#snippet child({ props: tip })}
				<Toolbar.Button {...tip}>
					{#snippet child({ props })}<Annotations.Redo {...props} class={btn}><span class="{icons.redo} size-4" aria-hidden="true"></span></Annotations.Redo>{/snippet}
				</Toolbar.Button>
			{/snippet}
		</Tip>
	{/if}
</Toolbar.Root>
