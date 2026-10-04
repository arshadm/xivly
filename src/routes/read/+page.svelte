<script lang="ts">
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { fade, fly, scale, slide } from 'svelte/transition';
	import {
		Annotations,
		Document,
		Find,
		Minimap,
		PageNav,
		Paper,
		Thumbnails,
		Toc,
		Viewer,
		Zoom,
		defaultCitationProvider,
		pageThemes,
		paperColors,
		sectionAt,
		shortcutGroups,
		type AnnotationTool,
		type Annotation,
		type AnnotationStore,
		type FindMatch,
		type PaperState,
		type Reference,
		type ViewerState
	} from 'svelte-pdf-mini';
	import { exportPdfInWorker } from '$lib/export';
	import { onFlush } from '$lib/flush';
	import { library } from '$lib/library.svelte';
	import { paperMenu } from '$lib/paper-menu';
	import { platform } from '$lib/platform';
	import { settings } from '$lib/settings.svelte';
	import { keys, matches, mod } from '$lib/shortcuts';
	import { theme } from '$lib/theme.svelte';
	import { askUnsaved, closeWindow, openPaper, saveFile, setWindowTitle, showLibrary } from '$lib/windows';
	import PaperDetails from '$lib/components/PaperDetails.svelte';
	import { settingsDialog } from '$lib/components/SettingsDialog.svelte';
	import { shortcutsHelp } from '$lib/components/ShortcutsHelp.svelte';
	import { toast } from '$lib/components/Toasts.svelte';
	import AnnotationToolbar from '$lib/pdf/AnnotationToolbar.svelte';
	import NoteHoverCard from '$lib/pdf/NoteHoverCard.svelte';
	import PdfContextMenu from '$lib/pdf/PdfContextMenu.svelte';
	import ThemePopover from '$lib/pdf/ThemePopover.svelte';
	import BackPill from '$lib/pdf/BackPill.svelte';
	import CenterControl from '$lib/pdf/CenterControl.svelte';
	import { icons } from '$lib/pdf/icons';
	import { paperHex } from '$lib/pdf/reading-theme.svelte';
	import Kbd from '$lib/ui/Kbd.svelte';
	import Separator from '$lib/ui/Separator.svelte';
	import Tabs from '$lib/ui/Tabs.svelte';
	import Tip from '$lib/ui/Tip.svelte';
	import ZoomSelect from '$lib/ui/ZoomSelect.svelte';
	import ZoomSlider from '$lib/ui/ZoomSlider.svelte';
	import { contextMenuState, setFallbackMenu, type MenuItem } from '$lib/ui/context-menu.svelte';
	import FocusEffect from '$lib/ui/focus/FocusEffect.svelte';

	const id = $derived(page.url.searchParams.get('id') ?? '');
	const paper = $derived(library.get(id));
	const s = $derived(settings.values);

	// ── Look: pages tinted with the paper colour (category or chosen) ─────
	const category = $derived(library.color(paper));
	// Pages take the category's matte colour (Settings › Page look can turn it off).
	const paperColor = $derived(s.tintPages ? category.name : 'white');
	const pageTheme = $derived(
		paperColor === 'white' && !theme.dark ? pageThemes.none() : pageThemes.paper({ color: paperHex(paperColor, theme.dark), dark: theme.dark, strength: s.paperStrength })
	);
	const swatch = $derived(pageTheme.background ?? '#ffffff');
	const accent = $derived((paperColors.find((c) => c.name === paperColor) ?? category).accent);
	// Opening zoom only: later zooming is the reader's business.
	const initialZoom = untrack(() => settings.values.zoomMode);

	let bytes = $state.raw<Uint8Array | null>(null);
	let viewer = $state<ViewerState>();
	let store = $state<AnnotationStore>();
	let paperState = $state<PaperState>();
	let annotations = $state<Annotation[]>([]);
	type Panel = 'contents' | 'pages' | 'figures' | 'references' | 'notes' | 'search' | 'info';
	let panel = $state<Panel>('contents');
	let panelOpen = $state(untrack(() => settings.values.sidePanel));
	let findInput = $state<HTMLInputElement | null>(null);
	let centreLocked = $state(false);

	// Annotation tools offered: highlight is the only text markup; one Box
	// tool, filled (area) or outlined (rect) per Settings › Annotations.
	const tools = $derived<AnnotationTool[]>(['select', 'hand', 'highlight', s.boxFill ? 'area' : 'rect', 'note', 'freetext', 'ink', 'arrow', 'eraser']);
	const keymap = $derived({ 'tool.area': s.boxFill ? ['b', 'a'] : [], 'tool.rect': s.boxFill ? [] : ['b', 'r'] });

	// `?` shows the reading & annotation keys of this paper too.
	$effect(() => {
		shortcutsHelp.pdf = () => (viewer ? shortcutGroups(viewer, store).map((g) => ({ title: g.title, items: g.items.map((i) => ({ label: i.label, keys: i.keys })) })) : []);
		return () => (shortcutsHelp.pdf = null);
	});

	const provider = $derived(s.citationLookup ? defaultCitationProvider({ semanticScholarKey: s.semanticScholarKey || undefined }) : undefined);

	$effect(() => void (paper && setWindowTitle(paper.title)));

	// Load the PDF when the paper changes; the list refreshing must not reload it.
	$effect(() => {
		const current = id;
		const repo = library.repo;
		untrack(() => {
			bytes = null;
			repo?.readPdf(current).then((b) => {
				if (current !== id) return;
				if (!b) toast('PDF not found', 'error');
				bytes = b;
			});
			library.touch(current, { opened: new Date().toISOString() }).catch(() => {});
		});
	});

	// Settings that live on the annotation store.
	$effect(() => {
		if (!store) return;
		store.annotationsVisible = s.annotationsVisible;
		store.notesVisible = s.sideNotes;
	});

	// ── Saving annotations into the PDF ──────────────────────────────────
	// Edits only mark the paper dirty; it's written on ⌘S, by the autosave
	// timer, or when the window closes. Export runs in a worker.
	let rev = $state(0);
	let savedRev = $state(0);
	let saving = $state(false);
	let chain: Promise<void> = Promise.resolve();
	const dirty = $derived(rev !== savedRev);

	function onAnnotationsChange(_: Annotation[], ops: unknown[]) {
		// `load` / import emit with no ops: nothing to save.
		if (ops.length) rev++;
	}

	function save(): Promise<void> {
		const target = { id, store, viewer, repo: library.repo };
		chain = chain.then(async () => {
			const r = rev;
			if (r === savedRev || !target.store || !target.viewer || !target.repo) return;
			saving = true;
			try {
				const data = await target.viewer.document.getData();
				const out = await exportPdfInWorker(data, $state.snapshot(target.store.annotations) as Annotation[], { producer: 'Xivly' });
				await target.repo.savePdf(target.id, out);
				savedRev = Math.max(savedRev, r);
			} catch (e) {
				toast(`Could not save: ${e}`, 'error');
			} finally {
				saving = false;
			}
		});
		return chain;
	}

	// Autosave on an interval (Settings › Saving).
	$effect(() => {
		const seconds = s.autosaveSeconds;
		if (!seconds) return;
		const timer = setInterval(() => rev !== savedRev && save(), seconds * 1000);
		return () => clearInterval(timer);
	});

	// Window close / quit: save, discard or cancel.
	$effect(() =>
		onFlush({
			dirty: () => rev !== savedRev,
			flush: async () => {
				const choice = settings.values.confirmUnsaved ? await askUnsaved(paper?.title ?? 'this paper') : 'save';
				if (choice === 'cancel') return false;
				if (choice === 'save') await save();
				else savedRev = rev;
				return rev === savedRev;
			}
		})
	);

	// Remember the reading position (no hook, debounced).
	let posTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		void viewer?.readingPoint;
		const target = id;
		clearTimeout(posTimer);
		posTimer = setTimeout(() => {
			if (viewer?.document.status === 'ready' && library.get(target)) library.touch(target, { position: Number(viewer.position.toFixed(2)) }).catch(() => {});
		}, 1500);
		return () => clearTimeout(posTimer);
	});

	// ── Panels, find, menus ──────────────────────────────────────────────
	async function openPanel(p: Panel) {
		panel = p;
		panelOpen = true;
		if (p === 'search') {
			await new Promise((r) => setTimeout(r, 30));
			findInput?.focus();
			findInput?.select();
		}
	}

	/** Find matches grouped by the section they fall in (find example). */
	function groups(found: FindMatch[]) {
		const out: { key: string; title: string; matches: FindMatch[] }[] = [];
		for (const m of found) {
			const sec = paperState?.sections.length && m.rect ? sectionAt(paperState.sections, m.page, m.rect[3]) : null;
			const key = sec?.id ?? `p${m.page}`;
			const title = sec ? [sec.number, sec.title].filter(Boolean).join(' ') : `Page ${m.page}`;
			const last = out.at(-1);
			if (last?.key === key) last.matches.push(m);
			else out.push({ key, title, matches: [m] });
		}
		return out;
	}

	/** A cited paper: into the library (arXiv) and open, else search it. */
	async function openReference(r: Reference) {
		const arxiv = r.parsed.arxivId;
		if (!arxiv) return platform.openUrl(`https://scholar.google.com/scholar?q=${encodeURIComponent(r.parsed.title ?? r.raw)}`);
		try {
			toast('Adding to your library…');
			const pid = await library.importArxiv(arxiv);
			if (pid) openPaper(pid, r.parsed.title ?? pid);
		} catch (e) {
			toast(String(e), 'error');
		}
	}

	async function exportAnnotatedPdf() {
		if (!store || !viewer) return;
		const out = await exportPdfInWorker(await viewer.document.getData(), $state.snapshot(store.annotations) as Annotation[], { producer: 'Xivly' });
		await saveFile(new Blob([out as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), `${id}.pdf`);
	}

	function exportNotes() {
		if (!store) return;
		const md = store.toMarkdown({ title: paper?.title, sections: paperState?.flatSections.map((x) => ({ title: x.title, page: x.page, y: x.y })) });
		return saveFile(new Blob([md], { type: 'text/markdown' }), `${id}-notes.md`);
	}

	const exportItems = (): MenuItem[] => [
		{ label: 'PDF with annotations…', icon: icons.download, onSelect: exportAnnotatedPdf },
		{ label: 'Notes as Markdown…', icon: 'icon-[lucide--file-text]', onSelect: exportNotes }
	];

	const viewItems = (): MenuItem[] => [
		{ label: 'Side panel', icon: icons.panel, shortcut: keys.panelAlt, checked: panelOpen, onSelect: () => (panelOpen = !panelOpen) },
		{ label: 'Minimap', icon: icons.map, shortcut: keys.minimap, checked: s.minimap, onSelect: () => settings.set('minimap', !s.minimap) },
		{ label: 'Section rail', icon: 'icon-[lucide--git-commit-vertical]', checked: s.tocRail, onSelect: () => settings.set('tocRail', !s.tocRail) },
		{ label: 'Reading progress', icon: 'icon-[lucide--minus]', checked: s.progressBar, onSelect: () => settings.set('progressBar', !s.progressBar) },
		{ label: 'Annotations', icon: icons.eye, checked: s.annotationsVisible, separatorBefore: true, onSelect: () => settings.set('annotationsVisible', !s.annotationsVisible) },
		{ label: 'Side notes', icon: icons.notes, checked: s.sideNotes, onSelect: () => settings.set('sideNotes', !s.sideNotes) },
		{ label: 'Line markers', icon: 'icon-[lucide--align-left]', checked: s.lineMarkers, onSelect: () => settings.set('lineMarkers', !s.lineMarkers) },
		{ label: 'Link previews', icon: 'icon-[lucide--scan-eye]', checked: s.linkPreviews, separatorBefore: true, onSelect: () => settings.set('linkPreviews', !s.linkPreviews) },
		{ label: 'Citation cards', icon: 'icon-[lucide--quote]', checked: s.citationCards, onSelect: () => settings.set('citationCards', !s.citationCards) }
	];

	const layoutItems = (): MenuItem[] => [
		{ heading: 'Pages per row', label: 'Single page', checked: s.columns === 1, onSelect: () => settings.set('columns', 1) },
		{ label: 'Spread (two pages)', shortcut: keys.spread, checked: s.columns === 2, onSelect: () => settings.set('columns', 2) },
		{ label: 'Auto (zoom out for more)', checked: s.columns === 'auto', onSelect: () => settings.set('columns', 'auto') },
		{ label: 'Cover page alone', checked: s.firstPageAlone, separatorBefore: true, onSelect: () => settings.set('firstPageAlone', !s.firstPageAlone) },
		{ heading: 'Scrolling', label: 'Continuous', shortcut: keys.scrollContinuous, checked: s.scrollMode === 'vertical', separatorBefore: true, onSelect: () => settings.set('scrollMode', 'vertical') },
		{ label: 'Paged', shortcut: keys.scrollPaged, checked: s.scrollMode === 'page', onSelect: () => settings.set('scrollMode', 'page') },
		{ label: 'Horizontal', shortcut: keys.scrollHorizontal, checked: s.scrollMode === 'horizontal', onSelect: () => settings.set('scrollMode', 'horizontal') }
	];

	const moreItems = (): MenuItem[] => [
		...(paper ? paperMenu(paper, { inReader: true }) : []),
		{ label: 'Export', icon: 'icon-[lucide--share]', separatorBefore: true, items: exportItems() },
		{ label: 'Show the library', icon: 'icon-[lucide--library]', shortcut: keys.library, onSelect: showLibrary }
	];

	// Right-click on the chrome (header, panel): app actions for this paper.
	$effect(() =>
		setFallbackMenu(() => [
			{ label: 'Save annotations', icon: 'icon-[lucide--save]', shortcut: keys.save, disabled: !dirty, onSelect: save },
			{ label: 'Find in paper', icon: icons.search, shortcut: keys.find, onSelect: () => openPanel('search') },
			{ label: 'View', icon: icons.eye, separatorBefore: true, items: viewItems() },
			{ label: 'Layout', icon: icons.columns, items: layoutItems() },
			{ label: 'Export', icon: 'icon-[lucide--share]', items: exportItems() },
			{ label: 'Keyboard shortcuts', icon: 'icon-[lucide--keyboard]', shortcut: keys.help, separatorBefore: true, onSelect: () => (shortcutsHelp.open = true) },
			{ label: 'Settings…', icon: 'icon-[lucide--settings]', shortcut: keys.settings, onSelect: () => (settingsDialog.open = true) }
		])
	);

	function onkeydown(e: KeyboardEvent) {
		if (matches(e, keys.save)) (e.preventDefault(), void save());
		else if (matches(e, keys.find)) (e.preventDefault(), openPanel('search'));
		else if (matches(e, keys.panel) || matches(e, keys.panelAlt)) (e.preventDefault(), (panelOpen = !panelOpen));
		else if (matches(e, keys.closeWindow)) (e.preventDefault(), closeWindow());
		else if (matches(e, keys.scrollContinuous)) (e.preventDefault(), settings.set('scrollMode', 'vertical'));
		else if (matches(e, keys.scrollPaged)) (e.preventDefault(), settings.set('scrollMode', 'page'));
		else if (matches(e, keys.scrollHorizontal)) (e.preventDefault(), settings.set('scrollMode', 'horizontal'));
		else if (matches(e, keys.spread)) (e.preventDefault(), settings.set('columns', s.columns === 2 ? 1 : 2));
		else if (matches(e, keys.minimap)) (e.preventDefault(), settings.set('minimap', !s.minimap));
	}

	const showMenu = (items: () => MenuItem[]) => (e: MouseEvent) => contextMenuState.showAt(e.currentTarget as HTMLElement, items());

	const iconBtn = 'grid size-7 shrink-0 place-items-center rounded-md text-stone-600 outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-blue-500/50 data-[active]:bg-black/10 disabled:opacity-35 dark:text-stone-300 dark:hover:bg-white/10 dark:data-[active]:bg-white/15';
	// Opaque (no backdrop blur): blurring over a scrolling PDF costs every frame in WebKit.
	const chrome = 'bg-stone-50 dark:bg-stone-900';
	const kindIcon: Record<string, string> = { citation: 'icon-[lucide--quote]', figure: 'icon-[lucide--image]', table: 'icon-[lucide--table]', section: 'icon-[lucide--heading]', equation: 'icon-[lucide--sigma]', footnote: 'icon-[lucide--asterisk]', url: icons.external };
	const chipBtn = 'inline-flex items-center gap-1 rounded-md border border-stone-200 px-1.5 py-0.5 text-[11px] text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800';
	const toggleOpt = 'rounded px-1.5 py-0.5 font-mono text-[11px] text-stone-500 data-[active]:bg-stone-800 data-[active]:text-white dark:data-[active]:bg-stone-200 dark:data-[active]:text-stone-900';
</script>

<svelte:window {onkeydown} />

{#if !paper}
	<div class="grid h-full place-items-center text-sm text-stone-500" data-tauri-drag-region>
		<div class="text-center">
			<p>This paper is no longer in your library.</p>
			<button class="mt-2 underline" onclick={closeWindow}>Close</button>
		</div>
	</div>
{:else if bytes}
	<Document.Root src={bytes} onLoad={() => paper.position && requestAnimationFrame(() => viewer?.restorePosition(paper.position!))}>
		<Viewer.Root
			bind:viewer
			{pageTheme}
			pageFrame={s.pageFrame}
			theme={theme.dark ? 'dark' : 'light'}
			zoomMode={initialZoom}
			bind:columns={() => s.columns, (v) => settings.set('columns', v === 'auto' ? 'auto' : v === 2 ? 2 : 1)}
			bind:scrollMode={() => s.scrollMode, (v) => settings.set('scrollMode', v)}
			firstPageAlone={s.firstPageAlone}
			smoothZoom={s.smoothZoom}
			wheelZoom={s.wheelZoom}
			focusHighlight={s.focusStyle}
			{keymap}
			class="flex h-full flex-col"
			style="--pdf-accent:{accent}"
		>
			<Find.Root>
				{#snippet children({ find })}
					<Paper.Root {provider} bind:paper={paperState}>
						<Annotations.Root
							bind:annotations
							bind:store
							importFromPdf
							{tools}
							author={{ name: s.author || 'Me' }}
							stickyTools={s.stickyTools}
							selectOn={s.selectOn}
							editOnCreate={s.editOnCreate}
							foreign={s.foreignAnnotations}
							{onAnnotationsChange}
						>
							<!-- ── Header ─────────────────────────────────────── -->
							<header class="relative z-30 border-b border-stone-200/80 {chrome} dark:border-stone-800" data-tauri-drag-region>
								<!-- Desktop: room for the traffic lights (overlay title bar). -->
								<div class="flex h-11 items-center gap-1 pr-2 {platform.kind === 'desktop' ? 'pl-20' : 'pl-2'}" data-tauri-drag-region>
									<Tip label={panelOpen ? 'Hide side panel' : 'Show side panel'} shortcut={keys.panelAlt}>
										{#snippet child({ props })}<button {...props} class={iconBtn} aria-label="Side panel" data-active={panelOpen || undefined} onclick={() => (panelOpen = !panelOpen)}><span class="{icons.panel} size-4"></span></button>{/snippet}
									</Tip>
									<div class="mx-2 flex min-w-0 flex-1 items-baseline gap-3" data-tauri-drag-region>
										<p class="truncate font-serif text-[15px]" data-tauri-drag-region>{paper.title}</p>
										{#if s.breadcrumb}<Toc.Breadcrumb class="hidden min-w-0 truncate text-xs text-stone-500 xl:flex [&_[data-pdf-toc-item]]:truncate" />{/if}
									</div>

									<Tip label={dirty ? 'Unsaved changes: save now' : 'Annotations are saved in the PDF'} shortcut={keys.save}>
										{#snippet child({ props })}
											<button {...props} class="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-stone-500 hover:bg-black/5 dark:hover:bg-white/10" onclick={save} aria-label="Save">
												{#if saving}<span class="icon-[lucide--loader-circle] size-3.5 animate-spin"></span>Saving
												{:else if dirty}<span class="size-2 rounded-full bg-amber-500"></span>Unsaved
												{:else}<span class="icon-[lucide--check] size-3.5"></span>Saved{/if}
											</button>
										{/snippet}
									</Tip>
									<Tip label="Find in paper" shortcut={keys.find}>
										{#snippet child({ props })}<button {...props} class={iconBtn} aria-label="Find" data-active={(panelOpen && panel === 'search') || undefined} onclick={() => (panelOpen && panel === 'search' ? (panelOpen = false) : openPanel('search'))}><span class="{icons.search} size-4"></span></button>{/snippet}
									</Tip>
									<Tip label="View">
										{#snippet child({ props })}<button {...props} class={iconBtn} aria-label="View options" onclick={showMenu(viewItems)}><span class="{icons.eye} size-4"></span></button>{/snippet}
									</Tip>
									<ThemePopover {swatch} />
									<Tip label="More">
										{#snippet child({ props })}<button {...props} class={iconBtn} aria-label="More" onclick={showMenu(moreItems)}><span class="{icons.more} size-4"></span></button>{/snippet}
									</Tip>
									<Tip label="Keyboard shortcuts" shortcut={keys.help}>
										{#snippet child({ props })}<button {...props} class={iconBtn} aria-label="Keyboard shortcuts" onclick={() => (shortcutsHelp.open = true)}><span class="icon-[lucide--keyboard] size-4"></span></button>{/snippet}
									</Tip>
									<Tip label="Settings" shortcut={keys.settings}>
										{#snippet child({ props })}<button {...props} class={iconBtn} aria-label="Settings" onclick={() => (settingsDialog.open = true)}><span class="icon-[lucide--settings] size-4"></span></button>{/snippet}
									</Tip>
								</div>

								<!-- Toolbar: annotation tools (always there), pages, zoom, layout. -->
								<div class="@container flex h-10 items-center gap-1 px-2">
									<AnnotationToolbar {tools} class="min-w-0 overflow-x-auto [scrollbar-width:none]" />
									<div class="min-w-2 flex-1"></div>
									<Tip label="Previous page">{#snippet child({ props })}<PageNav.Prev {...props} class={iconBtn}><span class="{icons.up} size-4"></span></PageNav.Prev>{/snippet}</Tip>
									<PageNav.Input class="h-6 w-10 shrink-0 rounded-md bg-black/5 text-center text-xs tabular-nums dark:bg-white/10" />
									<span class="hidden shrink-0 px-1 text-xs text-stone-500 tabular-nums @2xl:inline">/ {viewer?.document.numPages ?? '–'}</span>
									<Tip label="Next page">{#snippet child({ props })}<PageNav.Next {...props} class={iconBtn}><span class="{icons.down} size-4"></span></PageNav.Next>{/snippet}</Tip>
									<Separator />
									<Tip label="Zoom out" shortcut="{mod}−">{#snippet child({ props })}<Zoom.Out {...props} class={iconBtn}><span class="{icons.zoomOut} size-4"></span></Zoom.Out>{/snippet}</Tip>
									{#if viewer}<ZoomSlider {viewer} class="hidden w-28 shrink-0 @5xl:flex" /><ZoomSelect {viewer} class="hidden h-7 w-28 shrink-0 border-transparent bg-black/5 text-xs @3xl:inline-flex dark:bg-white/10" />{/if}
									<Tip label="Zoom in" shortcut="{mod}+">{#snippet child({ props })}<Zoom.In {...props} class={iconBtn}><span class="{icons.zoomIn} size-4"></span></Zoom.In>{/snippet}</Tip>
									<Tip label="Page layout">
										{#snippet child({ props })}<button {...props} class={iconBtn} aria-label="Page layout" onclick={showMenu(layoutItems)}><span class="{s.columns === 1 ? 'icon-[lucide--file]' : icons.columns} size-4"></span></button>{/snippet}
									</Tip>
								</div>
								{#if s.progressBar}<Toc.Progress class="absolute! inset-x-0 bottom-0 rounded-none! bg-transparent! [--pdf-progress-height:2px]" />{/if}
							</header>

							<div class="flex min-h-0 flex-1">
								<!-- ── Side panel: slides its width (no gap on close). ── -->
								{#if panelOpen}
									<aside class="flex shrink-0 flex-col overflow-hidden border-r border-stone-200 text-[13px] {chrome} dark:border-stone-800" transition:slide={{ axis: 'x', duration: 180 }}>
										<div class="flex min-h-0 w-80 flex-1 flex-col">
											<Tabs
												bind:value={panel}
												tabs={[
													{ value: 'contents', label: '', tip: 'Contents', icon: icons.list },
													{ value: 'pages', label: '', tip: 'Pages', icon: icons.layers },
													{ value: 'figures', label: '', tip: 'Figures, tables & equations', icon: 'icon-[lucide--image]' },
													{ value: 'references', label: '', tip: 'References', icon: 'icon-[lucide--quote]' },
													{ value: 'notes', label: '', tip: 'Notes', badge: annotations.length || undefined, icon: icons.notes },
													{ value: 'search', label: '', tip: `Find (${keys.find})`, icon: icons.search },
													{ value: 'info', label: '', tip: 'Paper info', icon: 'icon-[lucide--info]' }
												]}
												class="min-h-0 flex-1"
												listClass="m-2"
											>
												{#snippet content(tab)}
													<div class="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
														{#if tab === 'contents'}
															<p class="px-2 pt-1 pb-2 text-[11px] font-medium tracking-wide text-stone-400 uppercase">Contents</p>
															<Toc.Tree class="[--pdf-toc-indent:14px] [&_[data-pdf-toc-item]]:pl-2">
																{#snippet empty({ status })}<p class="p-2 text-stone-500">{status === 'analyzing' ? 'Reading the paper…' : 'No sections found.'}</p>{/snippet}
															</Toc.Tree>
														{:else if tab === 'pages'}
															<Thumbnails.Root width={136} class="space-y-2 pt-1">
																{#each { length: viewer?.document.numPages ?? 0 } as _, i (i)}
																	<Thumbnails.Item pageNumber={i + 1} class="mx-auto flex flex-col items-center gap-1 rounded-md p-1.5 text-xs text-stone-500 data-[current]:bg-stone-200 dark:data-[current]:bg-stone-800 [&_[data-pdf-thumbnail-canvas]]:rounded [&_[data-pdf-thumbnail-canvas]]:shadow" />
																{/each}
															</Thumbnails.Root>
														{:else if tab === 'figures'}
															<Paper.Figures kinds={['figure', 'table', 'algorithm', 'equation']} thumbnailWidth={290} class="space-y-3 pt-1 [&_[data-part=caption]]:line-clamp-2 [&_[data-part=caption]]:text-xs [&_[data-part=caption]]:text-stone-500 [&_[data-part=label]]:mt-1 [&_[data-part=label]]:block [&_[data-part=label]]:font-medium [&_[data-part=open]]:block [&_[data-part=open]]:w-full [&_[data-part=open]]:rounded-md [&_[data-part=open]]:p-1.5 [&_[data-part=open]]:text-left [&_[data-part=open]:hover]:bg-stone-200/70 dark:[&_[data-part=open]:hover]:bg-stone-800 [&_[data-part=thumbnail]]:min-h-12 [&_[data-part=thumbnail]]:overflow-hidden [&_[data-part=thumbnail]]:rounded [&_[data-part=thumbnail]]:bg-white" />
														{:else if tab === 'references'}
															<Paper.References class="space-y-0.5 pt-1">
																{#snippet item({ reference, citedCount, go, nextCitation })}
																	<div class="group rounded-md px-2 py-1.5 hover:bg-stone-200/70 dark:hover:bg-stone-800">
																		<button class="block w-full text-left" onclick={go}>
																			<span class="mr-1 font-mono text-[11px] text-stone-500">{reference.label}</span>
																			<span class="font-medium">{reference.parsed.title ?? reference.raw.slice(0, 120)}</span>
																			<span class="block text-xs text-stone-500">{reference.parsed.authors.slice(0, 3).join(', ')}{reference.parsed.year ? ` · ${reference.parsed.year}` : ''}</span>
																		</button>
																		<div class="mt-0.5 flex items-center gap-2 text-xs">
																			{#if citedCount}<button class="inline-flex items-center gap-1 text-stone-600 hover:underline dark:text-stone-300" onclick={nextCitation}>cited {citedCount}× <span class="{icons.down} size-3"></span></button>{/if}
																			{#if reference.parsed.arxivId}<button class="hidden text-stone-500 group-hover:inline hover:underline" onclick={() => openReference(reference)}>Add to library</button>{/if}
																		</div>
																	</div>
																{/snippet}
															</Paper.References>
														{:else if tab === 'notes'}
															<Annotations.List class="space-y-2 pt-1">
																{#snippet item({ annotation, quote, pageLabel, go, color })}
																	<button class="block w-full rounded-md border-l-4 bg-white/80 px-2.5 py-2 text-left shadow-sm hover:shadow dark:bg-stone-800/80" style:border-color={color} onclick={go}>
																		<span class="text-[11px] text-stone-500 uppercase">p. {pageLabel} · {annotation.kind}</span>
																		{#if annotation.label}<span class="block font-medium">{annotation.label}</span>{/if}
																		{#if quote}<span class="line-clamp-3 block font-serif text-[13px] text-stone-600 dark:text-stone-300">{quote}</span>{/if}
																		{#if annotation.contents}<span class="mt-1 block border-t border-stone-200 pt-1 dark:border-stone-700"><Annotations.Markdown source={annotation.contents} /></span>{/if}
																	</button>
																{/snippet}
																{#snippet empty()}
																	<p class="flex flex-wrap items-center gap-1 p-2 text-stone-500">Select text, then press <Kbd>H</Kbd> to highlight (or <Kbd>1</Kbd>–<Kbd>9</Kbd> for a colour).</p>
																{/snippet}
															</Annotations.List>
														{:else if tab === 'search'}
															<div class="space-y-2 pt-1 pb-2">
																<div class="flex items-center gap-1 rounded-md border border-stone-300 bg-white px-2 focus-within:ring-2 focus-within:ring-blue-500/50 dark:border-stone-700 dark:bg-stone-900">
																	<span class="{icons.search} size-3.5 text-stone-400"></span>
																	<Find.Input bind:ref={findInput} captureShortcut={false} class="min-w-0 flex-1 bg-transparent py-1.5 text-[13px] outline-none" placeholder="Find in paper" />
																	<Find.Count class="text-[11px] whitespace-nowrap text-stone-500 tabular-nums" />
																	<Tip label="Previous match" shortcut="⇧↵">{#snippet child({ props })}<Find.Prev {...props} class="grid size-6 place-items-center disabled:opacity-30"><span class="{icons.up} size-4"></span></Find.Prev>{/snippet}</Tip>
																	<Tip label="Next match" shortcut="↵">{#snippet child({ props })}<Find.Next {...props} class="grid size-6 place-items-center disabled:opacity-30"><span class="{icons.down} size-4"></span></Find.Next>{/snippet}</Tip>
																</div>
																<div class="flex items-center gap-1">
																	<Find.Toggle option="caseSensitive" class={toggleOpt} />
																	<Find.Toggle option="wholeWord" class={toggleOpt} />
																	<Find.Toggle option="diacritics" class={toggleOpt} />
																	<Find.Toggle option="regex" class={toggleOpt} />
																	{#if find.status === 'searching'}<span class="ml-auto text-[11px] text-stone-500">page {find.searchedPages}/{viewer?.document.numPages}</span>{/if}
																</div>
															</div>
															{#each groups(find.matches) as g (g.key)}
																<p class="px-2 pt-2 pb-1 text-[11px] font-medium tracking-wide text-stone-500 uppercase">{g.title} <span class="font-normal">· {g.matches.length}</span></p>
																{#each g.matches as match (match.index)}
																	<Find.Result {match} class="block w-full rounded px-2 py-1.5 text-left hover:bg-stone-200/70 data-[active]:bg-amber-100 dark:hover:bg-stone-800 dark:data-[active]:bg-amber-900/40 [&_[data-part=page]]:mr-2 [&_[data-part=page]]:text-xs [&_[data-part=page]]:text-stone-500 [&_mark]:rounded-sm [&_mark]:bg-amber-300/70 [&_mark]:px-0.5" />
																{/each}
															{/each}
														{:else}
															<div class="px-2 pt-2"><PaperDetails {paper} /></div>
														{/if}
													</div>
												{/snippet}
											</Tabs>
										</div>
									</aside>
								{/if}

								<!-- ── Pages ──────────────────────────────────────── -->
								<div class="relative min-w-0 flex-1">
									<PdfContextMenu onOpenReference={openReference} {saveFile}>
										{#snippet trigger({ props })}
											<Viewer.Viewport {...props} class="h-full bg-stone-100 transition-colors dark:bg-stone-950 [--pdf-page-gap:22px] [--pdf-pages-padding:28px] {s.sideNotes ? '[--pdf-pages-aside:252px]' : ''}">
												<Viewer.Pages>
													{#snippet children({ pageNumber })}
														<Viewer.Page {pageNumber}>
															<Viewer.Canvas />
															<Viewer.TextLayer />
															<Viewer.LinkLayer class="[&_a]:rounded-sm [&_a:hover]:bg-sky-500/10" />
															<Find.Layer />
															<Paper.Layer />
															<Annotations.Layer />
															{#if s.lineMarkers}<Annotations.LineMarkers markers="all" />{/if}
															{#if s.sideNotes}<Annotations.Margin class="[--pdf-margin-width:220px]" />{/if}
															<FocusEffect color={accent} />
														</Viewer.Page>
													{/snippet}
												</Viewer.Pages>
											</Viewer.Viewport>
										{/snippet}
									</PdfContextMenu>
									{#if s.tocRail}<Toc.Rail class="absolute top-8 right-3 bottom-8 text-stone-500" />{/if}
									<BackPill />
									<CenterControl bind:locked={centreLocked} />
									{#if paperState?.status === 'analyzing'}
										<div class="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-stone-900/70 px-3 py-1 text-xs text-white" transition:fade>Reading the paper… {Math.round(paperState.progress * 100)}%</div>
									{/if}
								</div>

								{#if s.minimap}
									<div transition:slide={{ axis: 'x', duration: 160 }} class="flex shrink-0">
										<Minimap.Root style="background:{swatch}" variant={s.minimapVariant} width={s.minimapVariant === 'heatmap' ? 18 : s.minimapVariant === 'spine' ? 120 : 84} class="h-full border-l border-stone-200 dark:border-stone-800">
											{#if s.minimapVariant === 'heatmap'}<Minimap.Heatmap />{/if}
											<Minimap.Viewport class="rounded-sm! bg-sky-500/10! shadow-[inset_0_0_0_1.5px_rgb(14_165_233/0.5)]!" />
											{#if s.minimapVariant !== 'heatmap'}<Minimap.Markers find annotations sections={s.minimapVariant !== 'spine'} />{/if}
										</Minimap.Root>
									</div>
								{/if}
							</div>

							<!-- ── Floating UI ──────────────────────────────────── -->
							{#if s.citationCards}
								<Paper.CitationCard>
									{#snippet actions({ reference })}
										{#if reference.parsed.arxivId}
											<button type="button" class={chipBtn} onclick={() => openReference(reference)}><span class="{icons.import} size-3"></span>Add to library</button>
											<button type="button" class={chipBtn} onclick={() => platform.openUrl(`https://arxiv.org/abs/${reference.parsed.arxivId}`)}><span class="{icons.external} size-3"></span>arXiv</button>
										{:else}
											<button type="button" class={chipBtn} onclick={() => openReference(reference)}><span class="{icons.search} size-3"></span>Scholar</button>
										{/if}
									{/snippet}
								</Paper.CitationCard>
							{/if}
							{#if s.linkPreviews}
								<Paper.CrossRefPreview forceMount>
									{#snippet child({ props, open, label, canvasProps })}
										{#if open}
											<div {...props} transition:scale={{ start: 0.96, duration: 130 }} class="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl dark:border-stone-700 dark:bg-stone-900">
												<div {...(canvasProps as Record<string, never>)}></div>
												<p class="border-t border-stone-100 px-3 py-1.5 text-xs text-stone-500 dark:border-stone-800">{label}</p>
											</div>
										{/if}
									{/snippet}
								</Paper.CrossRefPreview>
								<Viewer.LinkPreview forceMount placement="top" width={440} kinds={['section', 'equation', 'footnote', 'page', 'other', 'url']}>
									{#snippet child({ props, open, kind, page: target, url, canvasProps })}
										{#if open}
											<div {...props} transition:fly={{ y: 6, duration: 140 }} class="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl ring-1 ring-black/5 dark:border-stone-700 dark:bg-stone-900">
												{#if url}
													<button type="button" class="flex w-full items-center gap-2 p-3 text-left text-sm hover:bg-stone-50 dark:hover:bg-stone-800" onclick={() => url && platform.openUrl(url)}>
														<span class="{icons.external} size-4 shrink-0 text-stone-400"></span><span class="truncate text-sky-700 underline-offset-2 hover:underline dark:text-sky-400">{url}</span>
													</button>
												{:else}
													<div {...(canvasProps as Record<string, never>)}></div>
													<p class="flex items-center gap-1.5 border-t border-stone-100 bg-stone-50 px-3 py-1.5 text-xs text-stone-500 capitalize dark:border-stone-800 dark:bg-stone-950">
														<span class="{kindIcon[kind] ?? 'icon-[lucide--link]'} size-3.5"></span>{kind} · page {target}
													</p>
												{/if}
											</div>
										{/if}
									{/snippet}
								</Viewer.LinkPreview>
							{/if}
							<Paper.Backlinks />
							<Annotations.SelectionMenu />
							<Annotations.Popover />
							<NoteHoverCard />
						</Annotations.Root>
					</Paper.Root>
				{/snippet}
			</Find.Root>
		</Viewer.Root>
	</Document.Root>
{:else}
	<div class="h-full bg-stone-100 dark:bg-stone-950" data-tauri-drag-region></div>
{/if}
