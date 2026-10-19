<!--
	The notes' bar while a drawing is being edited: the style of the selected
	shapes (or of the next ones), arrowheads, order, the look, the view, export.
	Its buttons never take the focus from the drawing (mousedown is kept from
	them), so the drawing stays active; colours and fonts open a row below.
-->
<script lang="ts">
	import { mac } from '#lib/os.js';
	import { theme } from '#lib/theme.svelte.js';
	import { iconButton } from '#lib/ui/button.js';
	import Separator from '#lib/ui/Separator.svelte';
	import Tip from '#lib/ui/Tip.svelte';
	import type { DrawingTools } from './active.svelte';
	import { color, FONTS, PALETTE } from './render';
	import { SIZES, WIDTHS, type Dash, type FillStyle, type Font } from './scene';

	let { tools, canUndo, canRedo }: { tools: DrawingTools; canUndo: () => boolean; canRedo: () => boolean } = $props();

	/** The row of choices open below the bar. */
	let open = $state<'stroke' | 'fill' | 'font' | null>(null);
	const style = $derived(tools.style());
	const kinds = $derived(tools.kinds());
	const heads = $derived(tools.heads());
	const some = $derived(kinds.size > 0);
	/** Text shows: a text shape or a label, or nothing selected (the next shape's). */
	const hasText = $derived(!some || kinds.has('text') || kinds.has('rect') || kinds.has('ellipse') || kinds.has('diamond') || kinds.has('line'));
	const fillable = $derived(!some || kinds.has('rect') || kinds.has('ellipse') || kinds.has('diamond'));

	const mod = mac ? '⌘' : 'Ctrl+';
	const shift = mac ? '⇧' : 'Shift+';
	const btn = iconButton(7, 'data-[active]:bg-stone-200 dark:data-[active]:bg-stone-700');
	const keep = (e: MouseEvent) => e.preventDefault();
	const toggle = (row: NonNullable<typeof open>) => (open = open === row ? null : row);
	const swatch = (c: string, as: 'stroke' | 'fill') => (c === 'none' ? 'transparent' : color(c, as, theme.dark));

	const WIDTH_LABELS = ['Thin', 'Medium', 'Bold'];
	const DASHES: { dash: Dash; label: string; icon: string }[] = [
		{ dash: 'solid', label: 'Solid', icon: 'icon-[lucide--minus]' },
		{ dash: 'dashed', label: 'Dashed', icon: 'icon-[lucide--ellipsis]' },
		{ dash: 'dotted', label: 'Dotted', icon: 'icon-[lucide--grip-horizontal]' }
	];
	const FILLS: { fill: FillStyle; label: string; icon: string }[] = [
		{ fill: 'hachure', label: 'Hatched', icon: 'icon-[lucide--slash]' },
		{ fill: 'cross', label: 'Cross-hatched', icon: 'icon-[lucide--hash]' },
		{ fill: 'solid', label: 'Solid', icon: 'icon-[lucide--square]' }
	];
	const SIZE_LABELS = ['S', 'M', 'L', 'XL'];
</script>

