<!--
	A notebook in its own window: its linked papers on the left, its title (edited in
	place) under the folders it's in, its text (notebooks/<id>/notes.json, saved a moment
	after you stop typing), and on the right a linked paper to read beside it, or the
	chat with Claude about it. Reopens with the paper it was left at, where and as zoomed
	as it was (`.xivly/devices/`, on whichever device).
	One window per notebook (a lock, as for papers): another one offers to take it over.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { broadcast, onBroadcast } from '#lib/broadcast.js';
	import { toast } from '#lib/components/Toasts.svelte';
	import { library } from '#lib/library.svelte.js';
	import LinkedPapers from '#lib/notebooks/LinkedPapers.svelte';
	import { notebooks } from '#lib/notebooks/notebooks.svelte.js';
	import NotebookChat from '#lib/notebooks/NotebookChat.svelte';
	import PaperView from '#lib/notebooks/PaperView.svelte';
	import { notesToMarkdown } from '#lib/notes/markdown.js';
	import NotesPane, { flushNotes } from '#lib/notes/NotesPane.svelte';
	import { paperRefNode, paperRefsIn, searchPapers, type PaperRefs } from '#lib/notes/paper-ref.js';
	import SplitPane from '#lib/pdf/SplitPane.svelte';
	import { platform } from '#lib/platform/index.js';
	import { ReaderLock } from '#lib/reader-lock.svelte.js';
	import { rememberNotebook, usedNotebook } from '#lib/session.js';
	import { settings } from '#lib/settings.svelte.js';
	import type { PageView } from '#lib/devices.js';
	import type { NotesDoc, Paper } from '#lib/types.js';
	import { button, iconButton, mutedIcon } from '#lib/ui/button.js';
	import Tip from '#lib/ui/Tip.svelte';
	import { closeWindow, notebookTab, openPaper, searchParams, setWindowTitle, showLibrary } from '#lib/windows.js';

	const id = $derived(searchParams(page.url).get('id') ?? '');
	const notebook = $derived(notebooks.get(id));
	const folders = $derived(notebook ? notebooks.path(id) : []);
	const s = $derived(settings.values);

	$effect(() => void setWindowTitle(notebook ? notebook.title : 'Notebook'));

	// ── One window per notebook (reader-lock.svelte.ts) ──────────────────
	let lock = $state<ReaderLock>();
	const access = $derived(lock?.access ?? 'checking');
	$effect(() => {
		const l = new ReaderLock(id, 'notebook');
		lock = l;
		void l.claim();
		return () => l.dispose();
	});
	$effect(() => {
		if (access !== 'mine') return;
		usedNotebook(id);
		// Desktop: open at the next launch too, unless its window is closed (see +layout.svelte).
		if (platform.kind === 'desktop') rememberNotebook(id);
	});
	// Web: the tab holding the notebook is the one `openNotebook` finds by name.
	$effect(() => {
		if (platform.kind !== 'desktop') window.name = access === 'mine' ? notebookTab(id) : '';
	});
	function onvisibilitychange() {
		if (document.visibilityState === 'visible' && access === 'elsewhere') void lock?.claim();
	}
	// Asked by another window for this notebook: its text is written, then it's handed over.
	$effect(() =>
		onBroadcast('notebook-take-over', ({ id: wanted }) => {
			if (wanted === id && access === 'mine') void lock?.handOver(() => flushNotes(id, 'notebook').then(() => true));
		})
	);
	// Deleted (from the library, or another window): nothing left to show or save.
	$effect(() =>
		onBroadcast('notebook-removed', ({ id: gone }) => {
			if (gone !== id) return;
			toast('This notebook was deleted', 'info');
			void closeWindow();
		})
	);
	// A paper linked from the library (Add to notebook…): shown at once.
	$effect(() => onBroadcast('notebook-changed', ({ id: changed }) => changed === id && void notebooks.reload()));

	// ── The title ────────────────────────────────────────────────────────
	let titleInput = $state<HTMLInputElement>();
	let title = $state('');
	// Follows the notebook (renamed elsewhere too), except while being edited here.
	$effect(() => {
		const t = notebook?.title ?? '';
		if (document.activeElement !== titleInput) title = t;
	});
	function saveTitle() {
		if (!notebook) return;
		if (!title.trim()) title = notebook.title;
		void notebooks.rename(id, title).catch((e) => toast(String(e), 'error'));
	}

	let status = $state({ text: '', error: null as string | null });
	let notesPane = $state<NotesPane>();

	// ── Linked papers: chips in the text, and the ones linked by hand ─────
	let doc = $state.raw<NotesDoc | null>(null);
	/** How many chips each paper has, in order of first mention. */
	const mentions = $derived(paperRefsIn(doc));
	const linked = $derived(new Set([...mentions.keys(), ...(notebook?.papers ?? [])]));

	// ── The paper beside the text ────────────────────────────────────────
	let shown = $state<{ paperId: string; page?: number; view?: PageView } | null>(null);
	let paperView = $state<PaperView>();
	const shownPaper = $derived(shown ? library.get(shown.paperId) : undefined);
	/** How each paper was shown here, as it was left. */
	let views: Record<string, PageView> = {};

	/** Show a paper on the right (at a page; none: where it was left); the same paper again only jumps. */
	function show(paperId: string, page?: number) {
		if (!library.get(paperId)) return;
		settings.set('notebookPane', true);
		settings.set('notebookPaneTab', 'paper');
		if (shown?.paperId === paperId && paperView) {
			if (page) paperView.jump(page);
			return;
		}
		shown = { paperId, page: page ?? views[paperId]?.position, view: views[paperId] };
		void library.devices?.noteNotebook(id, paperId);
	}

	function onview(view: PageView) {
		if (!shown) return;
		views[shown.paperId] = view;
		void library.devices?.noteNotebook(id, shown.paperId, view);
	}

	// Reopened: the paper it was left at, as it was shown.
	let resumed = false;
	$effect(() => {
		if (resumed || access !== 'mine' || library.status !== 'ready') return;
		resumed = true;
		void library.devices?.notebook(id).then((visit) => {
			if (!visit) return;
			views = { ...visit.papers, ...views };
			const paperId = visit.paperId;
			if (!shown && paperId && library.get(paperId)) shown = { paperId, page: views[paperId]?.position, view: views[paperId] };
		});
	});

	const openReader = (p: Paper) => void openPaper(p.id, p.title);

	/** A chip at the cursor for the page shown on the right. */
	function linkThisPage() {
		const a = paperView?.anchor();
		if (shownPaper && a) void notesPane?.insert([paperRefNode(shownPaper, Math.floor(a.page)), { type: 'text', text: ' ' }]);
	}

	/** The notebook's text as Markdown (what Claude reads). */
	const notebookText = () => (doc ? notesToMarkdown(doc) : '');

	const papers: PaperRefs = {
		search: (query) => searchPapers(library.papers, query, linked),
		get: (paperId) => library.get(paperId) ?? null,
		open: (paperId, page) => show(paperId, page)
	};

	const chrome = 'bg-stone-50 dark:bg-stone-900';
	const iconBtn = iconButton(7, mutedIcon);
