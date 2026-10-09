<!--
	Rich-text notes for a paper (TipTap / ProseMirror). The document is JSON
	(`notes.json`). A formatting bar on top; Markdown shortcuts as you type
	(# heading, - list, > quote, `code`); ⌘-click opens a link.
-->
<script lang="ts">
	import { Editor, type JSONContent } from '@tiptap/core';
	import Code from '@tiptap/extension-code';
	import { Placeholder } from '@tiptap/extensions';
	import StarterKit from '@tiptap/starter-kit';
	import { onDestroy, tick, untrack } from 'svelte';
	import { mac } from '#lib/os.js';
	import { platform } from '#lib/platform/index.js';
	import { iconButton } from '#lib/ui/button.js';
	import { prompts } from '#lib/ui/prompt.svelte.js';
	import Separator from '#lib/ui/Separator.svelte';
	import Tip from '#lib/ui/Tip.svelte';
	import type { PaperAnchor } from '#lib/types.js';
	import { PaperLink, paperLinkNode, toAnchor } from './paper-link';
	import { findMatches, findStep, NotesFind, setFindQuery } from './find';

	let {
		content,
		onupdate,
		onjump,
		anchor,
		editable = true
	}: {
		/** The notes as loaded (null: none yet). Read once: the editor owns the document after that. */
		content: JSONContent | null;
		onupdate?: (doc: JSONContent) => void;
		/** A page chip was clicked. */
		onjump?: (anchor: PaperAnchor) => void;
		/** Where the reader is (for "Link to this page"); null before the paper shows. */
		anchor?: () => PaperAnchor | null;
		editable?: boolean;
	} = $props();

	// ── Find in the notes (⌘F while in them) ──────────────────────────────
	let findOpen = $state(false);
	let findQuery = $state('');
	let findInput = $state<HTMLInputElement>();
	let found = $state({ index: -1, count: 0 });

	/** Show the find bar, filled with the selected text if any. */
	export async function openFind() {
		const selected = editor ? editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ') : '';
		if (selected && !selected.includes('\n')) findQuery = selected;
		findOpen = true;
		await tick();
		findInput?.focus();
		findInput?.select();
		search();
	}

	function search() {
		if (!editor) return;
		const count = setFindQuery(editor, findQuery);
		found = { index: count ? 0 : -1, count };
	}

	function step(dir: 1 | -1) {
		if (editor && found.count) found = findStep(editor, dir);
	}

	function closeFind() {
		findOpen = false;
		if (editor) setFindQuery(editor, '');
		editor?.commands.focus();
	}

	function onFindKey(e: KeyboardEvent) {
		if (e.key === 'Enter') (e.preventDefault(), step(e.shiftKey ? -1 : 1));
		else if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), closeFind());
	}

	// The matches follow edits.
	$effect(() => {
		void version;
		if (findOpen && editor) untrack(() => (found = { ...found, count: findMatches(editor!.state.doc, findQuery).length }));
	});

	/** Add content at the end of the notes (a quote from the paper…), and go on writing after it. */
	export function append(nodes: JSONContent[]) {
		editor?.chain().focus('end').insertContent(nodes).scrollIntoView().run();
	}

	let element = $state<HTMLElement>();
	let editor = $state.raw<Editor>();
	// Bumped on every transaction: the bar's active states follow the selection.
	let version = $state(0);

	$effect(() => {
		if (!element || editor) return;
		const e = new Editor({
			element,
			content: content ?? undefined,
			editable,
			extensions: [
				// ⌘E belongs to the app (the notes pane): inline code is `backticks` or the bar.
				StarterKit.configure({ code: false, link: { openOnClick: false, autolink: true, defaultProtocol: 'https' } }),
				Code.extend({ addKeyboardShortcuts: () => ({}) }),
				Placeholder.configure({ placeholder: 'Write your notes about this paper…' }),
				PaperLink,
				NotesFind
			],
			editorProps: {
				attributes: { class: 'notes-editor min-h-full px-5 py-4 outline-none', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Notes', 'data-notes-editor': '' },
				// ⌘-click (Ctrl-click) a link: open it in the browser.
				// A page chip: jump there.
				handleClickOn: (_view, _pos, node) => {
					if (node.type.name !== 'paperLink') return false;
					onjump?.(toAnchor(node.attrs));
					return true;
				},
				handleClick: (_view, _pos, event) => {
					const link = (event.target as Element | null)?.closest?.('a[href]');
					if (!link || !(mac ? event.metaKey : event.ctrlKey)) return false;
					void platform.openUrl(link.getAttribute('href')!);
					return true;
				}
			},
			// Deferred: a transaction can happen while the bar is rendering (e.g. `can()` checks).
			onTransaction: () => queueMicrotask(() => version++),
			onUpdate: ({ editor }) => onupdate?.(editor.getJSON())
		});
		editor = e;
	});
	// Without an update event (it's no edit), and tracking only these two: whatever the
	// update handlers read must not re-run this.
	$effect(() => {
		const e = editor;
		const on = editable;
		untrack(() => e?.setEditable(on, false));
	});
	onDestroy(() => editor?.destroy());

	const active = (name: string, attrs?: Record<string, unknown>) => (void version, editor?.isActive(name, attrs) ?? false);
	const can = (fn: (e: Editor) => boolean) => (void version, editor ? fn(editor) : false);
	const run = (fn: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => editor && fn(editor.chain().focus()).run();

	async function editLink() {
		if (!editor) return;
		const current = editor.getAttributes('link').href as string | undefined;
		const url = await prompts.ask(current ? 'Edit link' : 'Add link', { value: current ?? '', placeholder: 'https://…', confirmLabel: current ? 'Save' : 'Add' });
		if (url === null) return editor.commands.focus();
		if (!url.trim()) return run((c) => c.extendMarkRange('link').unsetLink());
		run((c) => c.extendMarkRange('link').setLink({ href: url.trim() }));
	}

	function linkHere() {
		const a = anchor?.();
		if (a) run((c) => c.insertContent([paperLinkNode(a), { type: 'text', text: ' ' }]));
	}

	const mod = mac ? '⌘' : 'Ctrl+';
	const alt = mac ? '⌥' : 'Alt+';
	const shift = mac ? '⇧' : 'Shift+';
	const btn = iconButton(7, 'data-[active]:bg-stone-200 dark:data-[active]:bg-stone-700');
	type Item = { label: string; icon: string; keys?: string; on: () => unknown; isActive?: () => boolean; disabled?: () => boolean };
	const groups: Item[][] = [
		[
			{ label: 'Bold', icon: 'icon-[lucide--bold]', keys: `${mod}B`, on: () => run((c) => c.toggleBold()), isActive: () => active('bold') },
			{ label: 'Italic', icon: 'icon-[lucide--italic]', keys: `${mod}I`, on: () => run((c) => c.toggleItalic()), isActive: () => active('italic') },
			{ label: 'Underline', icon: 'icon-[lucide--underline]', keys: `${mod}U`, on: () => run((c) => c.toggleUnderline()), isActive: () => active('underline') },
			{ label: 'Strikethrough', icon: 'icon-[lucide--strikethrough]', keys: `${mod}${shift}S`, on: () => run((c) => c.toggleStrike()), isActive: () => active('strike') },
			{ label: 'Inline code', icon: 'icon-[lucide--code]', on: () => run((c) => c.toggleCode()), isActive: () => active('code') },
			{ label: 'Link', icon: 'icon-[lucide--link]', on: editLink, isActive: () => active('link') },
			{ label: 'Link to the page you’re reading', icon: 'icon-[lucide--file-symlink]', on: linkHere, disabled: () => !anchor?.() }
		],
		[
			{ label: 'Heading 1', icon: 'icon-[lucide--heading-1]', keys: `${alt}${mod}1`, on: () => run((c) => c.toggleHeading({ level: 1 })), isActive: () => active('heading', { level: 1 }) },
			{ label: 'Heading 2', icon: 'icon-[lucide--heading-2]', keys: `${alt}${mod}2`, on: () => run((c) => c.toggleHeading({ level: 2 })), isActive: () => active('heading', { level: 2 }) },
			{ label: 'Heading 3', icon: 'icon-[lucide--heading-3]', keys: `${alt}${mod}3`, on: () => run((c) => c.toggleHeading({ level: 3 })), isActive: () => active('heading', { level: 3 }) }
		],
		[
			{ label: 'Bulleted list', icon: 'icon-[lucide--list]', keys: `${mod}${shift}8`, on: () => run((c) => c.toggleBulletList()), isActive: () => active('bulletList') },
			{ label: 'Numbered list', icon: 'icon-[lucide--list-ordered]', keys: `${mod}${shift}7`, on: () => run((c) => c.toggleOrderedList()), isActive: () => active('orderedList') },
			{ label: 'Quote', icon: 'icon-[lucide--text-quote]', keys: `${mod}${shift}B`, on: () => run((c) => c.toggleBlockquote()), isActive: () => active('blockquote') },
			{ label: 'Code block', icon: 'icon-[lucide--square-code]', keys: `${alt}${mod}C`, on: () => run((c) => c.toggleCodeBlock()), isActive: () => active('codeBlock') }
		],
		[
			{ label: 'Undo', icon: 'icon-[lucide--undo-2]', keys: `${mod}Z`, on: () => run((c) => c.undo()), disabled: () => !can((e) => e.can().undo()) },
			{ label: 'Redo', icon: 'icon-[lucide--redo-2]', keys: `${mod}${shift}Z`, on: () => run((c) => c.redo()), disabled: () => !can((e) => e.can().redo()) }
		]
	];
</script>

<div class="flex h-full min-h-0 flex-col">
	{#if editable}
		<div class="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-stone-200 px-3 py-1 dark:border-stone-800" role="toolbar" aria-label="Formatting">
			{#each groups as group, gi (gi)}
				{#if gi}<Separator class="mx-1" />{/if}
				{#each group as item (item.label)}
					<Tip label={item.label} shortcut={item.keys}>
						{#snippet child({ props })}
							<!-- mousedown: keep the editor's selection (the button never takes focus from it). -->
							<button {...props} type="button" class={btn} aria-label={item.label} aria-pressed={item.isActive ? item.isActive() : undefined} data-active={item.isActive?.() || undefined} disabled={item.disabled?.()} onmousedown={(e) => e.preventDefault()} onclick={item.on}>
								<span class="{item.icon} size-4"></span>
							</button>
						{/snippet}
					</Tip>
				{/each}
			{/each}
		</div>
	{/if}
	{#if findOpen}
		<div class="flex shrink-0 items-center gap-1 border-b border-stone-200 px-3 py-1.5 dark:border-stone-800">
			<div class="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-edge bg-white px-2 focus-within:ring-2 focus-within:ring-blue-500 dark:bg-stone-900 dark:focus-within:ring-blue-400">
				<span class="icon-[lucide--search] size-3.5 shrink-0 text-stone-400"></span>
				<input bind:this={findInput} bind:value={findQuery} oninput={search} onkeydown={onFindKey} class="min-w-0 flex-1 bg-transparent py-1 text-[13px] outline-none placeholder:text-muted" placeholder="Find in notes" aria-label="Find in notes" />
				<span class="text-[11px] whitespace-nowrap text-muted tabular-nums" aria-live="polite">{findQuery ? (found.count ? `${found.index + 1}/${found.count}` : 'No match') : ''}</span>
			</div>
			<Tip label="Previous match" shortcut={mac ? '⇧↵' : 'Shift+Enter'}>{#snippet child({ props })}<button {...props} type="button" class={iconButton(7)} aria-label="Previous match" disabled={!found.count} onclick={() => step(-1)}><span class="icon-[lucide--chevron-up] size-4"></span></button>{/snippet}</Tip>
			<Tip label="Next match" shortcut="↵">{#snippet child({ props })}<button {...props} type="button" class={iconButton(7)} aria-label="Next match" disabled={!found.count} onclick={() => step(1)}><span class="icon-[lucide--chevron-down] size-4"></span></button>{/snippet}</Tip>
			<Tip label="Close" shortcut="Esc">{#snippet child({ props })}<button {...props} type="button" class={iconButton(7)} aria-label="Close find" onclick={closeFind}><span class="icon-[lucide--x] size-4"></span></button>{/snippet}</Tip>
		</div>
	{/if}
	<div class="min-h-0 flex-1 overflow-y-auto" bind:this={element}></div>
</div>

<style>
	:global(.notes-editor) {
		font-size: 14px;
		line-height: 1.6;
		color: var(--color-stone-800, #292524);
	}
	:global(.dark .notes-editor) {
		color: var(--color-stone-100, #f5f5f4);
	}
	:global(.dark .notes-editor blockquote) {
		border-color: var(--color-stone-600, #57534e);
		color: var(--color-stone-300, #d6d3d1);
	}
	:global(.dark .notes-editor code),
	:global(.dark .notes-editor pre) {
		background: rgb(255 255 255 / 0.08);
	}
	:global(.dark .notes-editor a) {
		color: var(--color-sky-400, #38bdf8);
	}
	:global(.dark .notes-editor hr) {
		border-color: var(--color-stone-700, #44403c);
	}
	:global(.notes-editor > * + *) {
		margin-top: 0.6em;
	}
	:global(.notes-editor h1),
	:global(.notes-editor h2),
	:global(.notes-editor h3) {
		font-family: var(--font-serif);
		line-height: 1.25;
		margin-top: 1.1em;
	}
	:global(.notes-editor h1) {
		font-size: 1.5em;
	}
	:global(.notes-editor h2) {
		font-size: 1.25em;
	}
	:global(.notes-editor h3) {
		font-size: 1.08em;
		font-weight: 600;
	}
	:global(.notes-editor > :first-child) {
		margin-top: 0;
	}
	:global(.notes-editor ul) {
		list-style: disc;
		padding-left: 1.4em;
	}
	:global(.notes-editor ol) {
		list-style: decimal;
		padding-left: 1.4em;
	}
	:global(.notes-editor li > p) {
		margin: 0.15em 0;
	}
	:global(.notes-editor blockquote) {
		border-left: 3px solid var(--color-stone-300, #d6d3d1);
		padding-left: 0.9em;
		color: var(--color-stone-600, #57534e);
		font-family: var(--font-serif);
	}
	:global(.notes-editor code) {
		font-family: var(--font-mono);
		font-size: 0.88em;
		background: rgb(0 0 0 / 0.06);
		border-radius: 4px;
		padding: 0.1em 0.3em;
	}
	:global(.notes-editor pre) {
		font-family: var(--font-mono);
		font-size: 0.85em;
		background: rgb(0 0 0 / 0.05);
		border-radius: 6px;
		padding: 0.7em 0.9em;
		overflow-x: auto;
	}
	:global(.notes-editor pre code) {
		background: none;
		padding: 0;
	}
	:global(.notes-editor a) {
		color: var(--color-sky-700, #0369a1);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	:global(.notes-editor hr) {
		border: none;
		border-top: 1px solid var(--color-stone-200, #e7e5e4);
		margin: 1.2em 0;
	}
	/* A link to a place in the paper. */
	:global(.notes-editor .paper-link) {
		display: inline-block;
		cursor: pointer;
		border-radius: 999px;
		padding: 0 0.5em;
		font-size: 0.8em;
		font-family: var(--font-sans);
		line-height: 1.6;
		vertical-align: 0.08em;
		background: rgb(14 165 233 / 0.12);
		color: var(--color-sky-800, #075985);
		white-space: nowrap;
	}
	:global(.notes-editor .paper-link:hover) {
		background: rgb(14 165 233 / 0.22);
	}
	:global(.notes-editor .paper-link.ProseMirror-selectednode) {
		outline: 2px solid rgb(14 165 233 / 0.6);
	}
	:global(.dark .notes-editor .paper-link) {
		background: rgb(56 189 248 / 0.16);
		color: var(--color-sky-300, #7dd3fc);
	}
	/* Find in the notes. */
	:global(.notes-editor .notes-match) {
		background: rgb(252 211 77 / 0.45);
		border-radius: 2px;
	}
	:global(.notes-editor .notes-match-current) {
		background: rgb(245 158 11 / 0.7);
	}
	/* The placeholder, while the notes are empty. */
	:global(.notes-editor p.is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		float: left;
		height: 0;
		pointer-events: none;
		color: var(--color-stone-400, #a8a29e);
	}
</style>
