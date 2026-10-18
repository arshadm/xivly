<!--
	A linked paper beside a notebook's text: its pages to read (no annotating here: that's
	the reader's, in its own window), at a page when asked; zoomed and scrolled as in the
	reader (pinch or ⌘-wheel, the zoom buttons, Continuous / Paged / Horizontal). A PDF still downloading (a
	synced folder) or missing says so, as the reader does.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { comboLabel, Document, PageNav, pageThemes, paperHex, Viewer, Zoom, type KeymapAction, type ScrollMode, type ViewerState } from 'svelte-pdf-mini';
	import { anchorAt, jumpTo } from '#lib/anchor.js';
	import { library } from '#lib/library.svelte.js';
	import { onDiskChange } from '#lib/disk-changes.js';
	import { platform } from '#lib/platform/index.js';
	import { settings } from '#lib/settings.svelte.js';
	import { theme } from '#lib/theme.svelte.js';
	import type { PaperAnchor } from '#lib/types.js';
	import { icons } from '#lib/pdf/icons.js';
	import { button, iconButton } from '#lib/ui/button.js';
	import CycleButton, { type CycleOption } from '#lib/ui/CycleButton.svelte';
	import Separator from '#lib/ui/Separator.svelte';
	import Tip from '#lib/ui/Tip.svelte';
	import ZoomSelect from '#lib/ui/ZoomSelect.svelte';

	let { paperId, page }: { paperId: string; page?: number } = $props();

	const paper = $derived(library.get(paperId));
	const s = $derived(settings.values);
	const paperColor = $derived(s.tintPages ? library.color(paper).name : s.pageColor);
	const pageTheme = $derived(paperColor === 'white' && !theme.dark ? pageThemes.none() : pageThemes.paper({ color: paperHex(paperColor, theme.dark), dark: theme.dark, strength: s.paperStrength }));

	let viewer = $state<ViewerState>();
	let bytes = $state.raw<Uint8Array | null>(null);
	let load = $state<{ status: 'loading' | 'ready' | 'missing' | 'error'; error?: string }>({ status: 'loading' });
	let slow = $state(false);
	let attempt = $state(0);
	const source = $derived(bytes && { data: bytes, transfer: true as const });

	$effect(() => {
		const id = paperId;
		void attempt;
		const repo = library.repo;
		untrack(() => {
			[bytes, load, slow] = [null, { status: 'loading' }, false];
			const explain = setTimeout(() => (slow = true), 3000);
			repo
				?.readPdf(id)
				.then((b) => {
					if (id !== paperId) return;
					bytes = b;
					load = { status: b ? 'ready' : 'missing' };
				})
				.catch((e) => id === paperId && (load = { status: 'error', error: e instanceof Error ? e.message : String(e) }))
				.finally(() => clearTimeout(explain));
		});
	});
	// A PDF that wasn't there yet (still downloading): shown once it arrives.
	$effect(() => onDiskChange((paths) => load.status !== 'ready' && load.status !== 'loading' && paths.includes(`papers/${paperId}/paper.pdf`) && attempt++));

	/** Go to a page (a chip with a page was clicked). */
	export function jump(to: number) {
		if (viewer) void jumpTo(viewer, { page: to });
	}

	/** Where the paper is being read, for a chip to this page. */
	export const anchor = (): PaperAnchor | null => (viewer?.document.status === 'ready' ? anchorAt(viewer.position) : null);

	const scrollModes: CycleOption<ScrollMode>[] = [
		{ value: 'vertical', label: 'Continuous', icon: 'icon-[lucide--move-vertical]' },
		{ value: 'page', label: 'Paged', icon: 'icon-[lucide--gallery-vertical]' },
		{ value: 'horizontal', label: 'Horizontal', icon: 'icon-[lucide--move-horizontal]' }
	];
	const iconBtn = iconButton(7);
	/** A viewer shortcut's label ("⌘+"), from its keymap. */
	const viewKey = (action: KeymapAction) => (viewer ? comboLabel(viewer.keymap, action) : undefined);

	function opened() {
		if (page && viewer) void viewer.restorePosition(page);
	}
</script>

