<!--
	Rich-text notes for a paper (TipTap / ProseMirror). The document is JSON
	(`notes.json`). A formatting bar on top; Markdown shortcuts as you type
	(# heading, - list, > quote, `code`); ⌘-click opens a link.
-->
<script lang="ts">
	import { Editor, type JSONContent } from '@tiptap/core';
	import Code from '@tiptap/extension-code';
	import { TaskItem, TaskList } from '@tiptap/extension-list';
	import { TableKit } from '@tiptap/extension-table';
	import type { Node as PMNode } from '@tiptap/pm/model';
	import 'katex/dist/katex.min.css';
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
	import { NotesBlockMath, NotesInlineMath } from './maths';
	import { imageFiles, MAX_IMAGE_BYTES, NotesImage, type NoteAssets } from './images';
	import { toast } from '#lib/components/Toasts.svelte';

	let {
		content,
		onupdate,
		onjump,
		anchor,
		assets,
		editable = true
	}: {
		/** The notes as loaded (null: none yet). Read once: the editor owns the document after that. */
		content: JSONContent | null;
		onupdate?: (doc: JSONContent) => void;
		/** A page chip was clicked. */
		onjump?: (anchor: PaperAnchor) => void;
		/** Where the reader is (for "Link to this page"); null before the paper shows. */
		anchor?: () => PaperAnchor | null;
		/** Where images are kept (none: images can't be added). */
		assets?: NoteAssets;
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
				NotesFind,
				TaskList,
				TaskItem.configure({ nested: true }),
				TableKit.configure({ table: { resizable: false } }),
				// A formula with an error shows as its source (red), never breaks the notes.
				NotesInlineMath.configure({ katexOptions: { throwOnError: false }, onClick: (node, pos) => void editMath(node, pos) }),
				NotesBlockMath.configure({ katexOptions: { throwOnError: false, displayMode: true }, onClick: (node, pos) => void editMath(node, pos) }),
				NotesImage.configure({ assets: assets ?? null })
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
				// Images pasted or dropped in: kept next to the paper.
				handlePaste: (_view, event) => {
					const files = imageFiles(event.clipboardData?.files);
					if (!files.length || !assets) return false;
					void addImages(files);
					return true;
				},
				handleDrop: (view, event, _slice, moved) => {
					const files = moved ? [] : imageFiles(event.dataTransfer?.files);
					if (!files.length || !assets) return false;
					event.preventDefault();
					void addImages(files, view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos);
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

	// ── Maths ─────────────────────────────────────────────────────────────
	const askLatex = (title: string, value = '') => prompts.ask(title, { value, placeholder: 'LaTeX, e.g. E = mc^2', confirmLabel: value ? 'Save' : 'Insert' });

	/** Click a formula: edit its LaTeX (emptied: removed). */
	async function editMath(node: PMNode, pos: number) {
		if (!editor?.isEditable) return;
		const latex = await askLatex('Edit equation', String(node.attrs.latex ?? ''));
		if (latex === null) return editor.commands.focus();
		editor
			.chain()
			.focus()
			.command(({ tr }) => {
				if (latex.trim()) tr.setNodeMarkup(pos, undefined, { ...node.attrs, latex: latex.trim() });
				else tr.delete(pos, pos + node.nodeSize);
				return true;
			})
			.run();
	}

	/** Inline maths: the selected text becomes the formula, else ask for one. */
	async function inlineMath() {
		if (!editor) return;
		const { from, to, empty } = editor.state.selection;
		const latex = empty ? await askLatex('Insert equation') : editor.state.doc.textBetween(from, to, ' ');
		if (!latex?.trim()) return editor.commands.focus();
		run((c) => c.insertContentAt({ from, to }, { type: 'inlineMath', attrs: { latex: latex.trim() } }));
	}

	async function blockMath() {
		const latex = await askLatex('Insert equation block');
		if (!latex?.trim()) return editor?.commands.focus();
		run((c) => c.insertContent({ type: 'blockMath', attrs: { latex: latex.trim() } }));
	}

	// ── Images ────────────────────────────────────────────────────────────
	let picker = $state<HTMLInputElement>();

	/** Save the images, then insert them (at `pos`, else at the cursor). */
	async function addImages(files: File[], pos?: number) {
		if (!assets) return;
		const nodes: JSONContent[] = [];
		for (const file of files) {
			if (file.size > MAX_IMAGE_BYTES) {
				toast(`${file.name} is too large for the notes (over ${MAX_IMAGE_BYTES / 1024 / 1024} MB)`, 'error');
				continue;
			}
			try {
				nodes.push({ type: 'image', attrs: { src: await assets.save(file), alt: file.name.replace(/\.[^.]+$/, '') } });
			} catch (e) {
				toast(`Couldn’t add ${file.name}: ${e instanceof Error ? e.message : e}`, 'error');
			}
		}
		if (!nodes.length || !editor) return;
		if (pos === undefined) run((c) => c.insertContent(nodes));
		else editor.chain().focus().insertContentAt(pos, nodes).run();
	}

	function onpick(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		void addImages(imageFiles(input.files));
		input.value = '';
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
			{ label: 'Checklist', icon: 'icon-[lucide--list-checks]', keys: `${mod}${shift}9`, on: () => run((c) => c.toggleTaskList()), isActive: () => active('taskList') },
			{ label: 'Quote', icon: 'icon-[lucide--text-quote]', keys: `${mod}${shift}B`, on: () => run((c) => c.toggleBlockquote()), isActive: () => active('blockquote') },
			{ label: 'Code block', icon: 'icon-[lucide--square-code]', keys: `${alt}${mod}C`, on: () => run((c) => c.toggleCodeBlock()), isActive: () => active('codeBlock') },
			{ label: 'Table', icon: 'icon-[lucide--table]', on: () => run((c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true })), isActive: () => active('table') },
			{ label: 'Equation ($…$)', icon: 'icon-[lucide--sigma]', on: inlineMath },
			{ label: 'Equation block ($$…$$)', icon: 'icon-[lucide--square-sigma]', on: blockMath },
			{ label: 'Image (or paste / drop one)', icon: 'icon-[lucide--image-plus]', on: () => picker?.click(), disabled: () => !assets }
		],
		[
			{ label: 'Undo', icon: 'icon-[lucide--undo-2]', keys: `${mod}Z`, on: () => run((c) => c.undo()), disabled: () => !can((e) => e.can().undo()) },
			{ label: 'Redo', icon: 'icon-[lucide--redo-2]', keys: `${mod}${shift}Z`, on: () => run((c) => c.redo()), disabled: () => !can((e) => e.can().redo()) }
		]
	];

	// In a table: its rows and columns.
	const tableItems: Item[] = [
		{ label: 'Add a row below', icon: 'icon-[lucide--between-vertical-start]', on: () => run((c) => c.addRowAfter()) },
		{ label: 'Add a column to the right', icon: 'icon-[lucide--between-horizontal-start]', on: () => run((c) => c.addColumnAfter()) },
		{ label: 'Delete the row', icon: 'icon-[lucide--table-rows-split]', on: () => run((c) => c.deleteRow()) },
		{ label: 'Delete the column', icon: 'icon-[lucide--table-columns-split]', on: () => run((c) => c.deleteColumn()) },
		{ label: 'Header row', icon: 'icon-[lucide--panel-top]', on: () => run((c) => c.toggleHeaderRow()), isActive: () => (void version, !!editor && editor.isActive('tableHeader')) },
		{ label: 'Delete the table', icon: 'icon-[lucide--grid-2x2-x]', on: () => run((c) => c.deleteTable()) }
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
	{#if editable && active('table')}
		<div class="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-stone-200 bg-stone-50 px-3 py-1 dark:border-stone-800 dark:bg-stone-900/60" role="toolbar" aria-label="Table">
			<span class="mr-1 text-[11px] font-medium tracking-wide text-muted uppercase">Table</span>
			{#each tableItems as item (item.label)}
				<Tip label={item.label}>
					{#snippet child({ props })}
						<button {...props} type="button" class={btn} aria-label={item.label} aria-pressed={item.isActive ? item.isActive() : undefined} data-active={item.isActive?.() || undefined} onmousedown={(e) => e.preventDefault()} onclick={item.on}>
							<span class="{item.icon} size-4"></span>
						</button>
					{/snippet}
				</Tip>
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
	<input bind:this={picker} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/svg+xml" multiple hidden onchange={onpick} />
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
	/* Checklists: a tick box, then the item; ticked ones struck through. */
	:global(.notes-editor ul[data-type='taskList']) {
		list-style: none;
		padding-left: 0.1em;
	}
	:global(.notes-editor ul[data-type='taskList'] li) {
		display: flex;
		gap: 0.5em;
		align-items: flex-start;
	}
	:global(.notes-editor ul[data-type='taskList'] li > label) {
		flex-shrink: 0;
		margin-top: 0.3em;
		user-select: none;
	}
	/* A square box (not the system's rounded one); ticked: just a tick, no fill. */
	:global(.notes-editor ul[data-type='taskList'] li > label input) {
		appearance: none;
		-webkit-appearance: none;
		display: grid;
		place-content: center;
		width: 1em;
		height: 1em;
		margin: 0;
		border: 1.5px solid var(--color-stone-400, #a8a29e);
		border-radius: 3px;
		background: transparent;
		color: var(--color-stone-800, #292524);
		cursor: pointer;
		outline: none;
	}
	:global(.notes-editor ul[data-type='taskList'] li > label input:hover) {
		border-color: var(--color-stone-500, #78716c);
	}
	:global(.notes-editor ul[data-type='taskList'] li > label input:focus-visible) {
		outline: 2px solid rgb(14 165 233 / 0.6);
		outline-offset: 1px;
	}
	:global(.notes-editor ul[data-type='taskList'] li > label input:checked::before) {
		content: '';
		width: 0.72em;
		height: 0.72em;
		background: currentColor;
		mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3 8.5l3.2 3.2L13 4.8' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / contain no-repeat;
	}
	:global(.dark .notes-editor ul[data-type='taskList'] li > label input) {
		border-color: var(--color-stone-500, #78716c);
		color: var(--color-stone-100, #f5f5f4);
	}
	:global(.notes-editor ul[data-type='taskList'] li > div) {
		flex: 1;
		min-width: 0;
	}
	:global(.notes-editor ul[data-type='taskList'] li[data-checked='true'] > div) {
		color: var(--color-stone-400, #a8a29e);
		text-decoration: line-through;
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
	/* Tables: ruled cells, the header row shaded; scrolls sideways when wide. */
	:global(.notes-editor .tableWrapper) {
		overflow-x: auto;
	}
	:global(.notes-editor table) {
		border-collapse: collapse;
		table-layout: fixed;
		width: 100%;
		font-size: 0.93em;
	}
	:global(.notes-editor th),
	:global(.notes-editor td) {
		border: 1px solid var(--color-stone-300, #d6d3d1);
		padding: 0.3em 0.5em;
		vertical-align: top;
		min-width: 3em;
		position: relative;
	}
	:global(.notes-editor th) {
		background: rgb(0 0 0 / 0.04);
		font-weight: 600;
		text-align: left;
	}
	:global(.notes-editor td > p),
	:global(.notes-editor th > p) {
		margin: 0;
	}
	:global(.notes-editor .selectedCell::after) {
		content: '';
		position: absolute;
		inset: 0;
		background: rgb(14 165 233 / 0.15);
		pointer-events: none;
	}
	:global(.dark .notes-editor th),
	:global(.dark .notes-editor td) {
		border-color: var(--color-stone-700, #44403c);
	}
	:global(.dark .notes-editor th) {
		background: rgb(255 255 255 / 0.05);
	}
	/* Maths (KaTeX): click to edit. */
	:global(.notes-editor .tiptap-mathematics-render) {
		border-radius: 4px;
		padding: 0 0.15em;
	}
	:global(.notes-editor .tiptap-mathematics-render--editable) {
		cursor: pointer;
	}
	:global(.notes-editor .tiptap-mathematics-render--editable:hover) {
		background: rgb(14 165 233 / 0.1);
	}
	:global(.notes-editor [data-type='block-math']) {
		display: block;
		text-align: center;
		padding: 0.4em 0;
		overflow-x: auto;
	}
	:global(.notes-editor .ProseMirror-selectednode.tiptap-mathematics-render),
	:global(.notes-editor .ProseMirror-selectednode .tiptap-mathematics-render) {
		outline: 2px solid rgb(14 165 233 / 0.6);
	}
	/* Images: as wide as the notes at most. */
	:global(.notes-editor img.notes-image) {
		display: block;
		max-width: 100%;
		height: auto;
		border-radius: 6px;
		margin: 0.4em 0;
	}
	:global(.notes-editor img.notes-image.ProseMirror-selectednode) {
		outline: 2px solid rgb(14 165 233 / 0.6);
	}
	:global(.notes-editor img.notes-image-missing) {
		min-height: 2.5em;
		min-width: 8em;
		background: rgb(0 0 0 / 0.05);
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
