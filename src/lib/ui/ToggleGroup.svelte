<!-- Segmented control (bits-ui ToggleGroup, single value). -->
<script lang="ts" generics="T extends string">
	import { ToggleGroup } from 'bits-ui';
	import { cn } from './cn';

	let {
		value = $bindable(),
		items,
		label,
		class: className,
		onValueChange
	}: { value?: T; items: { value: T; label: string; icon?: string; title?: string }[]; label: string; class?: string; onValueChange?: (v: T) => void } = $props();
</script>

<ToggleGroup.Root
	type="single"
	aria-label={label}
	bind:value={() => value ?? '', (v) => { if (v) { value = v as T; onValueChange?.(v as T); } }}
	class={cn('inline-flex rounded-lg bg-stone-200/60 p-0.5 dark:bg-stone-800', className)}
>
	{#each items as item (item.value)}
		<ToggleGroup.Item
			value={item.value}
			title={item.title}
			aria-label={item.label || item.title}
			class="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-stone-600 transition-colors hover:text-stone-900 data-[state=on]:bg-white data-[state=on]:text-stone-900 data-[state=on]:shadow-sm dark:text-stone-400 dark:hover:text-stone-100 dark:data-[state=on]:bg-stone-600 dark:data-[state=on]:text-white"
		>
			{#if item.icon}<span class={cn(item.icon, 'size-3.5')}></span>{/if}
			{#if !item.icon || item.label}<span class={item.icon ? 'sr-only sm:not-sr-only' : ''}>{item.label}</span>{/if}
		</ToggleGroup.Item>
	{/each}
</ToggleGroup.Root>