{#if load.status === 'ready' && source}
	{#key source}
		<Document.Root src={source} onLoad={opened}>
			<Viewer.Root
				bind:viewer
				{pageTheme}
				pageFrame={s.pageFrame}
				theme={theme.dark ? 'dark' : 'light'}
				zoomMode="page-width"
				minZoom={0.4}
				maxZoom={3}
				overscan={1}
				bind:scrollMode={() => s.notebookScrollMode, (v) => settings.set('notebookScrollMode', v)}
				smoothZoom={s.smoothZoom}
				wheelZoom={s.wheelZoom}
				keyboard
				class="flex h-full min-h-0 flex-col"
			>
				<div class="@container flex h-9 shrink-0 items-center gap-1 border-b border-stone-200 px-2 dark:border-stone-800">
					<Tip label="Previous page" shortcut={viewKey('nav.prevPage')}>{#snippet child({ props })}<PageNav.Prev {...props} class={iconBtn}><span class="{icons.up} size-4"></span></PageNav.Prev>{/snippet}</Tip>
					<PageNav.Input class="h-6 w-10 shrink-0 rounded-md bg-black/5 text-center text-xs tabular-nums dark:bg-white/10" />
					<span class="hidden shrink-0 px-1 text-xs text-muted tabular-nums @xs:inline">/ {viewer?.document.numPages ?? '–'}</span>
					<Tip label="Next page" shortcut={viewKey('nav.nextPage')}>{#snippet child({ props })}<PageNav.Next {...props} class={iconBtn}><span class="{icons.down} size-4"></span></PageNav.Next>{/snippet}</Tip>
					<div class="min-w-1 flex-1"></div>
					<Tip label="Zoom out" shortcut={viewKey('view.zoomOut')}>{#snippet child({ props })}<Zoom.Out {...props} class={iconBtn}><span class="{icons.zoomOut} size-4"></span></Zoom.Out>{/snippet}</Tip>
					{#if viewer}<ZoomSelect {viewer} class="hidden h-7 w-28 shrink-0 border-transparent bg-black/5 text-xs @sm:inline-flex dark:bg-white/10" />{/if}
					<Tip label="Zoom in" shortcut={viewKey('view.zoomIn')}>{#snippet child({ props })}<Zoom.In {...props} class={iconBtn}><span class="{icons.zoomIn} size-4"></span></Zoom.In>{/snippet}</Tip>
					<Separator />
					<CycleButton title="Scrolling" options={scrollModes} value={s.notebookScrollMode} onchange={(v) => settings.set('notebookScrollMode', v)} />
				</div>
				<Viewer.Viewport class="min-h-0 flex-1 bg-stone-100 dark:bg-stone-950 [--pdf-page-gap:14px] [--pdf-pages-padding:14px]" aria-label="Pages of {paper?.title ?? 'the paper'}">
					<Viewer.Pages>
						{#snippet children({ pageNumber })}
							<Viewer.Page {pageNumber}>
								<Viewer.Canvas />
								<Viewer.TextLayer />
								<Viewer.LinkLayer class="[&_a]:rounded-sm [&_a:hover]:bg-sky-500/10" />
							</Viewer.Page>
						{/snippet}
					</Viewer.Pages>
				</Viewer.Viewport>
			</Viewer.Root>
		</Document.Root>
	{/key}
{:else if load.status === 'loading'}
	<div class="grid h-full place-items-center px-6 text-center text-xs text-muted">
		{#if slow}<p class="max-w-xs">Still opening… If the library is in Google Drive, the PDF may be downloading (the first time it's opened).</p>{/if}
	</div>
{:else}
	<div class="grid h-full place-items-center px-6 text-center text-sm text-muted">
		<div>
			<p class="text-stone-700 dark:text-stone-300">{load.status === 'missing' ? 'This paper’s PDF is missing from its folder.' : 'The PDF couldn’t be opened.'}</p>
			{#if load.error}<p class="mt-1 max-w-md text-xs">{load.error}</p>{/if}
			{#if platform.onDisk}<p class="mx-auto mt-3 max-w-xs text-xs">In a synced folder, it may not have arrived yet: it shows as soon as it's there.</p>{/if}
			<button class="{button('secondary')} mt-4" onclick={() => attempt++}>Try again</button>
		</div>
	</div>
{/if}
