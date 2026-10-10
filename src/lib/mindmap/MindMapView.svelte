<!--
	A mind map block's canvas: topics (inline Markdown and maths) laid out around
	the central one, curved branches, pan (drag the background), zoom (⌘-scroll,
	pinch, buttons), fit, and a handle to resize its height. Keyboard: Tab child,
	Enter sibling, Delete remove, arrows move between topics, ⌥-arrows move a
	topic, typing or F2 edits, ⌘/ folds a branch, Esc leaves the map.
-->
<script lang="ts" module>
	/** Branch colours, by branch of the central topic. */
	const COLORS = ['#e8590c', '#2b8a3e', '#1971c2', '#ae3ec9', '#c2255c', '#0c8599', '#e67700', '#5c940d'];
</script>

<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { Annotations } from 'svelte-pdf-mini';
	import { mac } from '#lib/os.js';
	import type { PaperAnchor } from '#lib/types.js';
	import { branchPath, layout, type Placed } from './layout';
	import { addChild, addSibling, demote, find, move, promote, remove, setPage, setText, toggleCollapsed, type Edit, type MindMap } from './tree';

	let {
		map,
		height,
		editable,
		selected,
		onchange,
		onresize,
		undo,
		redo,
		onjump,
		anchor,
		exit
	}: {
		map: MindMap;
		height: number;
		editable: boolean;
		/** The block is selected in the notes (arrowed onto): the canvas takes the keys. */
		selected: boolean;
		onchange: (map: MindMap, opts?: { history?: boolean }) => void;
		onresize: (height: number) => void;
		undo: () => void;
		redo: () => void;
		onjump: (anchor: PaperAnchor) => void;
		anchor: () => PaperAnchor | null;
		exit: () => void;
	} = $props();

	let canvas = $state<HTMLElement>();
	/** Unique per map on the page (topic element ids). */
	const uid = $props.id();
	let width = $state(0);
	/** Measured topic sizes (their text decides them). */
	let sizes = $state.raw(new Map<string, { w: number; h: number }>());
	let current = $state(untrack(() => map.root.id));
	let editing = $state<string | null>(null);
	let draft = $state('');
	let zoom = $state(1);
	/** Where the map's centre (the central topic) is, in canvas pixels. */
	let pan = $state({ x: 0, y: 0 });
	let focused = $state(false);
	/** While the bottom edge is dragged: the height shown (saved on release). */
	let dragHeight = $state<number | null>(null);
	const shownHeight = $derived(dragHeight ?? height);

	/**
	 * New topics being typed (Tab, Enter) live here until their text is done: then they're
	 * one undo step with it, and one left empty leaves no trace in the notes' history.
	 */
	let pending = $state.raw<MindMap | null>(null);
	/** The map as drawn: the notes' one, plus the topics being typed. */
	const shown = $derived(pending ?? map);

	const placed = $derived(layout(shown.root, (id) => sizes.get(id) ?? { w: 96, h: 32 }));
	const byId = $derived(new Map(placed.topics.map((t) => [t.id, t])));
	/** Each topic's branch colour (the central topic's branches each get one). */
	const colors = $derived.by(() => {
		const out = new Map<string, string>();
		shown.root.children.forEach((b, i) => {
			const walk = (id: string, c: string) => {
				out.set(id, c);
				find(b, id)?.topic.children.forEach((k) => walk(k.id, c));
			};
			walk(b.id, COLORS[i % COLORS.length]);
		});
		return out;
	});

	// The selection stays on a topic that exists (after an undo, a removal elsewhere…).
	$effect(() => {
		if (!byId.has(current)) current = shown.root.id;
	});

	// The map's centre in the middle of the canvas, the first time it has a size.
	let centred = false;
	$effect(() => {
		if (centred || !width) return;
		centred = true;
		untrack(() => fit(false));
	});

	// Arrowed onto from the text: the keys come here.
	$effect(() => {
		if (selected && editable) untrack(() => canvas?.focus({ preventScroll: true }));
	});

	/** Each topic's size, as rendered (unscaled). */
	function measure(id: string) {
		return (node: HTMLElement) => {
			const ro = new ResizeObserver(() => {
				const w = node.offsetWidth;
				const h = node.offsetHeight;
				const was = sizes.get(id);
				if (!was || Math.abs(was.w - w) > 0.5 || Math.abs(was.h - h) > 0.5) sizes = new Map(sizes).set(id, { w, h });
			});
			ro.observe(node);
			return () => ro.disconnect();
		};
	}

	// ── View: pan, zoom, fit ──────────────────────────────────────────────

	/** Everything in view (never zoomed in past 1:1 unless asked). */
	function fit(animate = true) {
		const b = placed.bounds;
		const pad = 32;
		const z = Math.min(1, (width - pad * 2) / Math.max(b.w, 1), (shownHeight - pad * 2) / Math.max(b.h, 1));
		zoom = Math.max(0.25, z);
		pan = { x: width / 2 - (b.x + b.w / 2) * zoom, y: shownHeight / 2 - (b.y + b.h / 2) * zoom };
		void animate;
	}

	function zoomBy(factor: number, at = { x: width / 2, y: shownHeight / 2 }) {
		const z = Math.min(2.5, Math.max(0.25, zoom * factor));
		pan = { x: at.x - ((at.x - pan.x) * z) / zoom, y: at.y - ((at.y - pan.y) * z) / zoom };
		zoom = z;
	}

	/** ⌘-scroll or pinch zooms around the pointer; a plain scroll scrolls the notes. */
	function onwheel(e: WheelEvent) {
		if (!e.ctrlKey && !e.metaKey) return;
		e.preventDefault();
		const r = canvas!.getBoundingClientRect();
		zoomBy(Math.exp(-e.deltaY * 0.01), { x: e.clientX - r.left, y: e.clientY - r.top });
	}

	/** Dragging the background pans. */
	function onpointerdown(e: PointerEvent) {
		if (e.button !== 0 || (e.target as Element).closest('[data-topic], button, textarea')) return;
		const start = { x: e.clientX, y: e.clientY, pan: { ...pan } };
		const el = e.currentTarget as HTMLElement;
		el.setPointerCapture(e.pointerId);
		const moveTo = (ev: PointerEvent) => (pan = { x: start.pan.x + ev.clientX - start.x, y: start.pan.y + ev.clientY - start.y });
		el.addEventListener('pointermove', moveTo);
		el.addEventListener('lostpointercapture', () => el.removeEventListener('pointermove', moveTo), { once: true });
		canvas?.focus({ preventScroll: true });
	}

	/** Dragging the bottom edge resizes the block. */
	function resizeStart(e: PointerEvent) {
		if (e.button !== 0) return;
		e.preventDefault();
		const handle = e.currentTarget as HTMLElement;
		handle.setPointerCapture(e.pointerId);
		const startY = e.clientY;
		const start = height;
		const moveTo = (ev: PointerEvent) => (dragHeight = Math.max(160, start + ev.clientY - startY));
		handle.addEventListener('pointermove', moveTo);
		handle.addEventListener(
			'lostpointercapture',
			() => {
				handle.removeEventListener('pointermove', moveTo);
				if (dragHeight !== null && dragHeight !== height) onresize(dragHeight);
				dragHeight = null;
			},
			{ once: true }
		);
	}

	// ── Editing ───────────────────────────────────────────────────────────

	/** An edit, then its topic selected; a new topic (`edit`) is typed into before it joins the notes. */
	function apply(e: Edit, edit = false) {
		current = e.select;
		if (edit) {
			pending = e.map;
			startEdit(e.select, '');
		} else if (e.map !== map) onchange(e.map);
	}

	function startEdit(id: string, text?: string) {
		if (!editable) return;
		current = id;
		draft = text ?? find(shown.root, id)?.topic.text ?? '';
		editing = id;
	}

	async function endEdit(keep: boolean) {
		const id = editing;
		if (!id) return;
		editing = null;
		const base = shown;
		pending = null;
		const t = find(base.root, id)?.topic;
		const text = keep ? draft.trim() : (t?.text ?? '');
		let next = base;
		// A topic left empty (a new one not typed in) goes away again.
		if (!text && t && !t.children.length && id !== base.root.id) {
			const r = remove(base, id);
			next = r.map;
			current = r.select;
		} else if (text !== t?.text) next = setText(base, id, text);
		if (JSON.stringify(next) !== JSON.stringify(map)) onchange(next);
		await tick();
		canvas?.focus({ preventScroll: true });
	}

	/** In the topic being typed: **bold**, *italic*, `code` around the selection (⌘B, ⌘I, ⌘⇧C). */
	export function wrap(mark: '**' | '*' | '`') {
		const input = canvas?.querySelector<HTMLTextAreaElement>('textarea');
		if (!input) {
			// Not typing: the whole topic.
			const t = find(shown.root, current)?.topic;
			if (t && editable) onchange(setText(map, t.id, `${mark}${t.text}${mark}`));
			return;
		}
		const [a, b] = [input.selectionStart, input.selectionEnd];
		draft = draft.slice(0, a) + mark + draft.slice(a, b) + mark + draft.slice(b);
		void tick().then(() => input.setSelectionRange(a + mark.length, b + mark.length));
	}

	const mod = (e: KeyboardEvent) => (mac ? e.metaKey : e.ctrlKey);

	function onEditKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) (e.preventDefault(), void endEdit(true));
		else if (e.key === 'Escape') (e.preventDefault(), void endEdit(false));
		else if (e.key === 'Tab') {
			e.preventDefault();
			// The next topic straight away; all of them join the notes when typing ends.
			const id = editing!;
			const text = draft.trim();
			editing = null;
			const after = text !== find(shown.root, id)?.topic.text ? setText(shown, id, text) : shown;
			apply(e.shiftKey ? addSibling(after, id) : addChild(after, id), true);
		} else if (mod(e) && e.key.toLowerCase() === 'b') (e.preventDefault(), wrap('**'));
		else if (mod(e) && e.key.toLowerCase() === 'i') (e.preventDefault(), wrap('*'));
		else if (mod(e) && e.shiftKey && e.key.toLowerCase() === 'c') (e.preventDefault(), wrap('`'));
	}

	/** The topic beside `id` in a direction, as the map is drawn. */
	function neighbour(id: string, key: string): string | null {
		const p = byId.get(id);
		const at = find(shown.root, id);
		if (!p || !at) return null;
		const outward = (p.side === 'left' && key === 'ArrowLeft') || (p.side === 'right' && key === 'ArrowRight');
		const inward = (p.side === 'left' && key === 'ArrowRight') || (p.side === 'right' && key === 'ArrowLeft');
		if (p.side === 'root' && (key === 'ArrowLeft' || key === 'ArrowRight')) {
			const side = key === 'ArrowRight' ? 'right' : 'left';
			const kids = placed.topics.filter((t) => t.parent === id && t.side === side);
			return kids[Math.floor((kids.length - 1) / 2)]?.id ?? null;
		}
		if (outward) {
			const kids = placed.topics.filter((t) => t.parent === id);
			return kids[Math.floor((kids.length - 1) / 2)]?.id ?? null;
		}
		if (inward) return p.parent;
		// Up / down: the nearest topic above or below, on the same side, preferring the same depth.
		const dir = key === 'ArrowUp' ? -1 : 1;
		const cy = p.y + p.h / 2;
		const candidates = placed.topics.filter((t) => t.id !== id && t.side === p.side && Math.sign(t.y + t.h / 2 - cy) === dir);
		candidates.sort((a, b) => Math.abs(a.depth - p.depth) - Math.abs(b.depth - p.depth) || Math.abs(a.y + a.h / 2 - cy) - Math.abs(b.y + b.h / 2 - cy));
		return candidates[0]?.id ?? null;
	}

	/** A topic's text box takes the keys as soon as it's there, the cursor after what was typed. */
	function focusAtEnd(el: HTMLTextAreaElement) {
		el.focus({ preventScroll: true });
		el.setSelectionRange(el.value.length, el.value.length);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.isComposing) return;
		// Typed before the topic's text box showed up (it comes a frame later): into the text.
		if (editing) {
			if ((e.target as Element).tagName === 'TEXTAREA') return;
			if (e.key.length === 1 && !mod(e)) (e.preventDefault(), (draft += e.key));
			else onEditKey(e);
			return;
		}
		const k = e.key;
		const z = mod(e) && k.toLowerCase() === 'z';
		if (z) return e.preventDefault(), e.shiftKey ? redo() : undo();
		if (mod(e) && k.toLowerCase() === 'y') return e.preventDefault(), redo();
		if (k === 'Escape') return e.preventDefault(), exit();
		if (k.startsWith('Arrow') && e.altKey && editable) {
			e.preventDefault();
			const p = byId.get(current);
			if (k === 'ArrowUp' || k === 'ArrowDown') return apply(move(map, current, k === 'ArrowUp' ? -1 : 1));
			const out = (p?.side === 'left' && k === 'ArrowLeft') || (p?.side === 'right' && k === 'ArrowRight');
			return apply(out ? demote(map, current) : promote(map, current));
		}
		if (k.startsWith('Arrow') && !mod(e)) {
			e.preventDefault();
			const next = neighbour(current, k);
			if (next) current = next;
			else if (k === 'ArrowDown' || k === 'ArrowUp') exit();
			return;
		}
		if (mod(e) && k === '/') return e.preventDefault(), onchange(toggleCollapsed(map, current));
		if (!editable || mod(e) || e.altKey) return;
		if (k === 'Tab') return e.preventDefault(), apply(e.shiftKey ? addSibling(map, current) : addChild(map, current), true);
		if (k === 'Enter') return e.preventDefault(), apply(addSibling(map, current), true);
		if (k === 'Backspace' || k === 'Delete') return e.preventDefault(), apply(remove(map, current));
		if (k === 'F2' || k === ' ') return e.preventDefault(), startEdit(current);
		// Typing on a topic: replaces its text (as in spreadsheets).
		if (k.length === 1) return e.preventDefault(), startEdit(current, k);
	}

	/** The topic's page link: to the page you're reading, or off. */
	export function togglePage() {
		const t = find(map.root, current)?.topic;
		if (!t || !editable) return;
		onchange(setPage(map, t.id, t.page ? undefined : Math.floor(anchor()?.page ?? 1)));
	}

	/** For the notes' toolbar (5.4): what's selected, and the edits it offers. */
	export const api = {
		addChild: () => apply(addChild(map, current), true),
		addSibling: () => apply(addSibling(map, current), true),
		remove: () => apply(remove(map, current)),
		fit: () => fit(),
		zoomIn: () => zoomBy(1.25),
		zoomOut: () => zoomBy(0.8)
	};

	function topicClass(p: Placed) {
		if (p.side === 'root') return 'rounded-xl bg-stone-800 px-4 py-2 font-serif text-[15px] text-white dark:bg-stone-100 dark:text-stone-900';
		if (p.depth === 1) return 'rounded-lg border-2 bg-white px-3 py-1.5 text-[13px] dark:bg-stone-900';
		return 'rounded-md px-2 py-1 text-[12.5px]';
	}
