<!--
	The sidebar's Notebooks: folders and notebooks as a tree. Click a folder to open or
	close it (remembered on this device), a notebook to open it. Double-click or F2
	renames; right-click for the rest. Drag an item onto a folder (into it) or between
	items (beside them); ⌥↑ ⌥↓ move it among its neighbors, ⌥← out of its folder,
	⌥→ into the folder above it.
-->
<script lang="ts">
	import { settings } from '#lib/settings.svelte.js';
	import { iconButton, mutedIcon } from '#lib/ui/button.js';
	import { contextMenu, type MenuItem } from '#lib/ui/context-menu.svelte.js';
	import { prompts } from '#lib/ui/prompt.svelte.js';
	import Tip from '#lib/ui/Tip.svelte';
	import { toast } from '#lib/components/Toasts.svelte';
	import MoveToDialog from './MoveToDialog.svelte';
	import { notebooks } from './notebooks.svelte';
	import { canMove, type NotebookKind, type NotebookNode } from './tree';

	let { onopen }: { onopen?: (n: NotebookNode) => void } = $props();

	const fail = (e: unknown) => toast(String(e), 'error');

	// ── Open folders (this device) ────────────────────────────────────────
	const expanded = $derived(new Set(settings.values.notebooksExpanded));
	function setExpanded(id: string, open: boolean) {
		if (expanded.has(id) === open) return;
		const ids = new Set(expanded);
		if (open) ids.add(id);
		else ids.delete(id);
		// Only folders still there are kept.
		settings.set('notebooksExpanded', [...ids].filter((x) => notebooks.get(x)?.kind === 'folder'));
	}
	/** Open every folder up to an item, so it shows. */
	function reveal(id: string) {
		for (let p = notebooks.parentOf(id); p; p = notebooks.parentOf(p)) setExpanded(p, true);
	}

	// ── Creating and renaming ─────────────────────────────────────────────
	let editing = $state<string | null>(null);
	let draft = $state('');

	async function add(kind: NotebookKind, parent?: string) {
		try {
			const n = await notebooks.create(kind, kind === 'folder' ? 'New folder' : 'Untitled', parent);
			if (parent) setExpanded(parent, true);
			reveal(n.id);
			rename(n);
		} catch (e) {
			fail(e);
		}
	}

	function rename(n: NotebookNode) {
		draft = n.title;
		editing = n.id;
	}

	function commit(n: NotebookNode) {
		if (editing !== n.id) return;
		editing = null;
		void notebooks.rename(n.id, draft).catch(fail);
	}

	/** The title field: focused with its text selected. */
	function selectAll(node: HTMLInputElement) {
		node.focus();
		node.select();
	}

	// ── Deleting ─────────────────────────────────────────────────────────
	async function remove(n: NotebookNode) {
		const inside = notebooks.children(n.id).length;
		if (n.kind === 'folder' && inside) {
			const choice = await prompts.choose(`Delete the folder “${n.title}”?`, [
				{ value: 'trash', label: 'Delete everything' },
				{ value: 'keep', label: 'Keep what’s inside' }
			], { message: `It holds ${inside} item${inside > 1 ? 's' : ''}. Kept, they move up a level, where the folder was; deleted, they go to the trash with it.` });
			if (choice) await notebooks.remove(n.id, choice).catch(fail);
			return;
		}
		const what = n.kind === 'folder' ? 'the folder' : 'the notebook';
		const ok = await prompts.confirm(`Delete ${what} “${n.title}”?`, { message: n.kind === 'notebook' ? 'Its text and chats go to the trash.' : undefined, confirmLabel: 'Delete', danger: true });
		if (ok) await notebooks.remove(n.id).catch(fail);
	}

	// ── Moving ───────────────────────────────────────────────────────────
	let moving = $state<NotebookNode | null>(null);

	async function moveTo(n: NotebookNode, parent: string | undefined, index: number) {
		try {
			await notebooks.move(n.id, parent, index);
			if (parent) setExpanded(parent, true);
			focusRow(n.id);
		} catch (e) {
			fail(e);
		}
	}

	/** ⌥-arrows: up and down among its neighbors, out of its folder, into the folder above. */
	function moveByKey(n: NotebookNode, key: string) {
		const parent = notebooks.parentOf(n.id);
		const siblings = notebooks.children(parent);
		const i = siblings.findIndex((s) => s.id === n.id);
		if (key === 'ArrowUp' && i > 0) return moveTo(n, parent, i - 1);
		if (key === 'ArrowDown' && i < siblings.length - 1) return moveTo(n, parent, i + 1);
		if (key === 'ArrowLeft' && parent) {
			const up = notebooks.parentOf(parent);
			return moveTo(n, up, notebooks.children(up).findIndex((s) => s.id === parent) + 1);
		}
		if (key === 'ArrowRight') {
			const above = siblings[i - 1];
			if (above?.kind === 'folder') return moveTo(n, above.id, notebooks.children(above.id).length);
		}
	}

	// Drag and drop: onto a folder's middle goes inside it, the top or bottom edge of any row beside it.
	type Drop = { id: string; where: 'before' | 'after' | 'inside' } | { id: null; where: 'end' };
	let dragging = $state<string | null>(null);
	let drop = $state<Drop | null>(null);
	let openTimer: ReturnType<typeof setTimeout> | undefined;

	function dropFor(e: DragEvent, n: NotebookNode): Drop | null {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const y = (e.clientY - r.top) / r.height;
		// An open folder's bottom edge leads into it, so it means inside.
		const where = n.kind === 'folder' ? (y < 0.25 ? 'before' : y > 0.75 && !expanded.has(n.id) ? 'after' : 'inside') : y < 0.5 ? 'before' : 'after';
		const parent = where === 'inside' ? n.id : notebooks.parentOf(n.id);
		return dragging && dragging !== n.id && canMove(notebooks.nodes, dragging, parent) ? { id: n.id, where } : null;
	}

	function ondragover(e: DragEvent, n: NotebookNode) {
		if (!dragging) return;
		e.stopPropagation();
		const d = dropFor(e, n);
		if (!d) return void (drop = null);
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		if (JSON.stringify(d) === JSON.stringify(drop)) return;
		drop = d;
		// Held over a closed folder: it opens.
		clearTimeout(openTimer);
		if (d.where === 'inside' && !expanded.has(n.id)) openTimer = setTimeout(() => setExpanded(n.id, true), 700);
	}

	function ondrop(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		clearTimeout(openTimer);
		const n = dragging && notebooks.get(dragging);
		const d = drop;
		dragging = drop = null;
		if (!n || !d) return;
		if (d.where === 'end') return void moveTo(n, undefined, notebooks.children().length);
		if (d.where === 'inside') return void moveTo(n, d.id, notebooks.children(d.id).length);
		const parent = notebooks.parentOf(d.id);
		const others = notebooks.children(parent).filter((s) => s.id !== n.id);
		const i = others.findIndex((s) => s.id === d.id);
		void moveTo(n, parent, d.where === 'before' ? i : i + 1);
	}

	// ── Rows ─────────────────────────────────────────────────────────────
	let tree = $state<HTMLElement>();
	function focusRow(id: string) {
		requestAnimationFrame(() => tree?.querySelector<HTMLElement>(`[data-notebook="${CSS.escape(id)}"]`)?.focus());
	}

	function activate(n: NotebookNode) {
		if (n.kind === 'folder') setExpanded(n.id, !expanded.has(n.id));
		else onopen?.(n);
	}

	/** The rows shown, in order (for ↑ ↓). */
	function visible(parent?: string): NotebookNode[] {
		return notebooks.children(parent).flatMap((n) => [n, ...(n.kind === 'folder' && expanded.has(n.id) ? visible(n.id) : [])]);
	}

	function onkeydown(e: KeyboardEvent, n: NotebookNode) {
		if (editing) return;
		if (e.altKey && e.key.startsWith('Arrow')) {
			e.preventDefault();
			return void moveByKey(n, e.key);
		}
		if (e.metaKey || e.ctrlKey || e.altKey) {
			if ((e.key === 'Backspace' || e.key === 'Delete') && !e.altKey) {
				e.preventDefault();
				void remove(n);
			}
			return;
		}
		const rows = visible();
		const i = rows.findIndex((r) => r.id === n.id);
		const go = (r?: NotebookNode) => r && (e.preventDefault(), focusRow(r.id));
		if (e.key === 'ArrowDown') go(rows[i + 1]);
		else if (e.key === 'ArrowUp') go(rows[i - 1]);
		else if (e.key === 'ArrowRight' && n.kind === 'folder') (e.preventDefault(), expanded.has(n.id) ? go(notebooks.children(n.id)[0]) : setExpanded(n.id, true));
		else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			if (n.kind === 'folder' && expanded.has(n.id)) setExpanded(n.id, false);
			else go(notebooks.get(notebooks.parentOf(n.id) ?? ''));
		} else if (e.key === 'F2') {
			e.preventDefault();
			rename(n);
		}
	}

	function menu(n: NotebookNode): MenuItem[] {
		const folder = n.kind === 'folder';
		return [
			...(folder
				? [
						{ label: 'New notebook', icon: 'icon-[lucide--notebook-pen]', onSelect: () => add('notebook', n.id) },
						{ label: 'New folder', icon: 'icon-[lucide--folder-plus]', onSelect: () => add('folder', n.id) }
					]
				: [{ label: 'Open', icon: 'icon-[lucide--square-arrow-out-up-right]', onSelect: () => onopen?.(n) }]),
			{ label: 'Rename', icon: 'icon-[lucide--pencil]', shortcut: 'F2', separatorBefore: true, onSelect: () => rename(n) },
			{ label: 'Move to…', icon: 'icon-[lucide--folder-input]', onSelect: () => (moving = n) },
			{ label: 'Delete…', icon: 'icon-[lucide--trash-2]', danger: true, separatorBefore: true, onSelect: () => remove(n) }
		];
	}

	const row =
		'group relative flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-[13px] outline-none select-none hover:bg-stone-200/60 focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-stone-800/60 dark:focus-visible:ring-blue-400';
	const headerBtn = iconButton(6, `${mutedIcon} -m-1 hover:bg-transparent`);
