<!-- Select recipe (bits-ui Select) for short option lists. -->
<script lang="ts" generics="T extends string">
	import { Select } from 'bits-ui';
	import { scale } from 'svelte/transition';

	let { value, items, label, onValueChange }: { value: T; items: { value: T; label: string }[]; label: string; onValueChange: (v: T) => void } = $props();
	const current = $derived(items.find((i) => i.value === value)?.label ?? value);
</script>

<Select.Root type="single" {value} onValueChange={(v) => v && onValueChange(v as T)} {items}>
	<Select.Trigger aria-label={label} class="inline-flex h-8 min-w-36 items-center justify-between gap-2 rounded-md border border-stone-300 bg-white px-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400 dark:border-stone-700 dark:bg-stone-900">
		{current}<span class="icon-[lucide--chevrons-up-down] size-3.5 text-stone-400"></span>
	</Select.Trigger>
	<Select.Portal>
		<Select.Content sideOffset={4} forceMount class="z-(--z-menu)">
			{#snippet child({ wrapperProps, props, open })}
				{#if open}
					<div {...wrapperProps}>
						<div {...props} transition:scale={{ start: 0.97, duration: 100 }} class="z-(--z-menu) min-w-40 rounded-xl border border-stone-200 bg-white p-1 text-[13px] text-stone-800 dark:text-stone-100 shadow-xl dark:border-stone-700 dark:bg-stone-900">
							{#each items as item (item.value)}
								<Select.Item value={item.value} label={item.label} class="flex cursor-default items-center justify-between gap-3 rounded-md px-2 py-1.5 outline-none data-[highlighted]:bg-stone-100 dark:data-[highlighted]:bg-stone-800">
									{#snippet children({ selected })}{item.label}{#if selected}<span class="icon-[lucide--check] size-3.5"></span>{/if}{/snippet}
								</Select.Item>
							{/each}
						</div>
					</div>
				{/if}
			{/snippet}
		</Select.Content>
	</Select.Portal>
</Select.Root>