{#snippet item(label: string, icon: string, on: () => void, opts: { active?: boolean; disabled?: boolean; keys?: string } = {})}
	<Tip {label} shortcut={opts.keys}>
		{#snippet child({ props })}
			<button {...props} type="button" class={btn} aria-label={label} aria-pressed={opts.active === undefined ? undefined : opts.active} data-active={opts.active || undefined} disabled={opts.disabled} onmousedown={keep} onclick={on}>
				<span class="{icon} size-4"></span>
			</button>
		{/snippet}
	</Tip>
{/snippet}

<div class="flex min-w-0 flex-1 flex-col" data-drawing-bar>
	<div class="flex flex-wrap items-center gap-0.5">
		<span class="mr-1 text-[11px] font-medium tracking-wide text-muted uppercase">Drawing</span>
		<Tip label="Line colour and style">
			{#snippet child({ props })}
				<button {...props} type="button" class={btn} aria-label="Line colour and style" aria-expanded={open === 'stroke'} data-active={open === 'stroke' || undefined} onmousedown={keep} onclick={() => toggle('stroke')}>
					<span class="size-4 rounded-full border-[3px]" style:border-color={swatch(style.stroke, 'stroke')}></span>
				</button>
			{/snippet}
		</Tip>
		{#if fillable}
			<Tip label="Fill">
				{#snippet child({ props })}
					<button {...props} type="button" class={btn} aria-label="Fill" aria-expanded={open === 'fill'} data-active={open === 'fill' || undefined} onmousedown={keep} onclick={() => toggle('fill')}>
						<span class="size-4 rounded-sm border border-stone-400 {style.fill === 'none' ? 'fill-none-swatch' : ''}" style:background={swatch(style.fill, 'fill')}></span>
					</button>
				{/snippet}
			</Tip>
		{/if}
		{#if hasText}
			<Tip label="Text: font and size">
				{#snippet child({ props })}
					<button {...props} type="button" class="{btn} w-auto! px-1.5 text-[13px]" aria-label="Text: font and size" aria-expanded={open === 'font'} data-active={open === 'font' || undefined} onmousedown={keep} onclick={() => toggle('font')} style:font-family={FONTS[style.font].family}>Aa</button>
				{/snippet}
			</Tip>
		{/if}
		{#if heads}
			<Separator class="mx-1" />
			{@render item('Arrowhead at the start', 'icon-[lucide--move-left]', () => tools.setHeads([!heads[0], heads[1]]), { active: heads[0] })}
			{@render item('Arrowhead at the end', 'icon-[lucide--move-right]', () => tools.setHeads([heads[0], !heads[1]]), { active: heads[1] })}
		{/if}
		{#if some}
			<Separator class="mx-1" />
			{@render item('Bring to front', 'icon-[lucide--bring-to-front]', () => tools.reorder('front'), { keys: `${mod}${shift}]` })}
			{@render item('Send to back', 'icon-[lucide--send-to-back]', () => tools.reorder('back'), { keys: `${mod}${shift}[` })}
			{@render item('Duplicate', 'icon-[lucide--copy-plus]', () => tools.duplicate(), { keys: `${mod}D` })}
			{@render item('Delete', 'icon-[lucide--trash-2]', () => tools.remove(), { keys: '⌫' })}
		{/if}
		<Separator class="mx-1" />
		{@render item(tools.sketch() ? 'Hand-drawn (switch to clean lines)' : 'Clean lines (switch to hand-drawn)', tools.sketch() ? 'icon-[lucide--pen-tool]' : 'icon-[lucide--ruler]', () => tools.setSketch(!tools.sketch()), { active: tools.sketch() })}
		{@render item('Fit the drawing', 'icon-[lucide--maximize]', () => tools.fit(), { keys: `${shift}1` })}
		{@render item('Save as PNG', 'icon-[lucide--image-down]', () => void tools.save('png'))}
		{@render item('Save as SVG', 'icon-[lucide--file-code]', () => void tools.save('svg'))}
		<Separator class="mx-1" />
		{@render item('Undo', 'icon-[lucide--undo-2]', () => tools.undo(), { disabled: !canUndo(), keys: `${mod}Z` })}
		{@render item('Redo', 'icon-[lucide--redo-2]', () => tools.redo(), { disabled: !canRedo(), keys: `${mod}${shift}Z` })}
		{@render item('Done: back to the text', 'icon-[lucide--corner-down-left]', () => tools.exit(), { keys: 'Esc' })}
	</div>
	{#if open}
		<div class="flex flex-wrap items-center gap-1 py-1" role="group" aria-label={open === 'stroke' ? 'Line' : open === 'fill' ? 'Fill' : 'Text'}>
			{#if open === 'font'}
				{#each Object.entries(FONTS) as [key, f] (key)}
					<button type="button" class="rounded-md px-2 py-0.5 text-[13px] hover:bg-stone-200/70 aria-pressed:bg-stone-200 dark:hover:bg-stone-800 dark:aria-pressed:bg-stone-700" style:font-family={f.family} aria-pressed={style.font === key} onmousedown={keep} onclick={() => tools.setStyle({ font: key as Font })}>{f.label}</button>
				{/each}
				<Separator class="mx-1" />
				{#each SIZES as size, i (size)}
					<Tip label="Text size {SIZE_LABELS[i]}">
						{#snippet child({ props })}
							<button {...props} type="button" class="{btn} text-[11px] font-semibold" aria-label="Text size {SIZE_LABELS[i]}" aria-pressed={style.size === size} data-active={style.size === size || undefined} onmousedown={keep} onclick={() => tools.setStyle({ size })}>{SIZE_LABELS[i]}</button>
						{/snippet}
					</Tip>
				{/each}
			{:else}
				{@const as = open}
				{#if as === 'fill'}
					<button type="button" class="fill-none-swatch size-5 rounded-full border border-stone-300 ring-offset-1 aria-pressed:ring-2 aria-pressed:ring-sky-500 dark:border-stone-600" aria-label="No fill" title="No fill" aria-pressed={style.fill === 'none'} onmousedown={keep} onclick={() => tools.setStyle({ fill: 'none' })}></button>
				{/if}
				{#each PALETTE as p (p.key)}
					{@const current = as === 'stroke' ? style.stroke : style.fill}
					<button type="button" class="size-5 rounded-full border border-black/10 ring-offset-1 ring-offset-white aria-pressed:ring-2 aria-pressed:ring-sky-500 dark:border-white/10 dark:ring-offset-stone-900" style:background={swatch(p.key, as)} aria-label={p.label} title={p.label} aria-pressed={current === p.key} onmousedown={keep} onclick={() => tools.setStyle(as === 'stroke' ? { stroke: p.key } : { fill: p.key })}></button>
				{/each}
				{#if as === 'stroke'}
					<Separator class="mx-1" />
					{#each WIDTHS as w, i (w)}
						<Tip label="{WIDTH_LABELS[i]} line">
							{#snippet child({ props })}
								<button {...props} type="button" class={btn} aria-label="{WIDTH_LABELS[i]} line" aria-pressed={style.width === w} data-active={style.width === w || undefined} onmousedown={keep} onclick={() => tools.setStyle({ width: w })}>
									<span class="w-4 rounded-full bg-current" style:height="{w + 0.5}px"></span>
								</button>
							{/snippet}
						</Tip>
					{/each}
					<Separator class="mx-1" />
					{#each DASHES as d (d.dash)}
						{@render item(`${d.label} line`, d.icon, () => tools.setStyle({ dash: d.dash }), { active: style.dash === d.dash })}
					{/each}
				{/if}
				{#if as === 'fill'}
					<Separator class="mx-1" />
					{#each FILLS as f (f.fill)}
						{@render item(`${f.label} fill`, f.icon, () => tools.setStyle({ fillStyle: f.fill, ...(style.fill === 'none' ? { fill: 'blue' } : {}) }), { active: style.fill !== 'none' && style.fillStyle === f.fill })}
					{/each}
				{/if}
			{/if}
		</div>
	{/if}
</div>

<style>
	.fill-none-swatch {
		background: linear-gradient(to top right, transparent calc(50% - 1px), #e03131 calc(50% - 1px), #e03131 calc(50% + 1px), transparent calc(50% + 1px)) !important;
	}
</style>