</script>

<div
	bind:this={canvas}
	bind:clientWidth={width}
	data-mind-map-canvas
	role="tree"
	aria-label="Mind map ({placed.topics.length} topics). Tab: new topic, Enter: next to it, arrows: move around, type to edit."
	aria-activedescendant="mm-{uid}-{current}"
	tabindex="0"
	class="mind-map relative overflow-hidden rounded-lg border border-stone-200 bg-stone-50 outline-none select-none dark:border-stone-700 dark:bg-stone-950 {focused || selected ? 'ring-2 ring-sky-500/50' : ''}"
	style:height="{shownHeight}px"
	onfocusin={() => (focused = true)}
	onfocusout={(e) => !canvas?.contains(e.relatedTarget as Node) && (focused = false)}
	{onkeydown}
	{onwheel}
	{onpointerdown}
>
	<div class="absolute top-0 left-0 origin-top-left" style:transform="translate({pan.x}px, {pan.y}px) scale({zoom})">
		<svg class="pointer-events-none absolute top-0 left-0 overflow-visible" width="1" height="1" aria-hidden="true">
			{#each placed.branches as b (b.to)}
				<path d={branchPath(b)} fill="none" stroke={colors.get(b.to) ?? '#a8a29e'} stroke-width={byId.get(b.to)?.depth === 1 ? 2.5 : 1.5} stroke-linecap="round" />
			{/each}
		</svg>
		{#each placed.topics as p (p.id)}
			{@const t = find(shown.root, p.id)?.topic}
			{#if t}
				<div
					id="mm-{uid}-{p.id}"
					tabindex="-1"
					data-topic={p.id}
					{@attach measure(p.id)}
					class="absolute flex w-max max-w-60 cursor-default items-center gap-1.5 leading-snug {topicClass(p)} {current === p.id && (focused || selected) ? 'ring-2 ring-sky-500' : ''}"
					style:left="{p.x}px"
					style:top="{p.y}px"
					style:border-color={p.depth === 1 ? colors.get(p.id) : undefined}
					style:box-shadow={p.depth > 1 ? `inset 0 -2px 0 ${colors.get(p.id) ?? '#a8a29e'}` : undefined}
					role="treeitem"
					aria-selected={current === p.id}
					aria-level={p.depth + 1}
					onpointerdown={() => ((current = p.id), canvas?.focus({ preventScroll: true }))}
					ondblclick={() => startEdit(p.id)}
				>
					{#if editing === p.id}
						<textarea
							bind:value={draft}
							onkeydown={onEditKey}
							onblur={() => endEdit(true)}
							{@attach focusAtEnd}
							rows="1"
							aria-label="Topic"
							class="min-w-16 resize-none bg-transparent outline-none [field-sizing:content]"
						></textarea>
					{:else}
						<span class="topic-text min-w-4">{#if t.text}<Annotations.Markdown source={t.text} />{:else}<span class="opacity-40">…</span>{/if}</span>
					{/if}
					{#if t.page}
						<button class="shrink-0 rounded-full bg-sky-500/15 px-1.5 text-[10px] text-sky-800 hover:bg-sky-500/25 dark:text-sky-300" onclick={() => onjump({ page: t.page! })} title="Go to page {t.page}">p. {t.page}</button>
					{/if}
					{#if p.hidden}
						<button class="absolute top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full border bg-white text-[10px] tabular-nums dark:bg-stone-900 {p.side === 'left' ? '-left-6' : '-right-6'}" style:border-color={colors.get(p.id)} title="Show {p.hidden} more" onclick={() => onchange(toggleCollapsed(map, p.id))}>{p.hidden}</button>
					{/if}
				</div>
			{/if}
		{/each}
	</div>

	<!-- View controls. -->
	<div class="absolute right-2 bottom-3 flex items-center gap-0.5 rounded-md border border-stone-200 bg-white/90 p-0.5 text-stone-600 shadow-sm dark:border-stone-700 dark:bg-stone-900/90 dark:text-stone-300">
		<button class="grid size-6 place-items-center rounded hover:bg-stone-100 dark:hover:bg-stone-800" aria-label="Zoom out" onclick={() => zoomBy(0.8)}><span class="icon-[lucide--minus] size-3.5"></span></button>
		<button class="grid size-6 place-items-center rounded hover:bg-stone-100 dark:hover:bg-stone-800" aria-label="Zoom in" onclick={() => zoomBy(1.25)}><span class="icon-[lucide--plus] size-3.5"></span></button>
		<button class="grid size-6 place-items-center rounded hover:bg-stone-100 dark:hover:bg-stone-800" aria-label="Fit the map" onclick={() => fit()}><span class="icon-[lucide--maximize] size-3.5"></span></button>
	</div>
	{#if editable}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize hover:bg-sky-500/30" title="Drag to resize" onpointerdown={resizeStart}></div>
	{/if}
</div>

<style>
	/* Topics: inline Markdown, one block. */
	.topic-text :global([data-pdf-markdown]) {
		display: inline;
	}
	.topic-text :global([data-pdf-markdown] p) {
		display: inline;
		margin: 0;
	}
	.topic-text :global(code) {
		font-family: var(--font-mono);
		font-size: 0.9em;
		background: rgb(0 0 0 / 0.06);
		border-radius: 3px;
		padding: 0 0.25em;
	}
	.mind-map {
		background-image: radial-gradient(rgb(0 0 0 / 0.07) 1px, transparent 1px);
		background-size: 18px 18px;
	}
	:global(.dark) .mind-map {
		background-image: radial-gradient(rgb(255 255 255 / 0.06) 1px, transparent 1px);
	}
</style>
