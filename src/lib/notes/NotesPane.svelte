<!--
	The notes pane's content: header (save state, close) and the editor, loaded
	from and saved to `papers/<id>/notes.json` (a notebook's text: `notebooks/<id>/notes.json`)
	a moment after you stop typing.
-->
<script lang="ts" module>
	import { broadcast } from '#lib/broadcast.js';
	import { onFlush } from '#lib/flush.js';
	import { library } from '#lib/library.svelte.js';
	import type { NotesDoc, PaperAnchor } from '#lib/types.js';
	import type { MindMap } from '#lib/mindmap/tree.js';
	import { Saver } from './saver.svelte';
	import { IMAGE_TYPES, imageMime, type NoteAssets } from './images';
	import { drawingFiles } from '#lib/drawing/notes.js';

	/** Whose notes: a paper's, or a notebook's text. */
	export type NotesKind = 'paper' | 'notebook';

	/** Where the notes of a paper or a notebook are kept (the same files, in its folder). */
	function storeFor(kind: NotesKind, id: string) {
		const repo = library.repo!;
		return kind === 'paper'
			? { dir: `papers/${id}`, read: () => repo.readNotes(id), save: (doc: NotesDoc) => repo.saveNotes(id, doc), saveAsset: (b: Uint8Array, ext: string) => repo.saveNoteAsset(id, b, ext), saveDrawings: (d: Map<string, string>) => repo.saveNoteDrawings(id, d), readFile: (p: string) => repo.readPaperFile(id, p) }
			: { dir: `notebooks/${id}`, read: () => repo.readNotebookNotes(id), save: (doc: NotesDoc) => repo.saveNotebookNotes(id, doc).then((r) => (void broadcast('notebook-changed', { id }), r)), saveAsset: (b: Uint8Array, ext: string) => repo.saveNotebookAsset(id, b, ext), saveDrawings: (d: Map<string, string>) => repo.saveNotebookDrawings(id, d), readFile: (p: string) => repo.readNotebookFile(id, p) };
	}

	// One saver per paper (or notebook), outliving the pane: hiding it (⌘E) mid-save loses
	// nothing, and closing the window or quitting waits for the last write.
	const savers = new Map<string, Saver<NotesDoc>>();
	/** Each one's notes as this window last read or wrote them (JSON): a change on disk that's not one of ours differs. */
	const known = new Map<string, string>();
	function saverFor(kind: NotesKind, id: string) {
		const key = `${kind}/${id}`;
		let saver = savers.get(key);
		if (!saver) {
			// Whether the notes had drawings when last saved (unknown at first: their files are checked once).
			let drew: boolean | undefined;
			const s = new Saver<NotesDoc>(async (doc) => {
				known.set(key, JSON.stringify(doc));
				const store = storeFor(kind, id);
				await store.save(doc);
				// The drawings' images, for notes.md (a failure there leaves the notes saved).
				const drawings = drawingFiles(doc);
				if (drawings.size || drew !== false) await store.saveDrawings(drawings).catch((e) => console.warn('drawings not written', e));
				drew = drawings.size > 0;
			});
			onFlush({ dirty: () => s.dirty, flush: () => s.flush().then(() => true) });
			savers.set(key, (saver = s));
		}
		return saver;
	}

	// Notes images shown so far (blob URLs by `<folder>/<path>`): each is read once per window.
	const imageUrls = new Map<string, Promise<string | null>>();

	/** Where the notes images are kept: in the same folder, under notes-assets/. */
	function assetsFor(kind: NotesKind, id: string): NoteAssets {
		return {
			async save(file) {
				const ext = IMAGE_TYPES[file.type];
				if (!ext) throw new Error('not an image the notes can keep');
				return storeFor(kind, id).saveAsset(new Uint8Array(await file.arrayBuffer()), ext);
			},
			url(src) {
				if (/^(https?|data|blob):/i.test(src)) return Promise.resolve(src);
				const store = storeFor(kind, id);
				const key = `${store.dir}/${src}`;
				let url = imageUrls.get(key);
				if (!url) {
					url = store.readFile(src).then((bytes) => (bytes ? URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: imageMime(src) })) : null));
					imageUrls.set(key, url);
					// A missing file may appear later (a sync client still downloading it).
					void url.then((u) => u || imageUrls.delete(key), () => imageUrls.delete(key));
				}
				return url;
			}
		};
	}

	/** Write the notes now, if any are waiting (before another window takes the paper or notebook). */
	export const flushNotes = (id: string, kind: NotesKind = 'paper') => savers.get(`${kind}/${id}`)?.flush() ?? Promise.resolve();
</script>

