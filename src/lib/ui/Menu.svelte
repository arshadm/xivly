<!--
	Dropdown menu recipe (bits-ui DropdownMenu). Pass items, or use the `content` snippet with
	MenuItem-like markup. Animated with forceMount + transitions.
-->
<script lang="ts" module>
	export interface MenuItem {
		label: string;
		icon?: string;
		shortcut?: string;
		onSelect?: () => void;
		/** Checkable item (radio-like when `group` is set). */
		checked?: boolean;
		disabled?: boolean;
		separatorBefore?: boolean;
		heading?: string;
	}
</script>

<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { scale } from 'svelte/transition';
	import { cn } from './cn';
	import Kbd from './Kbd.svelte';

	let { trigger, items = [], align = 'end', class: className, triggerClass, label }: { trigger: Snippet; items?: MenuItem[]; align?: 'start' | 'end'; class?: string; triggerClass?: string; label?: string } = $props();
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger aria-label={label} class={cn('inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm text-stone-700 outline-none hover:bg-stone-200/70 focus-visible:ring-2 focus-visible:ring-blue-500/60 data-[state=open]:bg-stone-200/70 dark:text-stone-300 dark:hover:bg-stone-700/60 dark:data-[state=open]:bg-stone-700/60', triggerClass)}>
		{@render trigger()}
	</DropdownMenu.Trigger>
	<DropdownMenu.Portal>
		<DropdownMenu.Content {align} sideOffset={6} forceMount>
			{#snippet child({ wrapperProps, props, open })}
				{#if open}
					<div {...wrapperProps}>
						<div {...props} transition:scale={{ start: 0.96, duration: 120 }} class={cn('z-50 max-h-[70vh] min-w-52 overflow-y-auto rounded-lg border border-stone-200 bg-white p-1 text-sm shadow-xl outline-none dark:border-stone-700 dark:bg-stone-900', className)}>
							{#each items as item, i (i)}
								{#if item.separatorBefore}<DropdownMenu.Separator class="my-1 h-px bg-stone-200 dark:bg-stone-700" />{/if}
								{#if item.heading}<div class="px-2 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-stone-400 uppercase">{item.heading}</div>{/if}
								<DropdownMenu.Item
									disabled={item.disabled}
									onSelect={item.onSelect}
									class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-stone-100 dark:data-[highlighted]:bg-stone-800"
								>
									<span class={cn(item.icon ?? (item.checked ? 'icon-[lucide--check]' : ''), 'size-4 shrink-0 text-stone-500')}></span>
									<span class="flex-1">{item.label}</span>
									{#if item.shortcut}<Kbd>{item.shortcut}</Kbd>{/if}
								</DropdownMenu.Item>
							{/each}
						</div>
					</div>
				{/if}
			{/snippet}
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>
