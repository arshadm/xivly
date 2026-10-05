<!--
	A button that steps through a few modes: click for the next one, ⇧-click for
	the previous one. Replaces a menu of radio items; the tooltip names the mode
	now and the one a click gives.
-->
<script lang="ts" module>
	export interface CycleOption<V> {
		value: V;
		label: string;
		/** Iconify class (`icon-[lucide--…]`). */
		icon?: string;
	}
</script>

<script lang="ts" generics="T">
	import { iconButton } from './button';
	import { cn } from './cn';
	import Tip from './Tip.svelte';

	let {
		title,
		options,
		value,
		onchange,
		showLabel = false,
		shortcut,
		class: className = ''
	}: {
		/** What is being chosen ("Pages per row"). */
		title: string;
		options: CycleOption<T>[];
		value: T;
		onchange: (value: T) => void;
		/** Show the mode's name next to its icon (or alone, without one). */
		showLabel?: boolean;
		shortcut?: string;
		class?: string;
	} = $props();

	const index = $derived(Math.max(0, options.findIndex((o) => o.value === value)));
	const current = $derived(options[index]);
	const next = $derived(options[(index + 1) % options.length]);
</script>

<Tip label="{title}: {current.label} (click for {next.label})" {shortcut}>
	{#snippet child({ props })}
		<button
			{...props}
			type="button"
			aria-label="{title}: {current.label}"
			class={cn(iconButton(7), showLabel && 'inline-flex w-auto gap-1.5 px-2 text-xs', className)}
			onclick={(e) => onchange(options[(index + (e.shiftKey ? options.length - 1 : 1)) % options.length].value)}
		>
			{#if current.icon}<span class="{current.icon} size-4 shrink-0"></span>{/if}
			{#if showLabel}<span class="truncate">{current.label}</span>{/if}
		</button>
	{/snippet}
</Tip>