<script lang="ts">
	import type { JSONContent } from '@tiptap/core';
	import { onDestroy } from 'svelte';
	import { onDiskChange } from '#lib/disk-changes.js';
	import NotesEditor from './NotesEditor.svelte';
	import type { PaperRefs } from './paper-ref';

	let {
		id,
		kind = 'paper',
		onjump,
		anchor,
		title,
		placeholder,
		papers,
		ondoc,
		status = $bindable({ text: '', error: null })
	}: {
		id: string;
		kind?: NotesKind;
		/** The save state, for the pane's header. */
		status?: { text: string; error: string | null };
		onjump?: (anchor: PaperAnchor) => void;
		/** Where the reader is (for "Link to this page"). */
		anchor?: () => PaperAnchor | null;
		/** A new mind map's central topic (default: the paper's title). */
		title?: string;
		/** Shown in the empty editor. */
		placeholder?: string;
		/** Chips for papers of the library, typed with @ (a notebook's text). */
		papers?: PaperRefs;
		/** The document as loaded, then after each change. */
		ondoc?: (doc: NotesDoc | null) => void;
	} = $props();

	let editor = $state<NotesEditor>();

	/** Find in the notes (⌘F while in them). */
	export const openFind = () => editor?.openFind();

	/** A whole mind map at the end of the notes, once they're loaded. */
	export async function appendMindMap(map: MindMap) {
		for (let i = 0; i < 120 && !editor && notes.status !== 'error'; i++) await new Promise(requestAnimationFrame);
		editor?.appendMindMap(map);
	}

	/** A passage as a mind-map topic (see NotesEditor), once the notes are loaded. */
	export async function addToMindMap(text: string, page?: number) {
		for (let i = 0; i < 120 && !editor && notes.status !== 'error'; i++) await new Promise(requestAnimationFrame);
		editor?.addToMindMap(text, page);
	}

	/** An image into a drawing (see NotesEditor), once the notes are loaded. */
	export async function addToDrawing(file: File, page?: number) {
		for (let i = 0; i < 120 && !editor && notes.status !== 'error'; i++) await new Promise(requestAnimationFrame);
		await editor?.addToDrawing(file, page);
	}

	/** Add content at the end of the notes, once they're loaded (the pane may have just opened). */
	export async function append(nodes: JSONContent[] | string) {
		for (let i = 0; i < 120 && !editor && notes.status !== 'error'; i++) await new Promise(requestAnimationFrame);
		editor?.append(nodes);
	}

	/** Add content at the cursor, once the notes are loaded. */
	export async function insert(nodes: JSONContent[]) {
		for (let i = 0; i < 120 && !editor && notes.status !== 'error'; i++) await new Promise(requestAnimationFrame);
		editor?.insert(nodes);
	}

	const saver = $derived(saverFor(kind, id));
	const key = $derived(`${kind}/${id}`);
	let notes = $state<{ status: 'loading' } | { status: 'ready'; doc: NotesDoc | null } | { status: 'error'; error: string }>({ status: 'loading' });

	// Read once the last write (if any) is done: the file is then what was typed.
	$effect(() => {
		const current = key;
		const s = saver;
		const store = storeFor(kind, id);
		notes = { status: 'loading' };
		void s
			.flush()
			.then(() => store.read())
			.then((file) => {
				if (current !== key) return;
				known.set(current, JSON.stringify(file?.doc ?? null));
				notes = { status: 'ready', doc: file?.doc ?? null };
				ondoc?.(file?.doc ?? null);
			})
			.catch((e) => current === key && (notes = { status: 'error', error: e instanceof Error ? e.message : String(e) }));
	});
	// The notes changed on disk (another device, synced): shown here, unless there are edits
	// here still to save (they're written over it; see the roadmap's 6.5, conflicts).
	$effect(() => {
		const current = key;
		const s = saver;
		const store = storeFor(kind, id);
		return onDiskChange(async (paths) => {
			if (!paths.includes(`${store.dir}/notes.json`) || s.dirty || notes.status !== 'ready') return;
			const file = await store.read().catch(() => null);
			const json = JSON.stringify(file?.doc ?? null);
			if (!file || current !== key || s.dirty || json === known.get(current)) return;
			known.set(current, json);
			editor?.replace(file.doc as JSONContent);
			ondoc?.(file.doc);
		});
	});

	// Hidden (⌘E) or the window going: write what's waiting now.
	onDestroy(() => void saver.flush());

	$effect(() => {
		status = {
			text: saver.state === 'saving' || saver.state === 'pending' ? 'Saving…' : saver.state === 'error' ? 'Not saved' : saver.savedAt || (notes.status === 'ready' && notes.doc) ? 'Saved' : '',
			error: saver.state === 'error' ? saver.error : null
		};
	});
</script>

<!-- data-notes-pane: ⌘F in here finds in the notes, not in the paper. -->
<div class="contents" data-notes-pane>
<div class="min-h-0 flex-1 border-t border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
	{#if notes.status === 'ready'}
		{#key key}<NotesEditor bind:this={editor} content={notes.doc as JSONContent | null} onupdate={(doc) => (saver.change(doc as NotesDoc), ondoc?.(doc as NotesDoc))} {onjump} {anchor} {placeholder} {papers} assets={assetsFor(kind, id)} title={title ?? library.get(id)?.title ?? 'Topic'} />{/key}
	{:else if notes.status === 'error'}
		<div class="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
			<p class="font-medium">These notes couldn’t be read, so they’re left as they are.</p>
			<p class="mt-1 text-xs opacity-80">{notes.error}</p>
		</div>
	{/if}
</div>
</div>