</script>

<svelte:document {onvisibilitychange} />

{#if !notebooks.loaded || access === 'checking'}
	<div class="h-full {chrome}" data-tauri-drag-region></div>
{:else if !notebook || notebook.kind !== 'notebook'}
	<div class="grid h-full place-items-center bg-stone-100 px-6 text-center text-sm text-muted dark:bg-stone-950" data-tauri-drag-region>
		<div>
			<p class="text-stone-700 dark:text-stone-300">This notebook is no longer in the library.</p>
			<div class="mt-4 flex justify-center"><button class={button('primary')} onclick={closeWindow}>Close</button></div>
		</div>
	</div>
{:else if access === 'elsewhere' || access === 'waiting'}
	{@const where = platform.kind === 'desktop' ? 'window' : 'tab'}
	<div class="grid h-full place-items-center bg-stone-100 px-6 text-center text-sm text-muted dark:bg-stone-950" data-tauri-drag-region>
		<div>
			<p class="text-stone-700 dark:text-stone-300">This notebook is open in another {where}.</p>
			<p class="mx-auto mt-1 max-w-sm text-xs">It’s written in one place at a time, so that one {where} never saves over the other.</p>
			<div class="mt-4 flex justify-center gap-2">
				<button class={button('secondary')} onclick={closeWindow}>Close</button>
				<button class={button('primary')} disabled={access === 'waiting'} onclick={() => lock?.takeOver(() => void broadcast('notebook-take-over', { id }))}>{access === 'waiting' ? 'Saving it there…' : 'Write here'}</button>
			</div>
		</div>
	</div>
{:else}
	<div class="flex h-full min-h-0 bg-white text-stone-800 dark:bg-stone-900 dark:text-stone-100">
		{#if s.notebookPanel}
			<LinkedPapers {notebook} {mentions} shown={s.notebookPane && s.notebookPaneTab === 'paper' ? (shown?.paperId ?? null) : null} onshow={(paperId) => show(paperId)} onreader={openReader} oninsert={(p) => void notesPane?.insert([paperRefNode(p), { type: 'text', text: ' ' }])} />
		{/if}

		<div class="flex min-w-0 flex-1 flex-col">
			<header class="flex h-11 shrink-0 items-center gap-1 border-b border-stone-200/80 pr-2 pl-2 {s.notebookPanel ? '' : 'lights:pl-20'} {chrome} dark:border-stone-800" data-tauri-drag-region>
				<Tip label={s.notebookPanel ? 'Hide linked papers' : 'Show linked papers'}>
					{#snippet child({ props })}<button {...props} class={iconBtn} aria-label="Linked papers" aria-pressed={s.notebookPanel} data-active={s.notebookPanel || undefined} onclick={() => settings.set('notebookPanel', !s.notebookPanel)}><span class="icon-[lucide--panel-left] size-4"></span></button>{/snippet}
				</Tip>
				<div class="ml-1 flex min-w-0 flex-1 items-baseline gap-1.5" data-tauri-drag-region>
					{#each folders as f (f.id)}
						<span class="shrink-0 truncate text-xs text-muted" data-tauri-drag-region>{f.title}</span>
						<span class="icon-[lucide--chevron-right] size-3 shrink-0 self-center text-stone-400" aria-hidden="true"></span>
					{/each}
					<input
						bind:this={titleInput}
						bind:value={title}
						class="min-w-0 flex-1 truncate rounded-sm bg-transparent px-1 font-serif text-[15px] outline-none hover:bg-stone-200/50 focus:bg-white focus:ring-2 focus:ring-blue-500 dark:hover:bg-stone-800/60 dark:focus:bg-stone-950"
						aria-label="Notebook title"
						onkeydown={(e) => {
							if (e.key === 'Enter') (e.preventDefault(), titleInput?.blur());
							else if (e.key === 'Escape') (e.preventDefault(), (title = notebook?.title ?? ''), titleInput?.blur());
						}}
						onblur={saveTitle}
					/>
				</div>
				<span class="shrink-0 truncate px-1 text-[11px] {status.error ? 'text-red-600 dark:text-red-400' : 'text-muted'}" title={status.error ?? undefined} aria-live="polite">{status.text}</span>
				<Tip label={s.notebookPane ? 'Hide the right pane' : 'Show the right pane'}>
					{#snippet child({ props })}<button {...props} class={iconBtn} aria-label="Right pane" aria-pressed={s.notebookPane} data-active={s.notebookPane || undefined} onclick={() => settings.set('notebookPane', !s.notebookPane)}><span class="icon-[lucide--panel-right] size-4"></span></button>{/snippet}
				</Tip>
				<Tip label="Library">
					{#snippet child({ props })}<button {...props} class={iconBtn} aria-label="Show the library" onclick={showLibrary}><span class="icon-[lucide--library] size-4"></span></button>{/snippet}
				</Tip>
			</header>
			<div class="flex min-h-0 w-full flex-1 flex-col">
				{#key id}<NotesPane bind:this={notesPane} {id} kind="notebook" bind:status title={notebook.title} placeholder="Write about this idea… Type @ to link a paper." {papers} ondoc={(d) => (doc = d)} />{/key}
			</div>
		</div>

		{#if s.notebookPane}
			<SplitPane class="text-[13px] {chrome}">
				<div class="flex h-11 shrink-0 items-center gap-1 pr-2 pl-3" data-tauri-drag-region>
					<div class="flex gap-0.5" role="tablist" aria-label="Pane">
						<button role="tab" aria-selected={s.notebookPaneTab === 'paper'} class="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted hover:text-stone-900 aria-selected:bg-stone-200/80 aria-selected:text-stone-900 dark:hover:text-stone-100 dark:aria-selected:bg-stone-800 dark:aria-selected:text-stone-100" onclick={() => settings.set('notebookPaneTab', 'paper')}>
							<span class="icon-[lucide--file-text] size-3.5"></span>Paper
						</button>
						<button role="tab" aria-selected={s.notebookPaneTab === 'chat'} class="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted hover:text-stone-900 aria-selected:bg-stone-200/80 aria-selected:text-stone-900 dark:hover:text-stone-100 dark:aria-selected:bg-stone-800 dark:aria-selected:text-stone-100" onclick={() => settings.set('notebookPaneTab', 'chat')}>
							<span class="icon-[lucide--sparkles] size-3.5"></span>Chat
						</button>
					</div>
					<span class="min-w-0 flex-1 truncate px-1 font-serif text-xs" title={shownPaper?.title} data-tauri-drag-region>{s.notebookPaneTab === 'paper' ? (shownPaper?.title ?? '') : ''}</span>
					{#if s.notebookPaneTab === 'paper' && shownPaper}
						<Tip label="Link this page in the text">
							{#snippet child({ props })}<button {...props} class={iconBtn} aria-label="Link this page in the text" onclick={linkThisPage}><span class="icon-[lucide--file-symlink] size-4"></span></button>{/snippet}
						</Tip>
						<Tip label="Open in the reader (to annotate)">
							{#snippet child({ props })}<button {...props} class={iconBtn} aria-label="Open in the reader" onclick={() => openReader(shownPaper)}><span class="icon-[lucide--square-arrow-out-up-right] size-4"></span></button>{/snippet}
						</Tip>
					{/if}
					<Tip label="Hide the pane">
						{#snippet child({ props })}<button {...props} class={iconBtn} aria-label="Hide the pane" onclick={() => settings.set('notebookPane', false)}><span class="icon-[lucide--x] size-4"></span></button>{/snippet}
					</Tip>
				</div>
				<div class="flex min-h-0 flex-1 flex-col border-t border-stone-200 dark:border-stone-800" class:hidden={s.notebookPaneTab !== 'paper'}>
					{#if shown && shownPaper}
						{#key shown.paperId}<PaperView bind:this={paperView} paperId={shown.paperId} page={shown.page} view={shown.view} {onview} />{/key}
					{:else}
						<p class="m-auto max-w-56 px-4 text-center text-xs text-muted">Click a linked paper, or a link in the text, to read it here.</p>
					{/if}
				</div>
				<!-- Both stay alive: an answer keeps streaming while the paper shows, and back. -->
				<div class="flex min-h-0 flex-1 flex-col border-t border-stone-200 dark:border-stone-800" class:hidden={s.notebookPaneTab !== 'chat'}>
					{#key id}<NotebookChat notebookId={id} title={notebook.title} text={notebookText} {linked} onshow={show} onlink={(paperId) => void notebooks.link(id, paperId).catch((e) => toast(String(e), 'error'))} />{/key}
				</div>
			</SplitPane>
		{/if}
	</div>
{/if}
