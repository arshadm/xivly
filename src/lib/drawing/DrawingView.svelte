<!--
	A drawing block's canvas: shapes drawn as SVG (hand-drawn or clean), a tool
	palette, selection with handles, text in place, pan (space-drag, the hand,
	the middle button), zoom (⌘-scroll, pinch, buttons), fit, and a grip to
	resize its height. Keys: V select, H hand, R rectangle, O ellipse, D diamond,
	L line, A arrow, P pen, T text, E eraser; Delete removes, arrows nudge, ⌘D
	duplicates, ⌘A selects all, ↵ edits the text, Esc leaves.
-->
<script lang="ts" module>
	import { DEFAULT_STYLE, type Shape, type Style } from './scene';

	export type Tool = 'select' | 'hand' | 'rect' | 'ellipse' | 'diamond' | 'line' | 'arrow' | 'pen' | 'text' | 'eraser';

	export const TOOLS: { tool: Tool; label: string; key: string; icon: string }[] = [
		{ tool: 'select', label: 'Select', key: 'V', icon: 'icon-[lucide--mouse-pointer-2]' },
		{ tool: 'hand', label: 'Pan', key: 'H', icon: 'icon-[lucide--hand]' },
		{ tool: 'rect', label: 'Rectangle', key: 'R', icon: 'icon-[lucide--square]' },
		{ tool: 'ellipse', label: 'Ellipse', key: 'O', icon: 'icon-[lucide--circle]' },
		{ tool: 'diamond', label: 'Diamond', key: 'D', icon: 'icon-[lucide--diamond]' },
		{ tool: 'arrow', label: 'Arrow', key: 'A', icon: 'icon-[lucide--move-up-right]' },
		{ tool: 'line', label: 'Line', key: 'L', icon: 'icon-[lucide--minus]' },
		{ tool: 'pen', label: 'Pen', key: 'P', icon: 'icon-[lucide--pencil]' },
		{ tool: 'text', label: 'Text', key: 'T', icon: 'icon-[lucide--type]' },
		{ tool: 'eraser', label: 'Eraser', key: 'E', icon: 'icon-[lucide--eraser]' }
	];

	/** What new shapes get, the last style picked (shared by the drawings of this window). */
	const defaults = $state<{ style: Style }>({ style: { ...DEFAULT_STYLE } });

	/** Shapes copied (⌘C) in this window: pasted into any drawing. */
	let copied: Shape[] = [];
	const CLIP_TYPE = 'xivly-drawing';
</script>

