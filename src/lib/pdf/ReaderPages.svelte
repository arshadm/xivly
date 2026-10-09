<!--
	The reader's page area: the pages (with their right-click menu), the section
	rail, Back, the center control and the minimap. Inside the reader's Viewer,
	Paper and Annotations roots (it reads them from context).
-->
<script lang="ts">
	import { slide, fade } from 'svelte/transition';
	import { Annotations, Find, Minimap, Paper, Toc, Viewer, type PaperState, type PdfAction, type PdfContext, type Reference } from 'svelte-pdf-mini';
	import { settings } from '#lib/settings.svelte.js';
	import { saveFile } from '#lib/windows.js';
	import BackPill from './BackPill.svelte';
	import CenterControl from './CenterControl.svelte';
	import PdfContextMenu from './PdfContextMenu.svelte';

	let {
		swatch,
		restoring,
		paperState,
		centerLocked = $bindable(false),
		openReference,
		moreActions
	}: {
		/** The page color (behind frameless pages, and the minimap). */
		swatch: string;
		/** Pages hidden while the reading position is restored. */
		restoring: boolean;
		paperState?: PaperState;
		centerLocked?: boolean;
		openReference: (r: Reference) => void;
		moreActions: (ctx: PdfContext) => Partial<Record<'selection' | 'page', PdfAction[]>>;
	} = $props();
	const s = $derived(settings.values);
</script>

<div class="flex min-h-0 min-w-0 flex-1">
	<div class="relative min-w-0 flex-1">
		<PdfContextMenu onOpenReference={openReference} {saveFile} {moreActions}>
			{#snippet trigger({ props })}
				<Viewer.Viewport {...props} style={s.pageFrame === 'none' ? `background:${swatch}` : undefined} class="h-full bg-stone-100 transition-colors dark:bg-stone-950 [--pdf-page-gap:22px] [--pdf-pages-padding:28px] {s.sideNotes ? '[--pdf-pages-aside:252px]' : ''}">
					<Viewer.Pages class={restoring ? 'opacity-0' : 'transition-opacity duration-150'}>
						{#snippet children({ pageNumber })}
							<Viewer.Page {pageNumber}>
								<Viewer.Canvas />
								<Viewer.TextLayer />
								<Viewer.LinkLayer class="[&_a]:rounded-sm [&_a:hover]:bg-sky-500/10" />
								<Find.Layer />
								<Paper.Layer />
								<Annotations.Layer />
								{#if s.lineMarkers}<Annotations.LineMarkers markers="all" />{/if}
								{#if s.sideNotes}<Annotations.Margin edge={s.tocRail ? 36 : 8} class="[--pdf-margin-width:220px]" />{/if}
								<Viewer.Focus />
							</Viewer.Page>
						{/snippet}
					</Viewer.Pages>
				</Viewer.Viewport>
			{/snippet}
		</PdfContextMenu>
		{#if s.tocRail}<Toc.Rail class="absolute top-8 right-3 bottom-8 text-muted" />{/if}
		<BackPill />
		<CenterControl bind:locked={centerLocked} />
		{#if paperState?.status === 'analyzing'}
			<div class="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-stone-900/70 px-3 py-1 text-xs text-white" transition:fade>Reading the paper… {Math.round(paperState.progress * 100)}%</div>
		{/if}
	</div>

	{#if s.minimap}
		<div transition:slide={{ axis: 'x', duration: 160 }} class="flex shrink-0">
			<Minimap.Root style="background:{swatch}" variant={s.minimapVariant} width={s.minimapVariant === 'heatmap' ? 18 : s.minimapVariant === 'spine' ? 120 : 84} class="h-full border-l border-stone-200 dark:border-stone-800">
				{#if s.minimapVariant === 'heatmap'}<Minimap.Heatmap />{/if}
				<Minimap.Viewport class="rounded-sm! bg-sky-500/10! shadow-[inset_0_0_0_var(--hairline)_rgb(14_165_233/0.5)]!" />
				{#if s.minimapVariant !== 'heatmap'}<Minimap.Markers find annotations sections={s.minimapVariant !== 'spine'} />{/if}
			</Minimap.Root>
		</div>
	{/if}
</div>
