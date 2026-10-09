<!--
	Context menu for a viewer, built from the library's headless pieces:
	viewer.lastContext (what was right-clicked) + contextActions() (what to offer),
	rendered with bits-ui's ContextMenu. Shortcuts come from the active keymap.
-->
<script lang="ts">
	import { ContextMenu } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { AnnotationsContext, PaperContext, ViewerContext, contextActions, layoutExtractor, type PdfAction, type PdfActionGroup, type PdfContext, type Reference } from 'svelte-pdf-mini';
	import Kbd from '../ui/Kbd.svelte';

	let {
		trigger,
		onOpenReference,
		saveFile,
		pageActions
	}: {
		trigger: Snippet<[{ props: Record<string, unknown> }]>;
		onOpenReference?: (r: Reference) => void;
		saveFile?: (file: Blob, name: string) => unknown;
		/** The app's own actions for the right-clicked page (bookmark it…), under "Page". */
		pageActions?: (ctx: PdfContext) => PdfAction[];
	} = $props();
	const viewer = ViewerContext.get();
	const store = AnnotationsContext.getOr(null);
	const paper = PaperContext.getOr(null);
	const extractor = layoutExtractor((n) => viewer.document.getPageText(n));
	const groups = $derived.by(() => {
		const ctx = viewer.lastContext;
		if (!ctx) return [];
		const out: PdfActionGroup[] = contextActions(ctx, { viewer, annotations: store, paper, extractor, onOpenReference, saveFile });
		const extra = pageActions?.(ctx) ?? [];
		if (!extra.length) return out;
		const page = out.find((g) => g.kind === 'page');
		return page ? out.map((g) => (g === page ? { ...g, actions: [...g.actions, ...extra] } : g)) : [...out, { kind: 'page' as const, actions: extra }];
	});
	// WebKit (the desktop app) clears a text selection whenever focus moves outside
	// it, and the menu focuses each item under the pointer: keep the right-clicked
	// selection while the menu is open, so it stays visible and actions still see it.
	let kept: Range | null = null;
	const restore = () => {
		const sel = getSelection();
		if (!kept || !sel || !sel.isCollapsed) return;
		sel.removeAllRanges();
		sel.addRange(kept);
	};
	// Off the pages (the gray around them) there's nothing to act on: let the
	// right-click through to the app's menu for this window instead.
	const onPagesOnly = (props: Record<string, unknown>) => ({
		...props,
		oncontextmenu: (e: MouseEvent) => {
			const keyboard = e.button !== 2 && e.clientX === 0 && e.clientY === 0; // Menu key / Shift+F10
			if (!keyboard && !(e.target as Element | null)?.closest?.('[data-pdf-page]')) return;
			const sel = getSelection();
			kept = sel && !sel.isCollapsed ? sel.getRangeAt(0).cloneRange() : null;
			(props.oncontextmenu as ((e: MouseEvent) => void) | undefined)?.(e);
		}
	});
	const run = (action: PdfAction) => {
		restore();
		kept = null; // the action may clear the selection (e.g. after highlighting): don't bring it back
		action.run?.();
	};
	const titles: Record<string, string> = { selection: 'Selection', annotation: 'Annotation', citation: 'Citation', figure: 'Figure', link: 'Link', page: 'Page' };
	const item =
		'flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-[13px] outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-stone-100 dark:data-[highlighted]:bg-stone-800';
	const content = 'z-(--z-menu) max-h-[85vh] min-w-52 overflow-y-auto overscroll-contain rounded-xl border border-stone-200 bg-white p-1 text-[13px] text-stone-800 shadow-xl dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100';
</script>

{#snippet entry(action: PdfAction, checkable = false)}
	{#if action.items?.length}
		<ContextMenu.Sub>
			<ContextMenu.SubTrigger class={item} disabled={action.disabled}>
				<span class="flex-1">{action.label}</span>
				{#if action.keys}<Kbd>{action.keys}</Kbd>{/if}
				<span class="icon-[lucide--chevron-right] size-3.5 text-stone-400"></span>
			</ContextMenu.SubTrigger>
			<ContextMenu.SubContent class={content} sideOffset={6}>
				{#each action.items as sub (sub.id)}{@render entry(sub, action.items.some((x) => x.checked !== undefined))}{/each}
			</ContextMenu.SubContent>
		</ContextMenu.Sub>
	{:else}
		<ContextMenu.Item class="{item} {action.danger ? 'text-red-600 data-[highlighted]:bg-red-50! dark:text-red-400 dark:data-[highlighted]:bg-red-950/50!' : ''}" disabled={action.disabled} onSelect={() => run(action)}>
			{#if action.color}<span class="swatch size-3.5 rounded-full" style:--swatch={action.color}></span>{/if}
			<!-- Font entries show their label in their own font. -->
			<span class="flex-1" style:font-family={action.font}>{action.label}</span>
			{#if action.keys}<Kbd>{action.keys}</Kbd>{/if}
			<!-- Check marks share the last column, after any shortcut, so they line up. -->
			{#if checkable}<span class="size-3.5 shrink-0 {action.checked ? 'icon-[lucide--check]' : ''}"></span>{/if}
		</ContextMenu.Item>
	{/if}
{/snippet}

<svelte:document onselectionchange={restore} />

<ContextMenu.Root onOpenChange={(open) => !open && (kept = null)}>
	<ContextMenu.Trigger>
		{#snippet child({ props })}{@render trigger({ props: onPagesOnly(props) })}{/snippet}
	</ContextMenu.Trigger>
	<ContextMenu.Portal>
		<ContextMenu.Content class={content}>
			{#each groups as group, gi (group.kind)}
				{#if gi > 0}<ContextMenu.Separator class="my-1 h-px bg-stone-200 dark:bg-stone-700" />{/if}
				<ContextMenu.Group>
					<ContextMenu.GroupHeading class="px-2 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-muted uppercase">{group.kind === 'figure' && viewer.lastContext?.figure ? viewer.lastContext.figure.label : titles[group.kind]}</ContextMenu.GroupHeading>
					{#each group.actions as action (action.id)}{@render entry(action, group.actions.some((x) => x.checked !== undefined))}{/each}
				</ContextMenu.Group>
			{/each}
			{#if !groups.length}<div class="px-2 py-1.5 text-[13px] text-muted">…</div>{/if}
		</ContextMenu.Content>
	</ContextMenu.Portal>
</ContextMenu.Root>