<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { mac } from '#lib/os.js';
	import { theme } from '#lib/theme.svelte.js';
	import type { PaperAnchor } from '#lib/types.js';
	import { imageFiles, MAX_IMAGE_BYTES, type NoteAssets } from '#lib/notes/images.js';
	import { saveFile } from '#lib/windows.js';
	import { toast } from '#lib/components/Toasts.svelte';
	import BlockGrip from '#lib/blocks/BlockGrip.svelte';
	import { svgToPng } from '#lib/mindmap/image.js';
	import {
		add,
		bounds as boundsOf,
		boxAt,
		boxOf,
		copyShapes,
		duplicate,
		isPath,
		linePoints,
		makeShape,
		moveBy,
		pointsBox,
		remove,
		reorder,
		resize,
		restyle,
		sceneBounds,
		shapeAt,
		update,
		within,
		type Box,
		type Point,
		type Scene,
		type ShapeKind
	} from './scene';
	import { canvasMeasure, FONTS, lineHeight, shapeMarks, textSize, type Mark } from './render';
	import { drawingSvg, markSvg, svgSize } from './svg';
	import { activeDrawing, type DrawingTools } from './active.svelte';

	let {
		scene,
		height,
		editable,
		selected,
		assets,
		onchange,
		onresize,
		undo,
		redo,
		onjump,
		exit,
		removeBlock
	}: {
		scene: Scene;
		height: number;
		editable: boolean;
		/** The block is selected in the notes (arrowed onto): the canvas takes the keys. */
		selected: boolean;
		assets: NoteAssets | null;
		onchange: (scene: Scene, opts?: { history?: boolean }) => void;
		onresize: (height: number) => void;
		undo: () => void;
		redo: () => void;
		onjump: (anchor: PaperAnchor) => void;
		exit: () => void;
		/** Delete the whole drawing. */
		removeBlock: () => void;
	} = $props();

	let canvas = $state<HTMLElement>();
	let width = $state(0);
	let focused = $state(false);
	let dragHeight = $state<number | null>(null);
	const shownHeight = $derived(dragHeight ?? height);

	let tool = $state<Tool>('select');
	/** Space held: the pointer pans whatever the tool. */
	let spaceDown = $state(false);
	let selection = $state.raw<string[]>([]);
	/** While a gesture runs (a drag, a stroke, new text): the drawing as it will be. */
	let pending = $state.raw<Scene | null>(null);
	const shown = $derived(pending ?? scene);
	/** Marquee (scene coordinates) while one is drawn. */
	let marquee = $state.raw<Box | null>(null);
	/** Shapes the eraser went over (faded until it lets go). */
	let erasing = $state.raw<Set<string>>(new Set());
	/** The box a line's end would stick to, while one is drawn or dragged. */
	let target = $state<string | null>(null);
	/** Text being typed: a text shape, or a shape's label. `fresh`: made for it (gone if left empty). */
	let editing = $state<{ id: string; fresh: boolean } | null>(null);
	let draft = $state('');

	let zoom = $state(1);
	let pan = $state({ x: 40, y: 40 });

	const measure = canvasMeasure();
	const byId = $derived(new Map(shown.shapes.map((s) => [s.id, s])));
	const picked = $derived(selection.map((id) => byId.get(id)).filter((s) => !!s));

	// The selection keeps only shapes that exist (after an undo, a change from another device…).
	$effect(() => {
		if (selection.some((id) => !byId.has(id))) selection = selection.filter((id) => byId.has(id));
	});

	// ── Marks: each shape drawn once until it changes ────────────────────

	const cache = new Map<string, WeakMap<Shape, string>>();
	function marksOf(s: Shape): string {
		const key = `${theme.dark}/${shown.sketch}`;
		let c = cache.get(key);
		if (!c) cache.set(key, (c = new WeakMap()));
		// A line that sticks to boxes follows them: drawn each time.
		const sticky = s.kind === 'line' && (s.start || s.end);
		let svg = sticky ? undefined : c.get(s);
		if (svg === undefined) {
			svg = shapeMarks(shown, s, { dark: theme.dark, measure })
				.filter((m): m is Exclude<Mark, { kind: 'image' }> => m.kind !== 'image')
				.map((m) => markSvg(m, (x) => x))
				.join('');
			if (!sticky) c.set(s, svg);
		}
		return svg;
	}

	// Images: their files as blob URLs.
	let urls = $state<Record<string, string | null>>({});
	$effect(() => {
		for (const s of shown.shapes) {
			if (s.kind !== 'image' || !s.src || s.src in untrack(() => urls) || !assets) continue;
			const src = s.src;
			urls[src] = null;
			void assets.url(src).then((u) => (urls[src] = u));
		}
	});

	// ── View ─────────────────────────────────────────────────────────────

	const toScene = (e: { clientX: number; clientY: number }): Point => {
		const r = canvas!.getBoundingClientRect();
		return [(e.clientX - r.left - pan.x) / zoom, (e.clientY - r.top - pan.y) / zoom];
	};

	/** Everything in view (never zoomed in past 1:1). */
	function fit() {
		const b = sceneBounds(shown);
		if (!b) return void ((zoom = 1), (pan = { x: 40, y: 40 }));
		const pad = 40;
		zoom = Math.max(0.1, Math.min(1, (width - pad * 2) / Math.max(b.w, 1), (shownHeight - pad * 2) / Math.max(b.h, 1)));
		pan = { x: width / 2 - (b.x + b.w / 2) * zoom, y: shownHeight / 2 - (b.y + b.h / 2) * zoom };
	}

	function zoomBy(factor: number, at = { x: width / 2, y: shownHeight / 2 }) {
		const z = Math.min(4, Math.max(0.1, zoom * factor));
		pan = { x: at.x - ((at.x - pan.x) * z) / zoom, y: at.y - ((at.y - pan.y) * z) / zoom };
		zoom = z;
	}

	/** The height that shows the whole drawing at 1:1 (the grip's double-click), then fitted. */
	async function fitHeight() {
		const b = sceneBounds(shown);
		onresize(Math.ceil((b?.h ?? 200) + 80));
		await tick();
		fit();
	}

	let shownOnce = false;
	$effect(() => {
		if (shownOnce || !width) return;
		shownOnce = true;
		untrack(() => sceneBounds(scene) && fit());
	});

	/** ⌘-scroll or pinch zooms around the pointer; a plain scroll scrolls the notes. */
	function onwheel(e: WheelEvent) {
		if (!e.ctrlKey && !e.metaKey) return;
		e.preventDefault();
		const r = canvas!.getBoundingClientRect();
		zoomBy(Math.exp(-e.deltaY * 0.01), { x: e.clientX - r.left, y: e.clientY - r.top });
	}

	// Arrowed onto from the text: the keys come here.
	$effect(() => {
		if (selected && editable) untrack(() => canvas?.focus({ preventScroll: true }));
	});

	// ── Gestures ─────────────────────────────────────────────────────────

	/** Follow the pointer until it lets go (captured by the canvas). */
	function track(e: PointerEvent, move: (ev: PointerEvent) => void, end: (ev: PointerEvent | null) => void) {
		const el = canvas!;
		el.setPointerCapture(e.pointerId);
		let last: PointerEvent | null = null;
		const onmove = (ev: PointerEvent) => ((last = ev), move(ev));
		const onup = (ev: PointerEvent) => ((last = ev), el.releasePointerCapture(ev.pointerId));
		el.addEventListener('pointermove', onmove);
		el.addEventListener('pointerup', onup);
		el.addEventListener(
			'lostpointercapture',
			() => {
				el.removeEventListener('pointermove', onmove);
				el.removeEventListener('pointerup', onup);
				end(last);
			},
			{ once: true }
		);
	}

	/** A gesture's result joins the notes (one undo step), or nothing if it changed nothing. */
	function commit(next: Scene | null = pending) {
		pending = null;
		if (next && next !== scene) onchange(next);
	}

	function panFrom(e: PointerEvent) {
		const start = { x: e.clientX, y: e.clientY, pan: { ...pan } };
		track(
			e,
			(ev) => (pan = { x: start.pan.x + ev.clientX - start.x, y: start.pan.y + ev.clientY - start.y }),
			() => {}
		);
	}

	const snap = (from: Point, to: Point, on: boolean): Point => {
		if (!on) return to;
		const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
		const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
		const d = Math.hypot(dx, dy);
		return [from[0] + d * Math.cos(a), from[1] + d * Math.sin(a)];
	};

	function onpointerdown(e: PointerEvent) {
		if ((e.target as Element).closest('button, textarea, [data-block-grip]')) return;
		canvas?.focus({ preventScroll: true });
		if (e.button === 1 || (e.button === 0 && (spaceDown || tool === 'hand' || !editable))) return (e.preventDefault(), panFrom(e));
		if (e.button !== 0) return;
		if (editing) return void endEdit();
		e.preventDefault();
		const at = toScene(e);
		if (tool === 'select') return selectFrom(e, at);
		if (tool === 'eraser') return eraseFrom(e, at);
		if (tool === 'pen') return penFrom(e, at);
		if (tool === 'text') return void newText(at);
		if (tool === 'line' || tool === 'arrow') return lineFrom(e, at);
		if (tool !== 'hand') boxFrom(e, at, tool);
	}

	function selectFrom(e: PointerEvent, at: Point) {
		const tol = 6 / zoom;
		const hit = shapeAt(shown, at, tol);
		if (!hit) {
			if (!e.shiftKey) selection = [];
			const base = e.shiftKey ? selection : [];
			track(
				e,
				(ev) => {
					marquee = boxOf(at, toScene(ev));
					selection = [...new Set([...base, ...within(shown, marquee)])];
				},
				() => (marquee = null)
			);
			return;
		}
		if (e.shiftKey) {
			selection = selection.includes(hit.id) ? selection.filter((id) => id !== hit.id) : [...selection, hit.id];
			return;
		}
		if (!selection.includes(hit.id)) selection = [hit.id];
		if (!editable) return;
		// Drag: the selection moves (⌥: copies of it).
		const ids = selection;
		const base = shown;
		let moving = ids;
		let from = base;
		if (e.altKey) {
			const d = duplicate(base, ids, 0);
			from = d.scene;
			moving = d.ids;
			selection = moving;
		}
		let moved = false;
		track(
			e,
			(ev) => {
				const [x, y] = toScene(ev);
				if (!moved && Math.hypot((x - at[0]) * zoom, (y - at[1]) * zoom) < 3) return;
				moved = true;
				pending = moveBy(from, moving, x - at[0], y - at[1]);
			},
			() => (moved ? commit() : (pending = null))
		);
	}

	/** A handle of the selection dragged: its shapes resized (⇧: same proportions; images always). */
	function resizeFrom(e: PointerEvent, handle: string) {
		if (!editable || e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		canvas?.focus({ preventScroll: true });
		const box = selectionBox;
		if (!box) return;
		const ids = selection;
		const base = scene;
		const ratio = picked.length === 1 && picked[0].kind === 'image';
		track(
			e,
			(ev) => {
				const [x, y] = toScene(ev);
				let { x: x0, y: y0 } = box;
				let [x1, y1] = [box.x + box.w, box.y + box.h];
				if (handle.includes('w')) x0 = x;
				if (handle.includes('e')) x1 = x;
				if (handle.includes('n')) y0 = y;
				if (handle.includes('s')) y1 = y;
				let to = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.max(1, Math.abs(x1 - x0)), h: Math.max(1, Math.abs(y1 - y0)) };
				if ((ev.shiftKey || ratio) && box.w && box.h) {
					const k = handle.length === 1 ? (handle === 'n' || handle === 's' ? to.h / box.h : to.w / box.w) : Math.max(to.w / box.w, to.h / box.h);
					const w = box.w * k;
					const h = box.h * k;
					to = { x: handle.includes('w') ? box.x + box.w - w : handle.length === 1 && (handle === 'n' || handle === 's') ? box.x + (box.w - w) / 2 : box.x, y: handle.includes('n') ? box.y + box.h - h : handle.length === 1 && (handle === 'e' || handle === 'w') ? box.y + (box.h - h) / 2 : box.y, w, h };
				}
				pending = resize(base, ids, box, to);
			},
			() => commit()
		);
	}

	/** A line's end dragged: it moves there (sticking to a box under it, ⇧: at 15° steps). */
	function endFrom(e: PointerEvent, line: Shape, which: 0 | 1) {
		if (!editable || e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		canvas?.focus({ preventScroll: true });
		const base = scene;
		const pts = lineDrawn(line).map((p) => [...p] as Point);
		const other = pts[which ? 0 : pts.length - 1];
		track(
			e,
			(ev) => {
				const p = snap(other, toScene(ev), ev.shiftKey);
				const box = boxAt(base, p, [line.id, (which ? line.start : line.end) ?? '']);
				target = box?.id ?? null;
				const next = [...pts];
				next[which ? next.length - 1 : 0] = p;
				pending = update(base, [line.id], which ? { points: next, end: box?.id } : { points: next, start: box?.id });
			},
			() => ((target = null), commit())
		);
	}

	const lineDrawn = (s: Shape) => linePoints(shown, s);

	function boxFrom(e: PointerEvent, at: Point, kind: 'rect' | 'ellipse' | 'diamond') {
		const base = scene;
		const shape = makeShape(kind, { x: at[0], y: at[1], w: 0, h: 0, style: defaults.style });
		let dragged = false;
		track(
			e,
			(ev) => {
				let [x, y] = toScene(ev);
				if (ev.shiftKey) {
					const d = Math.max(Math.abs(x - at[0]), Math.abs(y - at[1]));
					[x, y] = [at[0] + Math.sign(x - at[0] || 1) * d, at[1] + Math.sign(y - at[1] || 1) * d];
				}
				dragged ||= Math.hypot((x - at[0]) * zoom, (y - at[1]) * zoom) > 4;
				pending = add(base, { ...shape, ...boxOf(at, [x, y]) });
			},
			() => {
				// A click: a shape of the usual size there.
				const made = dragged ? { ...shape, ...boundsOfPending(shape.id) } : { ...shape, x: at[0] - 60, y: at[1] - 36, w: 120, h: 72 };
				pending = null;
				onchange(add(base, made));
				selection = [made.id];
				tool = 'select';
			}
		);
	}

	const boundsOfPending = (id: string) => {
		const s = pending?.shapes.find((x) => x.id === id);
		return s ? { x: s.x, y: s.y, w: Math.max(4, s.w), h: Math.max(4, s.h) } : {};
	};

	function lineFrom(e: PointerEvent, at: Point) {
		const base = scene;
		const start = boxAt(base, at);
		const shape = makeShape('line', { points: [at, at], start: start?.id, heads: tool === 'arrow' ? [false, true] : [false, false], style: defaults.style });
		let to = at;
		track(
			e,
			(ev) => {
				to = snap(at, toScene(ev), ev.shiftKey);
				const end = boxAt(base, to, [start?.id ?? '']);
				target = end?.id ?? null;
				pending = add(base, { ...shape, points: [at, to], ...pointsBox([at, to]), end: end?.id });
			},
			() => {
				target = null;
				const made = pending?.shapes.at(-1);
				pending = null;
				// A click, or a line too short to see: nothing.
				if (!made || Math.hypot((to[0] - at[0]) * zoom, (to[1] - at[1]) * zoom) < 6) return;
				if (!made.end) delete made.end;
				if (!made.start) delete made.start;
				onchange(add(base, made));
				selection = [made.id];
				tool = 'select';
			}
		);
	}

	function penFrom(e: PointerEvent, at: Point) {
		const base = scene;
		const shape = makeShape('pen', { points: [at, at], style: defaults.style });
		const pts: Point[] = [at];
		track(
			e,
			(ev) => {
				for (const c of ev.getCoalescedEvents?.() ?? [ev]) {
					const p = toScene(c);
					const last = pts[pts.length - 1];
					if (Math.hypot((p[0] - last[0]) * zoom, (p[1] - last[1]) * zoom) >= 2) pts.push(p);
				}
				pending = add(base, { ...shape, points: pts.length > 1 ? [...pts] : [at, at], ...pointsBox(pts) });
			},
			() => {
				pending = null;
				// A dot is a tiny stroke.
				const points = pts.length > 1 ? pts : [at, [at[0] + 0.5, at[1] + 0.5] as Point];
				onchange(add(base, { ...shape, points, ...pointsBox(points) }));
			}
		);
	}

	function eraseFrom(e: PointerEvent, at: Point) {
		const tol = 8 / zoom;
		const hit = (p: Point) => {
			const s = shapeAt(scene, p, tol);
			if (s && !erasing.has(s.id)) erasing = new Set([...erasing, s.id]);
		};
		hit(at);
		track(
			e,
			(ev) => hit(toScene(ev)),
			() => {
				const ids = [...erasing];
				erasing = new Set();
				if (ids.length) onchange(remove(scene, ids));
			}
		);
	}

	// ── Text ─────────────────────────────────────────────────────────────

	function newText(at: Point) {
		if (!editable) return;
		const s = makeShape('text', { x: at[0], y: at[1] - lineHeight(defaults.style.size) / 2, w: 0, h: lineHeight(defaults.style.size), text: '', style: defaults.style });
		pending = add(scene, s);
		selection = [s.id];
		startEdit(s.id, true);
		tool = 'select';
	}

	function startEdit(id: string, fresh = false) {
		if (!editable) return;
		const s = (pending ?? scene).shapes.find((x) => x.id === id);
		if (!s || s.kind === 'pen') return;
		draft = s.text ?? '';
		editing = { id, fresh };
		selection = [id];
	}

	async function endEdit(keep = true) {
		const e = editing;
		if (!e) return;
		editing = null;
		const base = pending ?? scene;
		pending = null;
		const s = base.shapes.find((x) => x.id === e.id);
		if (!s) return;
		const text = keep ? draft.replace(/\s+$/, '') : (s.text ?? '');
		let next: Scene;
		if (s.kind === 'text') {
			// Text left empty goes away (a new one leaves no trace).
			if (!text.trim()) next = e.fresh ? scene : remove(base, [s.id]);
			else next = update(base, [s.id], { text, ...textSize(text, s.style, measure) });
		} else next = text === (s.text ?? '') ? base : update(base, [s.id], text ? { text } : (x) => ({ ...x, text: undefined }));
		commit(next === scene ? null : next);
		await tick();
		canvas?.focus({ preventScroll: true });
	}

	function onEditKey(e: KeyboardEvent) {
		e.stopPropagation();
		if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) (e.preventDefault(), void endEdit(true));
	}

	/** The text box over what's being typed: where the text is, as big as it's drawn. */
	const editBox = $derived.by(() => {
		if (!editing) return null;
		const s = byId.get(editing.id);
		if (!s) return null;
		const family = FONTS[s.style.font].family;
		const size = s.style.size * zoom;
		const ink = theme.dark ? '#e7e5e4' : '#1c1917';
		if (s.kind === 'text') return { left: pan.x + s.x * zoom, top: pan.y + s.y * zoom, width: undefined, size, family, ink, align: 'left' as const };
		const b = boundsOf(shown, s);
		const w = Math.max(80, b.w * zoom);
		const lines = Math.max(1, draft.split('\n').length);
		return { left: pan.x + (b.x + b.w / 2) * zoom - w / 2, top: pan.y + (b.y + b.h / 2) * zoom - (lines * lineHeight(size)) / 2, width: w, size, family, ink, align: 'center' as const };
	});

	function ondblclick(e: MouseEvent) {
		if (!editable || (e.target as Element).closest('button, textarea')) return;
		const at = toScene(e);
		const hit = shapeAt(shown, at, 6 / zoom);
		if (hit && hit.kind !== 'pen' && hit.kind !== 'image') return startEdit(hit.id);
		if (!hit) newText(at);
	}

	// ── Selection ────────────────────────────────────────────────────────

	const selectionBox = $derived.by(() => {
		const boxes = picked.map((s) => boundsOf(shown, s));
		if (!boxes.length) return null;
		const x = Math.min(...boxes.map((b) => b.x));
		const y = Math.min(...boxes.map((b) => b.y));
		return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
	});
	/** One line selected: its ends are its handles. */
	const pickedLine = $derived(picked.length === 1 && picked[0].kind === 'line' ? picked[0] : null);
	const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
	const handleAt = (b: Box, h: string): Point => [b.x + (h.includes('w') ? 0 : h.includes('e') ? b.w : b.w / 2), b.y + (h.includes('n') ? 0 : h.includes('s') ? b.h : b.h / 2)];
	const CURSORS: Record<string, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

	// ── Keys and the clipboard ───────────────────────────────────────────

	const mod = (e: KeyboardEvent) => (mac ? e.metaKey : e.ctrlKey);

	function onkeydown(e: KeyboardEvent) {
		if (e.isComposing || editing) return;
		const k = e.key;
		if (k === ' ' && !mod(e)) return (e.preventDefault(), void (spaceDown = true));
		if (mod(e) && k.toLowerCase() === 'z') return (e.preventDefault(), e.shiftKey ? redo() : undo());
		if (mod(e) && k.toLowerCase() === 'y') return (e.preventDefault(), redo());
		// Kept here too: a copy event doesn't always reach the canvas.
		if (mod(e) && (k.toLowerCase() === 'c' || k.toLowerCase() === 'x') && picked.length) copied = structuredClone($state.snapshot(picked) as Shape[]);
		if (mod(e) && k.toLowerCase() === 'a') return (e.preventDefault(), void (selection = shown.shapes.map((s) => s.id)));
		if (k === 'Escape') {
			e.preventDefault();
			if (selection.length) selection = [];
			else if (tool !== 'select') tool = 'select';
			else exit();
			return;
		}
		if (e.shiftKey && k === '!') return (e.preventDefault(), fit());
		if (!editable) return;
		if (mod(e) && k.toLowerCase() === 'd') return (e.preventDefault(), tools.duplicate());
		if (mod(e) && e.shiftKey && (k === ']' || k === '}')) return (e.preventDefault(), tools.reorder('front'));
		if (mod(e) && e.shiftKey && (k === '[' || k === '{')) return (e.preventDefault(), tools.reorder('back'));
		if (mod(e) && k === 'Backspace') return (e.preventDefault(), removeBlock());
		if ((k === 'Backspace' || k === 'Delete') && selection.length) return (e.preventDefault(), tools.remove());
		// An empty drawing: Backspace takes it away, as it would an empty line.
		if ((k === 'Backspace' || k === 'Delete') && !shown.shapes.length) return (e.preventDefault(), removeBlock());
		if (k.startsWith('Arrow') && selection.length && !mod(e)) {
			e.preventDefault();
			const d = e.shiftKey ? 10 : 1;
			const [dx, dy] = k === 'ArrowLeft' ? [-d, 0] : k === 'ArrowRight' ? [d, 0] : k === 'ArrowUp' ? [0, -d] : [0, d];
			return onchange(moveBy(scene, selection, dx, dy));
		}
		if ((k === 'Enter' || k === 'F2') && picked.length === 1) return (e.preventDefault(), startEdit(picked[0].id));
		if (mod(e) || e.altKey) return;
		const t = TOOLS.find((x) => x.key === k.toUpperCase());
		if (t) return (e.preventDefault(), void (tool = t.tool));
	}

	function onkeyup(e: KeyboardEvent) {
		if (e.key === ' ') spaceDown = false;
	}

	function oncopy(e: ClipboardEvent) {
		if (editing || !picked.length) return;
		e.preventDefault();
		copied = structuredClone($state.snapshot(picked) as Shape[]);
		e.clipboardData?.setData('text/plain', JSON.stringify({ [CLIP_TYPE]: 1, shapes: copied }));
	}

	function oncut(e: ClipboardEvent) {
		if (editing || !picked.length || !editable) return;
		oncopy(e);
		onchange(remove(scene, selection));
	}

	/** The middle of what's in view, in the drawing. */
	const viewCentre = (): Point => [(width / 2 - pan.x) / zoom, (shownHeight / 2 - pan.y) / zoom];

	async function onpaste(e: ClipboardEvent) {
		if (editing || !editable) return;
		e.preventDefault();
		const files = imageFiles(e.clipboardData?.files);
		if (files.length) {
			for (const f of files) await addImage(f);
			return;
		}
		const text = e.clipboardData?.getData('text/plain') ?? '';
		let shapes = copied;
		try {
			const data = JSON.parse(text);
			if (data?.[CLIP_TYPE] && Array.isArray(data.shapes)) shapes = data.shapes;
		} catch {
			// Plain text: a text shape of it.
			if (text.trim()) {
				const style = defaults.style;
				const [x, y] = viewCentre();
				const s = makeShape('text', { x, y, text: text.trim(), style, ...textSize(text.trim(), style, measure) });
				onchange(add(scene, s));
				selection = [s.id];
				return;
			}
		}
		if (!shapes.length) return;
		const copies = copyShapes(shapes, 0);
		// Pasted where the view is (the copies' middle at its middle).
		const b = copies.map((s) => (isPath(s) ? pointsBox(s.points!) : s));
		const [cx, cy] = viewCentre();
		const minX = Math.min(...b.map((x) => x.x));
		const minY = Math.min(...b.map((x) => x.y));
		const w = Math.max(...b.map((x) => x.x + x.w)) - minX;
		const h = Math.max(...b.map((x) => x.y + x.h)) - minY;
		const placed = moveBy(add(scene, ...copies), copies.map((s) => s.id), cx - (minX + w / 2), cy - (minY + h / 2));
		onchange(placed);
		selection = copies.map((s) => s.id);
	}

	/** An image file into the drawing (kept next to the notes), in the middle of the view. */
	async function addImage(file: File, page?: number) {
		if (!assets || !editable) return;
		if (file.size > MAX_IMAGE_BYTES) return toast(`${file.name} is too large (over ${MAX_IMAGE_BYTES / 1024 / 1024} MB)`, 'error');
		try {
			const src = await assets.save(file);
			const bitmap = await createImageBitmap(file).catch(() => null);
			const [iw, ih] = bitmap ? [bitmap.width, bitmap.height] : [320, 240];
			bitmap?.close();
			// At most a good part of the view (a big picture comes in scaled down).
			const k = Math.min(1, (width * 0.6) / zoom / iw, (shownHeight * 0.6) / zoom / ih);
			const [cx, cy] = viewCentre();
			const s = makeShape('image', { src, x: cx - (iw * k) / 2, y: cy - (ih * k) / 2, w: iw * k, h: ih * k, style: { ...defaults.style, fill: 'none' }, ...(page ? { page } : {}) });
			onchange(add(scene, s));
			selection = [s.id];
		} catch (err) {
			toast(`Couldn’t add ${file.name}: ${err instanceof Error ? err.message : err}`, 'error');
		}
	}

	function ondragover(e: DragEvent) {
		if (editable && assets && [...(e.dataTransfer?.items ?? [])].some((i) => i.kind === 'file')) (e.preventDefault(), (e.dataTransfer!.dropEffect = 'copy'));
	}

	async function ondrop(e: DragEvent) {
		const files = imageFiles(e.dataTransfer?.files);
		if (!files.length || !editable) return;
		e.preventDefault();
		e.stopPropagation();
		const at = toScene(e);
		for (const f of files) {
			await addImage(f);
			// Where it was dropped.
			const s = selection[0] && scene.shapes.find((x) => x.id === selection[0]);
			if (s) onchange(update(scene, [s.id], { x: at[0] - s.w / 2, y: at[1] - s.h / 2 }), { history: false });
		}
	}

	// ── The notes' bar ───────────────────────────────────────────────────

	const tools: DrawingTools = {
		style: () => picked[0]?.style ?? defaults.style,
		setStyle(patch) {
			defaults.style = { ...defaults.style, ...patch };
			if (!picked.length || !editable) return;
			let next = restyle(scene, selection, patch);
			// Text shapes keep their box the size of their text.
			if (patch.size || patch.font) next = update(next, selection.filter((id) => byId.get(id)?.kind === 'text'), (s) => textSize(s.text ?? '', s.style, measure));
			onchange(next);
		},
		kinds: () => new Set<ShapeKind>(picked.map((s) => s.kind)),
		heads: () => (pickedLine?.heads as [boolean, boolean] | undefined) ?? null,
		setHeads: (heads) => pickedLine && onchange(update(scene, [pickedLine.id], { heads })),
		sketch: () => shown.sketch,
		setSketch: (on) => on !== scene.sketch && onchange({ ...scene, sketch: on }),
		reorder: (to) => selection.length && onchange(reorder(scene, selection, to)),
		duplicate() {
			if (!selection.length) return;
			const d = duplicate(scene, selection);
			onchange(d.scene);
			selection = d.ids;
		},
		remove: () => selection.length && onchange(remove(scene, selection)),
		fit,
		zoomIn: () => zoomBy(1.25),
		zoomOut: () => zoomBy(0.8),
		undo: () => undo(),
		redo: () => redo(),
		exit: () => exit(),
		removeBlock: () => removeBlock(),
		within: (el) => !!canvas && el.contains(canvas),
		addImage,
		async save(kind) {
			const urlsAsData = new Map<string, string>();
			for (const s of scene.shapes) {
				if (s.kind !== 'image' || !s.src || urlsAsData.has(s.src)) continue;
				const url = urls[s.src] ?? (await assets?.url(s.src));
				if (url) urlsAsData.set(s.src, await asDataUrl(url));
			}
			const svg = drawingSvg(scene, { dark: theme.dark, measure, href: (src) => urlsAsData.get(src) ?? src });
			try {
				if (kind === 'svg') await saveFile(new Blob([svg], { type: 'image/svg+xml' }), 'drawing.svg');
				else {
					const { w, h } = svgSize(scene);
					await saveFile(await svgToPng(svg, w, h), 'drawing.png');
				}
			} catch (err) {
				toast(`Couldn’t save the drawing: ${err instanceof Error ? err.message : err}`, 'error');
			}
		}
	};

	async function asDataUrl(url: string): Promise<string> {
		const blob = await (await fetch(url)).blob();
		return await new Promise((ok) => {
			const r = new FileReader();
			r.onload = () => ok(String(r.result));
			r.readAsDataURL(blob);
		});
	}

	function onfocusin() {
		focused = true;
		activeDrawing.tools = tools;
		activeDrawing.recent = tools;
	}
	function onfocusout(e: FocusEvent) {
		if (canvas?.contains(e.relatedTarget as Node)) return;
		focused = false;
		spaceDown = false;
		if (activeDrawing.tools === tools) activeDrawing.tools = null;
	}
	$effect(() => () => {
		if (activeDrawing.tools === tools) activeDrawing.tools = null;
		if (activeDrawing.recent === tools) activeDrawing.recent = null;
	});

	const cursor = $derived(spaceDown || tool === 'hand' ? 'grab' : tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair');
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
	bind:this={canvas}
	bind:clientWidth={width}
	data-drawing-canvas
	role="application"
	aria-label="Drawing ({shown.shapes.length} shapes). V select, R rectangle, O ellipse, D diamond, A arrow, L line, P pen, T text, E eraser."
	tabindex="0"
	class="drawing relative overflow-hidden rounded-lg border border-stone-200 outline-none select-none dark:border-stone-700 {focused || selected ? 'ring-2 ring-sky-500/50' : ''}"
	style:height="{shownHeight}px"
	style:cursor
	{onfocusin}
	{onfocusout}
	{onkeydown}
	{onkeyup}
	{onwheel}
	{onpointerdown}
	{ondblclick}
	{oncopy}
	{oncut}
	{onpaste}
	{ondragover}
	{ondrop}
>
	<svg class="absolute inset-0 size-full" aria-hidden="true">
		<g transform="translate({pan.x} {pan.y}) scale({zoom})">
			{#each shown.shapes as s (s.id)}
				<g data-shape={s.id} data-kind={s.kind} opacity={erasing.has(s.id) ? 0.25 : 1}>
					{#if s.kind === 'image'}
						{#if s.src && urls[s.src]}
							<image href={urls[s.src]} x={s.x} y={s.y} width={s.w} height={s.h} preserveAspectRatio="none" />
						{:else}
							<rect x={s.x} y={s.y} width={s.w} height={s.h} fill="none" stroke="currentColor" stroke-dasharray="4 4" class="text-stone-400" />
						{/if}
					{/if}
					{#if !(editing?.id === s.id)}{@html marksOf(s)}{:else if s.kind !== 'text'}{@html marksOf({ ...s, text: '' })}{/if}
				</g>
			{/each}
			{#if target && byId.get(target)}
				{@const b = byId.get(target)!}
				<rect x={b.x - 6} y={b.y - 6} width={b.w + 12} height={b.h + 12} rx="6" fill="none" stroke="#0ea5e9" stroke-width={2 / zoom} opacity="0.7" />
			{/if}
			{#if marquee}
				<rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="rgb(14 165 233 / 0.08)" stroke="#0ea5e9" stroke-width={1 / zoom} />
			{/if}
		</g>
		{#if selectionBox && !editing && !marquee}
			{@const b = selectionBox}
			{#if pickedLine}
				{#each [0, 1] as const as which (which)}
					{@const pts = lineDrawn(pickedLine)}
					{@const [x, y] = which ? pts[pts.length - 1] : pts[0]}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<circle class="pointer-events-auto" cx={pan.x + x * zoom} cy={pan.y + y * zoom} r="5" fill="white" stroke="#0ea5e9" stroke-width="1.5" style:cursor="move" data-handle="end-{which}" onpointerdown={(e) => endFrom(e, pickedLine, which)} />
				{/each}
			{:else}
				<rect x={pan.x + b.x * zoom - 4} y={pan.y + b.y * zoom - 4} width={b.w * zoom + 8} height={b.h * zoom + 8} fill="none" stroke="#0ea5e9" stroke-width="1" stroke-dasharray={picked.length > 1 ? '4 3' : undefined} />
				{#if editable}
					{#each HANDLES as h (h)}
						{@const [x, y] = handleAt({ x: b.x * zoom + pan.x - 4, y: b.y * zoom + pan.y - 4, w: b.w * zoom + 8, h: b.h * zoom + 8 }, h)}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<rect class="pointer-events-auto" x={x - 4} y={y - 4} width="8" height="8" rx="1.5" fill="white" stroke="#0ea5e9" stroke-width="1.5" style:cursor={CURSORS[h]} data-handle={h} onpointerdown={(e) => resizeFrom(e, h)} />
					{/each}
				{/if}
			{/if}
		{/if}
	</svg>

	<!-- An image's page: a badge that goes there. -->
	{#each shown.shapes.filter((s) => s.kind === 'image' && s.page) as s (s.id)}
		<button
			class="absolute flex items-center gap-0.5 rounded-md bg-sky-500/90 px-1 py-px text-[11px] font-medium text-white tabular-nums shadow-sm hover:bg-sky-600"
			style:left="{pan.x + s.x * zoom + 4}px"
			style:top="{pan.y + s.y * zoom + 4}px"
			title="Go to page {s.page}"
			aria-label="Go to page {s.page}"
			onclick={() => onjump({ page: s.page! })}><span class="icon-[lucide--file-text] size-3"></span>{s.page}</button
		>
	{/each}

	{#if editing && editBox}
		{@const b = editBox}
		<textarea
			bind:value={draft}
			onkeydown={onEditKey}
			onblur={() => void endEdit(true)}
			{@attach (el: HTMLTextAreaElement) => {
				el.focus({ preventScroll: true });
				el.select();
			}}
			rows="1"
			aria-label="Text"
			spellcheck="false"
			class="absolute resize-none overflow-hidden border-none bg-transparent p-0 outline-none [field-sizing:content]"
			style:left="{b.left}px"
			style:top="{b.top}px"
			style:width={b.width ? `${b.width}px` : undefined}
			style:min-width="{b.size}px"
			style:font-size="{b.size}px"
			style:line-height="{lineHeight(b.size)}px"
			style:font-family={b.family}
			style:color={b.ink}
			style:text-align={b.align}
		></textarea>
	{/if}

	{#if editable}
		<!-- Tools. -->
		<div class="absolute top-2 left-2 flex items-center gap-0.5 rounded-lg border border-stone-200 bg-white/95 p-0.5 text-stone-600 shadow-sm dark:border-stone-700 dark:bg-stone-900/95 dark:text-stone-300" role="toolbar" aria-label="Drawing tools">
			{#each TOOLS as t (t.tool)}
				<button
					type="button"
					class="grid size-7 place-items-center rounded-md hover:bg-stone-100 aria-pressed:bg-sky-100 aria-pressed:text-sky-700 dark:hover:bg-stone-800 dark:aria-pressed:bg-sky-900/60 dark:aria-pressed:text-sky-300"
					aria-label={t.label}
					aria-pressed={tool === t.tool}
					title="{t.label} ({t.key})"
					onclick={() => ((tool = t.tool), canvas?.focus({ preventScroll: true }))}><span class="{t.icon} size-4"></span></button
				>
			{/each}
		</div>
	{/if}

	{#if !shown.shapes.length && editable}
		<p class="pointer-events-none absolute inset-0 grid place-items-center text-[13px] text-muted">Pick a tool and draw, or paste an image</p>
	{/if}

	<!-- View controls. -->
	<div class="absolute right-2 bottom-3 flex items-center gap-0.5 rounded-md border border-stone-200 bg-white/90 p-0.5 text-stone-600 shadow-sm dark:border-stone-700 dark:bg-stone-900/90 dark:text-stone-300">
		<button class="grid size-6 place-items-center rounded hover:bg-stone-100 dark:hover:bg-stone-800" aria-label="Zoom out" onclick={() => zoomBy(0.8)}><span class="icon-[lucide--minus] size-3.5"></span></button>
		<span class="w-9 text-center text-[11px] tabular-nums">{Math.round(zoom * 100)}%</span>
		<button class="grid size-6 place-items-center rounded hover:bg-stone-100 dark:hover:bg-stone-800" aria-label="Zoom in" onclick={() => zoomBy(1.25)}><span class="icon-[lucide--plus] size-3.5"></span></button>
		<button class="grid size-6 place-items-center rounded hover:bg-stone-100 dark:hover:bg-stone-800" aria-label="Fit the drawing" onclick={() => fit()}><span class="icon-[lucide--maximize] size-3.5"></span></button>
	</div>
	{#if editable}
		<BlockGrip {height} min={160} bind:dragging={dragHeight} {onresize} onfit={() => void fitHeight()} />
	{/if}
</div>

<style>
	.drawing {
		background-color: #ffffff;
		background-image: radial-gradient(rgb(0 0 0 / 0.07) 1px, transparent 1px);
		background-size: 20px 20px;
	}
	:global(.dark) .drawing {
		background-color: #1c1917;
		background-image: radial-gradient(rgb(255 255 255 / 0.06) 1px, transparent 1px);
	}
</style>
