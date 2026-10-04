<!--
	ColorPicker recipe.
	- Swatches: a bits-ui RadioGroup (one tab stop, arrow keys move, Space/Enter picks, labelled).
	- "Custom": a bits-ui Popover with a saturation/value area (pointer + arrow keys),
	  a hue slider, a hex field, the EyeDropper API when available, and recent colours.
	Value is a #rrggbb string (bindable). Swatch `value`s may be any id (e.g. palette keys).
-->
<script lang="ts" module>
	export interface Swatch {
		value: string;
		/** CSS colour shown. */
		color: string;
		label: string;
	}
	const recentStore: string[] = [];
</script>

<script lang="ts">
	import { Popover, RadioGroup, Slider } from 'bits-ui';
	import { untrack } from 'svelte';
	import { scale } from 'svelte/transition';
	import { cn } from './cn';
	import { contrastText, hexToHsv, hsvToHex, isHex, type Hsv } from './color';

	let {
		value = $bindable(),
		swatches,
		label = 'Colour',
		custom = true,
		size = 'md',
		onValueChange,
		class: className
	}: {
		value: string;
		swatches: Swatch[];
		label?: string;
		/** Offer a custom colour (popover). Default true. */
		custom?: boolean;
		size?: 'sm' | 'md';
		onValueChange?: (v: string) => void;
		class?: string;
	} = $props();

	const set = (v: string) => {
		value = v;
		onValueChange?.(v);
	};
	const isCustom = $derived(!swatches.some((s) => s.value === value));
	const dot = $derived(size === 'sm' ? 'size-5' : 'size-6');

	// ── custom colour state ──────────────────────────────────────────────
	let open = $state(false);
	let hsv = $state<Hsv>(hexToHsv(isHex(value) ? value : '#e8d9b5'));
	let hexText = $state(untrack(() => hsvToHex(hsv)));
	let recent = $state<string[]>(recentStore);
	$effect(() => {
		if (open && isHex(value)) {
			hsv = hexToHsv(value);
			hexText = value;
		}
	});
	const hex = $derived(hsvToHex(hsv));
	function apply(next: Hsv) {
		hsv = next;
		hexText = hsvToHex(next);
		set(hexText);
	}
	function remember() {
		if (!isHex(value)) return;
		const list = [value, ...recent.filter((c) => c !== value)].slice(0, 8);
		recent = list;
		recentStore.splice(0, recentStore.length, ...list);
	}

	let area: HTMLDivElement | null = $state(null);
	function pickArea(e: PointerEvent) {
		if (!area) return;
		const r = area.getBoundingClientRect();
		const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
		const v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
		apply({ ...hsv, s, v });
	}
	function areaKeys(e: KeyboardEvent) {
		const step = e.shiftKey ? 0.1 : 0.02;
		const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
		if (!d) return;
		e.preventDefault();
		apply({ ...hsv, s: Math.min(1, Math.max(0, hsv.s + d[0])), v: Math.min(1, Math.max(0, hsv.v + d[1])) });
	}
	const hasEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window;
	async function eyedrop() {
		try {
			const res = await new (window as unknown as { EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper().open();
			if (isHex(res.sRGBHex)) apply(hexToHsv(res.sRGBHex));
		} catch {
			/* cancelled */
		}
	}
</script>

<div class={cn('flex flex-wrap items-center gap-1.5', className)}>
	<RadioGroup.Root
		aria-label={label}
		orientation="horizontal"
		loop
		value={isCustom ? '' : value}
		onValueChange={(v) => v && set(v)}
		class="flex flex-wrap items-center gap-1.5"
	>
		{#each swatches as s (s.value)}
			<RadioGroup.Item
				value={s.value}
				aria-label={s.label}
				title={s.label}
				class={cn('grid place-items-center rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)] ring-offset-2 ring-offset-white transition outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-blue-500 data-[state=checked]:ring-2 data-[state=checked]:ring-stone-800 dark:ring-offset-stone-900 dark:data-[state=checked]:ring-stone-100', dot)}
				style="background:{s.color};color:{contrastText(s.color.startsWith('#') ? s.color : '#ffffff')}"
			>
				{#snippet children({ checked })}{#if checked}<span class="icon-[lucide--check] size-3"></span>{/if}{/snippet}
			</RadioGroup.Item>
		{/each}
	</RadioGroup.Root>

	{#if custom}
		<Popover.Root bind:open onOpenChange={(o) => !o && isCustom && remember()}>
			<Popover.Trigger
				aria-label="Custom colour"
				title="Custom colour"
				class={cn('grid place-items-center rounded-full ring-offset-2 ring-offset-white outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:ring-offset-stone-900', dot, isCustom && 'ring-2 ring-stone-800 dark:ring-stone-100')}
				style={isCustom && isHex(value) ? `background:${value}` : 'background:conic-gradient(red,yellow,lime,aqua,blue,magenta,red)'}
			>
				{#if !isCustom}<span class="size-2.5 rounded-full bg-white"></span>{/if}
			</Popover.Trigger>
			<Popover.Portal>
				<Popover.Content sideOffset={8} forceMount>
					{#snippet child({ wrapperProps, props, open: o })}
						{#if o}
							<div {...wrapperProps}>
								<div {...props} transition:scale={{ start: 0.96, duration: 120 }} class="z-50 w-60 space-y-3 rounded-xl border border-stone-200 bg-white p-3 shadow-xl outline-none dark:border-stone-700 dark:bg-stone-900">
									<!-- Saturation / value area -->
									<div
										bind:this={area}
										role="slider"
										tabindex="0"
										aria-label="Saturation and brightness"
										aria-valuetext="saturation {Math.round(hsv.s * 100)}%, brightness {Math.round(hsv.v * 100)}%"
										aria-valuenow={Math.round(hsv.s * 100)}
										class="relative h-32 cursor-crosshair touch-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
										style="background: linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl({hsv.h} 100% 50%)"
										onpointerdown={(e) => {
											(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
											pickArea(e);
										}}
										onpointermove={(e) => e.buttons && pickArea(e)}
										onkeydown={areaKeys}
									>
										<span class="pointer-events-none absolute size-3.5 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-white shadow" style="left:{hsv.s * 100}%;bottom:{hsv.v * 100}%;background:{hex}"></span>
									</div>
									<!-- Hue -->
									<Slider.Root type="single" min={0} max={359} step={1} value={hsv.h} onValueChange={(h) => apply({ ...hsv, h })} aria-label="Hue" class="relative flex h-4 touch-none items-center">
										<span class="h-2.5 w-full rounded-full" style="background:linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)"></span>
										<Slider.Thumb index={0} class="block size-4 rounded-full border-2 border-white shadow outline-none focus-visible:ring-2 focus-visible:ring-blue-500" style="background:hsl({hsv.h} 100% 50%)" />
									</Slider.Root>
									<div class="flex items-center gap-2">
										<span class="size-7 shrink-0 rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]" style="background:{hex}"></span>
										<label class="flex flex-1 items-center rounded-md border border-stone-300 px-2 font-mono text-xs dark:border-stone-700">
											<span class="sr-only">Hex</span>
											<input
												class="w-full bg-transparent py-1.5 outline-none"
												value={hexText}
												spellcheck="false"
												maxlength={7}
												oninput={(e) => {
													const v = e.currentTarget.value.trim();
													hexText = v;
													const h = v.startsWith('#') ? v : `#${v}`;
													if (isHex(h)) apply(hexToHsv(h));
												}}
											/>
										</label>
										{#if hasEyeDropper}
											<button type="button" class="grid size-7 place-items-center rounded-md hover:bg-stone-100 dark:hover:bg-stone-800" title="Pick from screen" aria-label="Pick a colour from the screen" onclick={eyedrop}><span class="icon-[lucide--pipette] size-4"></span></button>
										{/if}
									</div>
									{#if recent.length}
										<div>
											<p class="mb-1 text-[11px] text-stone-500">Recent</p>
											<div class="flex flex-wrap gap-1">
												{#each recent as c (c)}
													<button type="button" aria-label="Use {c}" title={c} class="size-5 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)] outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-blue-500" style="background:{c}" onclick={() => apply(hexToHsv(c))}></button>
												{/each}
											</div>
										</div>
									{/if}
								</div>
							</div>
						{/if}
					{/snippet}
				</Popover.Content>
			</Popover.Portal>
		</Popover.Root>
	{/if}
</div>
