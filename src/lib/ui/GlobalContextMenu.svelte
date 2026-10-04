<!-- Renders the app-wide context menu (see context-menu.svelte.ts) at the cursor. -->
<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import { scale } from 'svelte/transition';
	import Kbd from './Kbd.svelte';
	import { contextMenuState as menu, type MenuItem } from './context-menu.svelte';

	// A zero-size virtual element at the click position.
	const anchor = $derived({ getBoundingClientRect: () => DOMRect.fromRect({ x: menu.x, y: menu.y, width: 0, height: 0 }) });
	const content = 'z-[60] min-w-52 rounded-xl border border-stone-200 bg-white p-1 text-[13px] text-stone-800 shadow-xl outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100';
	const row = 'flex h-8 cursor-default items-center gap-2 rounded-md px-2 outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-stone-100 dark:data-[highlighted]:bg-stone-800';
</script>

{#snippet entries(items: MenuItem[])}
	{#each items as item, i (i)}
		{#if item.separatorBefore}<DropdownMenu.Separator class="my-1 h-px bg-stone-200 dark:bg-stone-700" />{/if}
		{#if item.heading}<div class="px-2 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-stone-400 uppercase">{item.heading}</div>{/if}
		{#if item.items}
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger class={row} disabled={item.disabled}>
					{@render lead(item)}
					<span class="flex-1">{item.label}</span>
					<span class="icon-[lucide--chevron-right] size-3.5 text-stone-400"></span>
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent class={content} sideOffset={6}>
					{@render entries(item.items)}
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
		{:else}
			<DropdownMenu.Item class="{row} {item.danger ? 'text-red-600 dark:text-red-400' : ''}" disabled={item.disabled} onSelect={() => item.onSelect?.()}>
				{@render lead(item)}
				<span class="flex-1">{item.label}</span>
				{#if item.checked}<span class="icon-[lucide--check] size-3.5"></span>{/if}
				{#if item.shortcut}<Kbd>{item.shortcut}</Kbd>{/if}
			</DropdownMenu.Item>
		{/if}
	{/each}
{/snippet}

{#snippet lead(item: MenuItem)}
	{#if item.color}<span class="size-3 shrink-0 rounded-full ring-1 ring-black/10" style:background={item.color}></span>
	{:else}<span class="{item.icon ?? ''} size-4 shrink-0 text-stone-500"></span>{/if}
{/snippet}

<DropdownMenu.Root bind:open={menu.open}>
	<DropdownMenu.Portal>
		<DropdownMenu.Content customAnchor={anchor} side="bottom" align="start" sideOffset={2} forceMount>
			{#snippet child({ wrapperProps, props, open })}
				{#if open}
					<div {...wrapperProps}>
						<div {...props} transition:scale={{ start: 0.97, duration: 100 }} class={content}>
							{@render entries(menu.items)}
						</div>
					</div>
				{/if}
			{/snippet}
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>
