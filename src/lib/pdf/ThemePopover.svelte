<!-- Reading theme: appearance (system / light / dark), paper color, strength and page edge (bound to settings). -->
<script lang="ts">
	import { iconButton } from '#lib/ui/button.js';
	import { Popover } from 'bits-ui';
	import { scale } from 'svelte/transition';
	import { settings, type PageFrame } from '#lib/settings.svelte.js';
	import Switch from '#lib/ui/Switch.svelte';
	import Slider from '#lib/ui/Slider.svelte';
	import Tip from '#lib/ui/Tip.svelte';
	import ToggleGroup from '#lib/ui/ToggleGroup.svelte';
	import { theme } from '#lib/theme.svelte.js';
	import { paperHex, paperSwatches } from 'svelte-pdf-mini';

	let { swatch, class: className }: { swatch: string; class?: string } = $props();
	const s = $derived(settings.values);
</script>

<Popover.Root>
	<Tip label="Reading theme">
		{#snippet child({ props })}
			<Popover.Trigger {...props} aria-label="Reading theme" class={iconButton(7, className)}>
				<span class="swatch size-4 rounded-full" style:--swatch={swatch}></span>
			</Popover.Trigger>
		{/snippet}
	</Tip>
	<Popover.Portal>
		<Popover.Content sideOffset={8} align="end" forceMount>
			{#snippet child({ wrapperProps, props, open })}
				{#if open}
					<div {...wrapperProps}>
						<div {...props} transition:scale={{ start: 0.96, duration: 120 }} class="z-(--z-menu) w-76 space-y-4 rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-800 shadow-xl outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
							<div class="flex items-center justify-between">
								<span class="font-medium">Reading theme</span>
								<ToggleGroup label="Appearance" value={s.theme} onValueChange={(v) => settings.set('theme', v)} items={[{ value: 'system', label: '', title: 'System', icon: 'icon-[lucide--monitor]' }, { value: 'light', label: '', title: 'Light', icon: 'icon-[lucide--sun]' }, { value: 'dark', label: '', title: 'Dark', icon: 'icon-[lucide--moon]' }]} />
							</div>
							<div class="flex items-center justify-between">
								<span class="text-xs text-muted">Color from the category</span>
								<Switch label="Tint pages with the category color" checked={s.tintPages} onCheckedChange={(v) => settings.set('tintPages', v)} />
							</div>
							{#if !s.tintPages}
								<div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Page color">
									{#each paperSwatches as sw (sw.value)}
										<Tip label={sw.label}>
											{#snippet child({ props })}
												<button
													{...props}
													role="radio"
													aria-checked={s.pageColor === sw.value}
													aria-label={sw.label}
													class="swatch size-6 rounded-full ring-offset-2 ring-offset-white aria-checked:ring-2 aria-checked:ring-stone-700 dark:ring-offset-stone-900 dark:aria-checked:ring-stone-200"
													style:--swatch={paperHex(sw.value, theme.dark)}
													onclick={() => settings.set('pageColor', sw.value)}
												></button>
											{/snippet}
										</Tip>
									{/each}
								</div>
							{/if}
							<div class="space-y-1.5">
								<p class="flex justify-between text-xs text-muted"><span>Tint strength</span><span class="tabular-nums">{Math.round(s.paperStrength * 100)}%</span></p>
								<Slider disabled={!s.tintPages && s.pageColor === 'white'} label="Tint strength" value={s.paperStrength} onValueChange={(v) => settings.set('paperStrength', v)} class="w-full" />
							</div>
							<div class="space-y-1.5">
								<p class="text-xs text-muted">Page edge</p>
								<ToggleGroup label="Page edge" value={s.pageFrame} onValueChange={(v: PageFrame) => settings.set('pageFrame', v)} items={[{ value: 'rounded', label: 'Rounded' }, { value: 'shadow', label: 'Shadow' }, { value: 'border', label: 'Border' }, { value: 'flat', label: 'Flat' }, { value: 'none', label: 'None', title: 'No edge: the page color fills the window' }]} />
							</div>
						</div>
					</div>
				{/if}
			{/snippet}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
