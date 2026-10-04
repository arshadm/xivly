<!-- Reading theme: day/night, paper colour, strength and page edge (bound to settings). -->
<script lang="ts">
	import { Popover } from 'bits-ui';
	import { scale } from 'svelte/transition';
	import { settings, type PageFrame } from '$lib/settings.svelte';
	import { theme } from '$lib/theme.svelte';
	import Switch from '$lib/ui/Switch.svelte';
	import Slider from '$lib/ui/Slider.svelte';
	import Tip from '$lib/ui/Tip.svelte';
	import ToggleGroup from '$lib/ui/ToggleGroup.svelte';
	import { cn } from '$lib/ui/cn';

	let { swatch, class: className }: { swatch: string; class?: string } = $props();
	const s = $derived(settings.values);
</script>

<Popover.Root>
	<Tip label="Reading theme">
		{#snippet child({ props })}
			<Popover.Trigger {...props} aria-label="Reading theme" class={cn('grid size-7 place-items-center rounded-md outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-blue-500/60 data-[state=open]:bg-black/10 dark:hover:bg-white/10 dark:data-[state=open]:bg-white/15', className)}>
				<span class="size-4 rounded-full shadow-[inset_0_0_0_1.5px_rgb(0_0_0/0.25)]" style:background={swatch}></span>
			</Popover.Trigger>
		{/snippet}
	</Tip>
	<Popover.Portal>
		<Popover.Content sideOffset={8} align="end" forceMount>
			{#snippet child({ wrapperProps, props, open })}
				{#if open}
					<div {...wrapperProps}>
						<div {...props} transition:scale={{ start: 0.96, duration: 120 }} class="z-50 w-76 space-y-4 rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-800 shadow-xl outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
							<div class="flex items-center justify-between">
								<span class="font-medium">Reading theme</span>
								<ToggleGroup label="Day or night" value={theme.dark ? 'night' : 'day'} onValueChange={(v) => settings.set('theme', v === 'night' ? 'dark' : 'light')} items={[{ value: 'day', label: 'Day', icon: 'icon-[lucide--sun]' }, { value: 'night', label: 'Night', icon: 'icon-[lucide--moon]' }]} />
							</div>
							<div class="flex items-center justify-between">
								<span class="text-xs text-stone-500">Category tint</span>
								<Switch label="Tint pages with the category colour" checked={s.tintPages} onCheckedChange={(v) => settings.set('tintPages', v)} />
							</div>
							<div class="space-y-1.5">
								<p class="flex justify-between text-xs text-stone-500"><span>Tint strength</span><span class="tabular-nums">{Math.round(s.paperStrength * 100)}%</span></p>
								<Slider disabled={!s.tintPages} label="Tint strength" value={s.paperStrength} onValueChange={(v) => settings.set('paperStrength', v)} class="w-full" />
							</div>
							<div class="space-y-1.5">
								<p class="text-xs text-stone-500">Page edge</p>
								<ToggleGroup label="Page edge" value={s.pageFrame} onValueChange={(v: PageFrame) => settings.set('pageFrame', v)} items={[{ value: 'rounded', label: 'Rounded' }, { value: 'shadow', label: 'Shadow' }, { value: 'border', label: 'Border' }, { value: 'flat', label: 'Flat' }]} />
							</div>
						</div>
					</div>
				{/if}
			{/snippet}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