</script>

{#snippet branch(parent: string | undefined, depth: number)}
	{#each notebooks.children(parent) as n (n.id)}
		{@const folder = n.kind === 'folder'}
		{@const open = folder && expanded.has(n.id)}
		<li role="none">
			{#if editing === n.id}
				<div class="flex items-center gap-1.5 py-0.5 pr-1" style:padding-left="{depth * 14 + 8}px">
					<span class="size-3.5 shrink-0"></span>
					<span class="size-4 shrink-0 text-stone-500 {folder ? 'icon-[lucide--folder]' : 'icon-[lucide--notebook-text]'}"></span>
					<input
						class="min-w-0 flex-1 rounded-sm border border-stone-300 bg-white px-1 py-0.5 text-[13px] outline-none focus:border-blue-500 dark:border-stone-600 dark:bg-stone-900"
						aria-label="Name"
						bind:value={draft}
						{@attach selectAll}
						onkeydown={(e) => {
							if (e.key === 'Enter') (e.preventDefault(), commit(n), focusRow(n.id));
							else if (e.key === 'Escape') (e.preventDefault(), (editing = null), focusRow(n.id));
						}}
						onblur={() => commit(n)}
					/>
				</div>
			{:else}
				<button
					class={row}
					class:opacity-40={dragging === n.id}
					class:bg-stone-200={drop?.id === n.id && drop.where === 'inside'}
					class:dark:bg-stone-800={drop?.id === n.id && drop.where === 'inside'}
					style:padding-left="{depth * 14 + 8}px"
					role="treeitem"
					aria-level={depth + 1}
					aria-expanded={folder ? open : undefined}
					aria-selected={false}
					data-notebook={n.id}
					draggable="true"
					onclick={() => activate(n)}
					ondblclick={(e) => (e.preventDefault(), rename(n))}
					onkeydown={(e) => onkeydown(e, n)}
					ondragstart={(e) => {
						dragging = n.id;
						e.dataTransfer?.setData('text/plain', n.title);
						if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
					}}
					ondragend={() => (clearTimeout(openTimer), (dragging = drop = null))}
					ondragover={(e) => ondragover(e, n)}
					{ondrop}
					{@attach contextMenu(() => menu(n))}
				>
					{#if drop?.id === n.id && drop.where === 'before'}<span class="absolute inset-x-1 -top-px h-0.5 rounded-full bg-blue-500" aria-hidden="true"></span>{/if}
					{#if drop?.id === n.id && drop.where === 'after'}<span class="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-blue-500" aria-hidden="true"></span>{/if}
					<span class="size-3.5 shrink-0 text-stone-400 {folder ? (open ? 'icon-[lucide--chevron-down]' : 'icon-[lucide--chevron-right]') : ''}" aria-hidden="true"></span>
					<span class="size-4 shrink-0 text-stone-500 {folder ? (open ? 'icon-[lucide--folder-open]' : 'icon-[lucide--folder]') : 'icon-[lucide--notebook-text]'}" aria-hidden="true"></span>
					<span class="min-w-0 flex-1 truncate">{n.title}</span>
					{#if folder && !open && notebooks.children(n.id).length}<span class="text-xs text-muted tabular-nums">{notebooks.children(n.id).length}</span>{/if}
				</button>
			{/if}
			{#if open}
				<ul role="group">{@render branch(n.id, depth + 1)}</ul>
			{/if}
		</li>
	{/each}
{/snippet}

<section aria-labelledby="notebooks-heading">
	<div class="mt-5 mb-1 flex items-center justify-between gap-2 px-2 text-[11px] font-medium tracking-wide text-muted uppercase">
		<span id="notebooks-heading" class="flex-1">Notebooks</span>
		<Tip label="New folder">
			{#snippet child({ props })}<button {...props} class={headerBtn} aria-label="New folder" onclick={() => add('folder')}><span class="icon-[lucide--folder-plus] size-3.5"></span></button>{/snippet}
		</Tip>
		<Tip label="New notebook">
			{#snippet child({ props })}<button {...props} class={headerBtn} aria-label="New notebook" onclick={() => add('notebook')}><span class="icon-[lucide--plus] size-3.5"></span></button>{/snippet}
		</Tip>
	</div>
	{#if notebooks.nodes.length}
		<ul
			bind:this={tree}
			role="tree"
			aria-labelledby="notebooks-heading"
			class="pb-3"
			ondragover={(e) => {
				if (!dragging) return;
				e.preventDefault();
				drop = { id: null, where: 'end' };
			}}
			ondragleave={(e) => !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node) && (drop = null)}
			{ondrop}
		>
			{@render branch(undefined, 0)}
			{#if dragging && drop?.where === 'end'}<li class="mx-1 h-0.5 rounded-full bg-blue-500" aria-hidden="true"></li>{/if}
		</ul>
	{:else}
		<p class="px-2 py-1 text-xs text-muted">
			A notebook for each idea you're working on, with links to its papers.
			<button class="underline underline-offset-2 hover:text-stone-800 dark:hover:text-stone-200" onclick={() => add('notebook')}>New notebook</button>
		</p>
	{/if}
</section>

<MoveToDialog
	item={moving}
	onclose={() => (moving = null)}
	onmove={(parent) => {
		const n = moving;
		moving = null;
		if (n) void moveTo(n, parent, notebooks.children(parent).filter((s) => s.id !== n.id).length);
	}}
/>

