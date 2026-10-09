<!--
	The notes pane's content: header (save state, close) and the editor, loaded
	from and saved to `papers/<id>/notes.json` a moment after you stop typing.
-->
<script lang="ts" module>
	import { onFlush } from '#lib/flush.js';
	import { library } from '#lib/library.svelte.js';
	import type { NotesDoc, PaperAnchor } from '#lib/types.js';
	import { Saver } from './saver.svelte';

	// One saver per paper, outliving the pane: hiding it (⌘E) mid-save loses nothing,
	// and closing the window or quitting waits for the last write.
	const savers = new Map<string, Saver<NotesDoc>>();
	function saverFor(id: string) {
		let saver = savers.get(id);
		if (!saver) {
			const s = new Saver<NotesDoc>((doc) => library.repo!.saveNotes(id, doc));
			onFlush({ dirty: () => s.dirty, flush: () => s.flush().then(() => true) });
			savers.set(id, (saver = s));
		}
		return saver;
	}

	/** Write the paper's notes now, if any are waiting (before another window takes the paper). */
	export const flushNotes = (id: string) => savers.get(id)?.flush() ?? Promise.resolve();
</script>

<script lang="ts">
	import type { JSONContent } from '@tiptap/core';
	import { onDestroy } from 'svelte';
	import { keys } from '#lib/shortcuts.js';
	import { iconButton } from '#lib/ui/button.js';
	import Tip from '#lib/ui/Tip.svelte';
	import NotesEditor from './NotesEditor.svelte';

	let {
		id,
		onclose,
		onjump,
		anchor
	}: {
		id: string;
		onclose: () => void;
		onjump: (anchor: PaperAnchor) => void;
		/** Where the reader is (for "Link to this page"). */
		anchor: () => PaperAnchor | null;
	} = $props();

	let editor = $state<NotesEditor>();

	/** Add content at the end of the notes, once they're loaded (the pane may have just opened). */
	export async function append(nodes: JSONContent[]) {
		for (let i = 0; i < 120 && !editor && notes.status !== 'error'; i++) await new Promise(requestAnimationFrame);
		editor?.append(nodes);
	}

	const saver = $derived(saverFor(id));
	let notes = $state<{ status: 'loading' } | { status: 'ready'; doc: NotesDoc | null } | { status: 'error'; error: string }>({ status: 'loading' });

	// Read once the last write (if any) is done: the file is then what was typed.
	$effect(() => {
		const current = id;
		const s = saver;
		notes = { status: 'loading' };
		void s
			.flush()
			.then(() => library.repo!.readNotes(current))
			.then((file) => current === id && (notes = { status: 'ready', doc: file?.doc ?? null }))
			.catch((e) => current === id && (notes = { status: 'error', error: e instanceof Error ? e.message : String(e) }));
	});
	// Hidden (⌘E) or the window going: write what's waiting now.
	onDestroy(() => void saver.flush());

	const status = $derived(saver.state === 'saving' || saver.state === 'pending' ? 'Saving…' : saver.state === 'error' ? 'Not saved' : saver.savedAt || (notes.status === 'ready' && notes.doc) ? 'Saved' : '');
</script>

<div class="flex h-11 shrink-0 items-center gap-2 pr-2 pl-4" data-tauri-drag-region>
	<p class="text-[11px] font-medium tracking-wide text-muted uppercase" data-tauri-drag-region>Notes</p>
	<span class="flex-1 truncate text-[11px] {saver.state === 'error' ? 'text-red-600 dark:text-red-400' : 'text-muted'}" title={saver.error ?? undefined} aria-live="polite" data-tauri-drag-region>{status}</span>
	<Tip label="Hide notes" shortcut={keys.notesPane}>
		{#snippet child({ props })}<button {...props} class={iconButton(7)} aria-label="Hide notes" onclick={onclose}><span class="icon-[lucide--x] size-4"></span></button>{/snippet}
	</Tip>
</div>
<div class="min-h-0 flex-1 border-t border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
	{#if notes.status === 'ready'}
		{#key id}<NotesEditor bind:this={editor} content={notes.doc as JSONContent | null} onupdate={(doc) => saver.change(doc as NotesDoc)} {onjump} {anchor} />{/key}
	{:else if notes.status === 'error'}
		<div class="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
			<p class="font-medium">These notes couldn’t be read, so they’re left as they are.</p>
			<p class="mt-1 text-xs opacity-80">{notes.error}</p>
		</div>
	{/if}
</div>
