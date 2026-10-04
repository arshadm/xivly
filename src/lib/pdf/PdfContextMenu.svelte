<!--
	Context menu for a viewer, built from the library's headless pieces:
	viewer.lastContext (what was right-clicked) + contextActions() (what to offer),
	rendered with bits-ui's ContextMenu. Shortcuts come from the active keymap.
-->
<script lang="ts">
	import { ContextMenu } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { AnnotationsContext, PaperContext, ViewerContext, contextActions, layoutExtractor, type PdfAction, type Reference } from 'svelte-pdf-mini';
	import Kbd from '../ui/Kbd.svelte';

	let { trigger, onOpenReference, saveFile }: { trigger: Snippet<[{ props: Record<string, unknown> }]>; onOpenReference?: (r: Reference) => void; saveFile?: (file: Blob, name: string) => unknown } = $props();
	const viewer = ViewerContext.get();
	const store = AnnotationsContext.getOr(null);
	const paper = PaperContext.getOr(null);
	const extractor = layoutExtractor((n) => viewer.document.getPageText(n));
	const groups = $derived(viewer.lastContext ? contextActions(viewer.lastContext, { viewer, annotations: store, paper, extractor, onOpenReference, saveFile }) : []);
	const titles: Record<string, string> = { selection: 'Selection', annotation: 'Annotation', citation: 'Citation', figure: 'Figure', link: 'Link', page: 'Page' };
	const item =
		'flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-[13px] outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-stone-100 dark:data-[highlighted]:bg-stone-800';
	const content = 'z-50 min-w-56 rounded-xl border border-stone-200 bg-white p-1 shadow-xl dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100';
</script>

{#snippet entry(action: PdfAction)}
	{#if action.items?.length}
		<ContextMenu.Sub>
			<ContextMenu.SubTrigger class={item} disabled={action.disabled}>
				<span class="flex-1">{action.label}</span>
				{#if action.keys}<Kbd>{action.keys}</Kbd>{/if}
				<span class="icon-[lucide--chevron-right] size-3.5 text-stone-400"></span>
			</ContextMenu.SubTrigger>
			<ContextMenu.SubContent class={content} sideOffset={6}>
				{#each action.items as sub (sub.id)}{@render entry(sub)}{/each}
			</ContextMenu.SubContent>
		</ContextMenu.Sub>
	{:else}
		<ContextMenu.Item class="{item} {action.danger ? 'text-red-600 dark:text-red-400' : ''}" disabled={action.disabled} onSelect={() => action.run?.()}>
			{#if action.color}<span class="size-3.5 rounded-full ring-1 ring-black/10" style:background={action.color}></span>{/if}
			<span class="flex-1">{action.label}</span>
			{#if action.checked}<span class="icon-[lucide--check] size-3.5"></span>{/if}
			{#if action.keys}<Kbd>{action.keys}</Kbd>{/if}
		</ContextMenu.Item>
	{/if}
{/snippet}

<ContextMenu.Root>
	<ContextMenu.Trigger>
		{#snippet child({ props })}{@render trigger({ props })}{/snippet}
	</ContextMenu.Trigger>
	<ContextMenu.Portal>
		<ContextMenu.Content class={content}>
			{#each groups as group, gi (group.kind)}
				{#if gi > 0}<ContextMenu.Separator class="my-1 h-px bg-stone-200 dark:bg-stone-700" />{/if}
				<ContextMenu.Group>
					<ContextMenu.GroupHeading class="px-2 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-stone-400 uppercase">{group.kind === 'figure' && viewer.lastContext?.figure ? viewer.lastContext.figure.label : titles[group.kind]}</ContextMenu.GroupHeading>
					{#each group.actions as action (action.id)}{@render entry(action)}{/each}
				</ContextMenu.Group>
			{/each}
			{#if !groups.length}<div class="px-2 py-1.5 text-[13px] text-stone-400">…</div>{/if}
		</ContextMenu.Content>
	</ContextMenu.Portal>
</ContextMenu.Root>
