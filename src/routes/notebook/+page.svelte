<!--
	A notebook in its own window: its title (edited in place) under the folders it's in,
	and its text (notebooks/<id>/notes.json), saved a moment after you stop typing.
	One window per notebook (a lock, as for papers): another one offers to take it over.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { broadcast, onBroadcast } from '#lib/broadcast.js';
	import { toast } from '#lib/components/Toasts.svelte';
	import { library } from '#lib/library.svelte.js';
	import { notebooks } from '#lib/notebooks/notebooks.svelte.js';
	import NotesPane, { flushNotes } from '#lib/notes/NotesPane.svelte';
	import { paperRefsIn, searchPapers, type PaperRefs } from '#lib/notes/paper-ref.js';
	import type { NotesDoc } from '#lib/types.js';
	import { platform } from '#lib/platform/index.js';
	import { ReaderLock } from '#lib/reader-lock.svelte.js';
	import { rememberNotebook } from '#lib/session.js';
	import { button } from '#lib/ui/button.js';
	import { closeWindow, notebookTab, openPaper, searchParams, setWindowTitle } from '#lib/windows.js';

	const id = $derived(searchParams(page.url).get('id') ?? '');
	const notebook = $derived(notebooks.get(id));
	const folders = $derived(notebook ? notebooks.path(id) : []);

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
	// Desktop: open at the next launch too, unless its window is closed (see +layout.svelte).
	$effect(() => {
		if (platform.kind === 'desktop' && access === 'mine') rememberNotebook(id);
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

	// ── Linked papers: chips in the text, and the ones linked by hand ─────
	let doc = $state.raw<NotesDoc | null>(null);
	/** How many chips each paper has, in order of first mention. */
	const mentions = $derived(paperRefsIn(doc));
	const linked = $derived(new Set([...mentions.keys(), ...(notebook?.papers ?? [])]));

	function openLinked(paperId: string, page?: number) {
		const p = library.get(paperId);
		if (p) void openPaper(p.id, p.title);
		void page;
	}

	const papers: PaperRefs = {
		search: (query) => searchPapers(library.papers, query, linked),
		get: (paperId) => library.get(paperId) ?? null,
		open: (paperId, page) => openLinked(paperId, page)
	};
	const chrome = 'bg-stone-50 dark:bg-stone-900';
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
		<div class="flex min-w-0 flex-1 flex-col">
			<header class="flex h-11 shrink-0 items-center gap-2 border-b border-stone-200/80 pr-2 pl-3 lights:pl-20 {chrome} dark:border-stone-800" data-tauri-drag-region>
				<div class="flex min-w-0 flex-1 items-baseline gap-1.5" data-tauri-drag-region>
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
				<span class="shrink-0 truncate text-[11px] {status.error ? 'text-red-600 dark:text-red-400' : 'text-muted'}" title={status.error ?? undefined} aria-live="polite">{status.text}</span>
			</header>
			<div class="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col">
				{#key id}<NotesPane {id} kind="notebook" bind:status title={notebook.title} placeholder="Write about this idea… Type @ to link a paper." {papers} ondoc={(d) => (doc = d)} />{/key}
			</div>
		</div>
	</div>
{/if}

<svelte:head><title>{notebook?.title ?? 'Notebook'}</title></svelte:head>
<!-- The library loads in every window (+layout.svelte); this one needs it for its papers. -->
{#if library.error}<p class="sr-only">{library.error}</p>{/if}
