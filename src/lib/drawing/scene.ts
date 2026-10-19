// A drawing in the notes: a flat list of shapes, drawn in order (the last on top).
// Boxes (rectangle, ellipse, diamond, text, image) have a position and size; lines
// and pen strokes have points. A line's ends can stick to a box (`start`, `end`):
// they're drawn where the line meets that box's outline, so they follow it when
// it moves. Pure functions: every edit returns a new scene, and the notes' undo
// covers it. Files are edited by people and agents too: a wrong value reads as
// its default, unknown fields are kept.

export type ShapeKind = 'rect' | 'ellipse' | 'diamond' | 'line' | 'pen' | 'text' | 'image';
export type Point = [number, number];
export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

export type FillStyle = 'hachure' | 'cross' | 'solid';
export type Dash = 'solid' | 'dashed' | 'dotted';
export type Font = 'hand' | 'sans' | 'serif' | 'mono';

export interface Style {
	/** A palette colour (see render.ts) or #rrggbb. */
	stroke: string;
	/** 'none', or a colour. */
	fill: string;
	fillStyle: FillStyle;
	width: number;
	dash: Dash;
	font: Font;
	/** Text size, in px. */
	size: number;
}

export interface Shape extends Box {
	id: string;
	kind: ShapeKind;
	/** Rough's seed: the same wobble on every redraw. */
	seed: number;
	style: Style;
	/** A box's label, or a text shape's text. */
	text?: string;
	/** line, pen: in drawing coordinates (x, y, w, h are their bounds). */
	points?: Point[];
	/** line: the boxes its ends stick to. */
	start?: string;
	end?: string;
	/** line: arrowheads at each end. */
	heads?: [boolean, boolean];
	/** image: its file (a path in the notes' folder) and the page it was taken from. */
	src?: string;
	page?: number;
	[extra: string]: unknown;
}

export interface Scene {
	id: string;
	/** Hand-drawn (rough) lines, or clean ones. */
	sketch: boolean;
	shapes: Shape[];
	[extra: string]: unknown;
}

const KINDS: readonly ShapeKind[] = ['rect', 'ellipse', 'diamond', 'line', 'pen', 'text', 'image'];
const BOXES = new Set<ShapeKind>(['rect', 'ellipse', 'diamond', 'text', 'image']);
/** Kinds a line's end can stick to. */
const isBox = (s: Pick<Shape, 'kind'>) => BOXES.has(s.kind);
export const isPath = (s: Pick<Shape, 'kind'>) => s.kind === 'line' || s.kind === 'pen';

export const DEFAULT_STYLE: Style = { stroke: 'ink', fill: 'none', fillStyle: 'hachure', width: 2, dash: 'solid', font: 'hand', size: 20 };
export const SIZES = [16, 20, 28, 36] as const;
export const WIDTHS = [1, 2, 4] as const;

export const newId = () => Math.random().toString(36).slice(2, 10);
const newSeed = () => Math.floor(Math.random() * 2 ** 31);

export const newScene = (): Scene => ({ id: newId(), sketch: true, shapes: [] });

// ── Reading ──────────────────────────────────────────────────────────

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const oneOf = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d);
const isPoint = (p: unknown): p is Point => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n));

function normalizeStyle(raw: unknown): Style {
	const s = isObject(raw) ? raw : {};
	return {
		...s,
		stroke: str(s.stroke) || DEFAULT_STYLE.stroke,
		fill: str(s.fill) || DEFAULT_STYLE.fill,
		fillStyle: oneOf(s.fillStyle, ['hachure', 'cross', 'solid'], DEFAULT_STYLE.fillStyle),
		width: Math.max(0.5, Math.min(16, num(s.width, DEFAULT_STYLE.width))),
		dash: oneOf(s.dash, ['solid', 'dashed', 'dotted'], DEFAULT_STYLE.dash),
		font: oneOf(s.font, ['hand', 'sans', 'serif', 'mono'], DEFAULT_STYLE.font),
		size: Math.max(6, Math.min(200, num(s.size, DEFAULT_STYLE.size)))
	};
}

function normalizeShape(raw: unknown): Shape | null {
	if (!isObject(raw) || !KINDS.includes(raw.kind as ShapeKind)) return null;
	const kind = raw.kind as ShapeKind;
	const shape: Shape = {
		...raw,
		id: str(raw.id) || newId(),
		kind,
		x: num(raw.x, 0),
		y: num(raw.y, 0),
		w: Math.max(0, num(raw.w, 0)),
		h: Math.max(0, num(raw.h, 0)),
		seed: Math.floor(num(raw.seed, 1)),
		style: normalizeStyle(raw.style)
	};
	for (const k of ['text', 'start', 'end', 'src'] as const) {
		if (str(raw[k]) === undefined) delete shape[k];
	}
	if (raw.page !== undefined && !(typeof raw.page === 'number' && raw.page >= 1)) delete shape.page;
	if (isPath(shape)) {
		const points = Array.isArray(raw.points) ? raw.points.filter(isPoint).map(([x, y]) => [x, y] as Point) : [];
		if (points.length < 2) return null;
		shape.points = points;
		Object.assign(shape, pointsBox(points));
	} else delete shape.points;
	if (kind === 'line') {
		const h = raw.heads;
		shape.heads = Array.isArray(h) && h.length === 2 ? [!!h[0], !!h[1]] : [false, false];
	} else (delete shape.heads, delete shape.start, delete shape.end);
	if (kind === 'image' && !shape.src) return null;
	return shape;
}

/** A drawing as the app needs it (shapes it can't read are dropped; two with one id keep the first; a line sticking to a box that's gone doesn't). */
export function normalizeScene(raw: unknown): Scene {
	const s = isObject(raw) ? raw : {};
	const seen = new Set<string>();
	const shapes: Shape[] = [];
	for (const r of Array.isArray(s.shapes) ? s.shapes : []) {
		const shape = normalizeShape(r);
		if (shape && !seen.has(shape.id)) (seen.add(shape.id), shapes.push(shape));
	}
	const boxes = new Set(shapes.filter(isBox).map((b) => b.id));
	for (const l of shapes) {
		if (l.start && (!boxes.has(l.start) || l.start === l.id)) delete l.start;
		if (l.end && (!boxes.has(l.end) || l.end === l.id)) delete l.end;
	}
	return { ...s, id: str(s.id) || newId(), sketch: s.sketch !== false, shapes };
}

// ── Geometry ─────────────────────────────────────────────────────────

export function pointsBox(points: readonly Point[]): Box {
	const xs = points.map((p) => p[0]);
	const ys = points.map((p) => p[1]);
	const x = Math.min(...xs);
	const y = Math.min(...ys);
	return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** A box with a positive size, from two corners. */
export function boxOf(a: Point, b: Point): Box {
	return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) };
}

function union(boxes: readonly Box[]): Box | null {
	if (!boxes.length) return null;
	const x = Math.min(...boxes.map((b) => b.x));
	const y = Math.min(...boxes.map((b) => b.y));
	return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

const centre = (b: Box): Point => [b.x + b.w / 2, b.y + b.h / 2];
/** Room left between a box and a line that sticks to it. */
const GAP = 6;

/** Where the ray from the middle of `box` toward `from` meets its outline (backed off by GAP). */
function outlinePoint(box: Shape, from: Point): Point {
	const [cx, cy] = centre(box);
	let dx = from[0] - cx;
	let dy = from[1] - cy;
	if (!dx && !dy) dy = -1;
	const hw = box.w / 2 + GAP;
	const hh = box.h / 2 + GAP;
	let t: number;
	if (box.kind === 'ellipse') t = 1 / Math.hypot(dx / hw, dy / hh);
	else if (box.kind === 'diamond') t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
	else t = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
	return [cx + dx * t, cy + dy * t];
}

/** A line's points as drawn: an end that sticks to a box is where the line meets it. */
export function linePoints(scene: Scene, line: Shape): Point[] {
	const pts = (line.points ?? []).map((p) => [...p] as Point);
	if (line.kind !== 'line' || pts.length < 2) return pts;
	const box = (id?: string) => (id ? scene.shapes.find((s) => s.id === id && isBox(s)) : undefined);
	const a = box(line.start);
	const b = box(line.end);
	const last = pts.length - 1;
	// Each end points at the next point, or (a straight line) at the middle of the other end's box.
	const aimA = b && last === 1 ? centre(b) : pts[1];
	const aimB = a && last === 1 ? centre(a) : pts[last - 1];
	if (a) pts[0] = outlinePoint(a, aimA);
	if (b) pts[last] = outlinePoint(b, aimB);
	return pts;
}

/** A shape's box as drawn (a line's, with its ends where they stick). */
export function bounds(scene: Scene, s: Shape): Box {
	return s.kind === 'line' ? pointsBox(linePoints(scene, s)) : { x: s.x, y: s.y, w: s.w, h: s.h };
}

export function sceneBounds(scene: Scene): Box | null {
	return union(scene.shapes.map((s) => bounds(scene, s)));
}

function segmentDistance(p: Point, a: Point, b: Point) {
	const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
	const len = dx * dx + dy * dy;
	const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
	return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Is the point on the shape (within `tol` of a line, inside a box)? */
function hits(scene: Scene, s: Shape, p: Point, tol = 6): boolean {
	if (isPath(s)) {
		const pts = s.kind === 'line' ? linePoints(scene, s) : s.points!;
		const reach = tol + s.style.width / 2;
		for (let i = 1; i < pts.length; i++) if (segmentDistance(p, pts[i - 1], pts[i]) <= reach) return true;
		return false;
	}
	const [cx, cy] = centre(s);
	const hw = s.w / 2 + tol;
	const hh = s.h / 2 + tol;
	const dx = Math.abs(p[0] - cx);
	const dy = Math.abs(p[1] - cy);
	if (s.kind === 'ellipse') return (dx / hw) ** 2 + (dy / hh) ** 2 <= 1;
	if (s.kind === 'diamond') return dx / hw + dy / hh <= 1;
	return dx <= hw && dy <= hh;
}

/** The topmost shape at a point. */
export function shapeAt(scene: Scene, p: Point, tol = 6): Shape | undefined {
	return scene.shapes.findLast((s) => hits(scene, s, p, tol));
}

/** The topmost box a line's end at `p` would stick to (not `except`, nor the line itself). */
export function boxAt(scene: Scene, p: Point, except: readonly string[] = []): Shape | undefined {
	return scene.shapes.findLast((s) => isBox(s) && !except.includes(s.id) && hits(scene, s, p, 4));
}

/** The shapes wholly inside a box (a selection drawn around them). */
export function within(scene: Scene, box: Box): string[] {
	return scene.shapes
		.filter((s) => {
			const b = bounds(scene, s);
			return b.x >= box.x && b.y >= box.y && b.x + b.w <= box.x + box.w && b.y + b.h <= box.y + box.h;
		})
		.map((s) => s.id);
}

// ── Edits ────────────────────────────────────────────────────────────

/** A new shape (an id and seed of its own, the style given over the default). */
export function makeShape(kind: ShapeKind, fields: Partial<Omit<Shape, 'style'>> & { style?: Partial<Style> } = {}): Shape {
	const { style, ...rest } = fields;
	const s: Shape = { x: 0, y: 0, w: 0, h: 0, ...rest, id: (rest.id as string | undefined) ?? newId(), kind, seed: (rest.seed as number | undefined) ?? newSeed(), style: { ...DEFAULT_STYLE, ...style } };
	if (s.points) Object.assign(s, pointsBox(s.points));
	if (kind === 'line') s.heads ??= [false, true];
	return s;
}

export function add(scene: Scene, ...shapes: Shape[]): Scene {
	return { ...scene, shapes: [...scene.shapes, ...shapes] };
}

/** Change shapes (a path's box follows its points). */
export function update(scene: Scene, ids: readonly string[], patch: Partial<Shape> | ((s: Shape) => Partial<Shape>)): Scene {
	const set = new Set(ids);
	return {
		...scene,
		shapes: scene.shapes.map((s) => {
			if (!set.has(s.id)) return s;
			const next = { ...s, ...(typeof patch === 'function' ? patch(s) : patch) };
			if (next.points) Object.assign(next, pointsBox(next.points));
			return next;
		})
	};
}

/** Change the style of shapes. */
export function restyle(scene: Scene, ids: readonly string[], style: Partial<Style>): Scene {
	return update(scene, ids, (s) => ({ style: { ...s.style, ...style } }));
}

/** A line no longer sticking to `ids` keeps its ends where they were drawn. */
function unstick(scene: Scene, shapes: Shape[], ids: ReadonlySet<string>): Shape[] {
	return shapes.map((l) => {
		if (l.kind !== 'line' || !((l.start && ids.has(l.start)) || (l.end && ids.has(l.end)))) return l;
		const pts = linePoints(scene, l);
		const next: Shape = { ...l, points: pts, ...pointsBox(pts) };
		if (l.start && ids.has(l.start)) delete next.start;
		if (l.end && ids.has(l.end)) delete next.end;
		return next;
	});
}

/** Remove shapes; lines that stuck to them stay where they were. */
export function remove(scene: Scene, ids: readonly string[]): Scene {
	const set = new Set(ids);
	return { ...scene, shapes: unstick(scene, scene.shapes, set).filter((s) => !set.has(s.id)) };
}

/** Move shapes. A line moved without the boxes it sticks to comes loose from them. */
export function moveBy(scene: Scene, ids: readonly string[], dx: number, dy: number): Scene {
	const set = new Set(ids);
	const loose = new Set(scene.shapes.filter((s) => isBox(s) && !set.has(s.id)).map((s) => s.id));
	const shapes = scene.shapes.map((s) => {
		if (!set.has(s.id)) return s;
		if (s.kind === 'line') {
			const pts = linePoints(scene, s).map(([x, y]) => [x + dx, y + dy] as Point);
			const next: Shape = { ...s, points: pts, ...pointsBox(pts) };
			if (s.start && loose.has(s.start)) delete next.start;
			if (s.end && loose.has(s.end)) delete next.end;
			return next;
		}
		const next: Shape = { ...s, x: s.x + dx, y: s.y + dy };
		if (s.points) next.points = s.points.map(([x, y]) => [x + dx, y + dy] as Point);
		return next;
	});
	return { ...scene, shapes };
}

/**
 * Scale shapes from one box to another (a selection's handles). Text grows with
 * its box; a box with `keepRatio` (an image) keeps its shape.
 */
export function resize(scene: Scene, ids: readonly string[], from: Box, to: Box): Scene {
	const sx = from.w ? to.w / from.w : 1;
	const sy = from.h ? to.h / from.h : 1;
	const map = ([x, y]: Point): Point => [to.x + (x - from.x) * sx, to.y + (y - from.y) * sy];
	const set = new Set(ids);
	const shapes = scene.shapes.map((s) => {
		if (!set.has(s.id)) return s;
		if (isPath(s)) {
			const pts = (s.kind === 'line' ? linePoints(scene, s) : s.points!).map(map);
			return { ...s, points: pts, ...pointsBox(pts) };
		}
		const [x, y] = map([s.x, s.y]);
		const next: Shape = { ...s, x, y, w: Math.max(1, s.w * Math.abs(sx)), h: Math.max(1, s.h * Math.abs(sy)) };
		if (sx < 0) next.x -= next.w;
		if (sy < 0) next.y -= next.h;
		if (s.kind === 'text') next.style = { ...s.style, size: Math.max(6, Math.round(s.style.size * Math.abs(sy) * 10) / 10) };
		return next;
	});
	return { ...scene, shapes };
}

/** Copies of shapes, moved by an offset: new ids, and lines among them stick to the copies. */
export function duplicate(scene: Scene, ids: readonly string[], offset = 16): { scene: Scene; ids: string[] } {
	const copies = copyShapes(scene.shapes.filter((s) => ids.includes(s.id)), offset);
	return { scene: add(scene, ...copies), ids: copies.map((s) => s.id) };
}

/** Shapes with new ids (and seeds), moved by an offset; lines keep sticking only to boxes copied with them. */
export function copyShapes(shapes: readonly Shape[], offset = 0): Shape[] {
	const ids = new Map(shapes.map((s) => [s.id, newId()]));
	return shapes.map((s) => {
		const c: Shape = structuredClone({ ...s, id: ids.get(s.id)!, x: s.x + offset, y: s.y + offset, seed: newSeed() });
		if (c.points) c.points = c.points.map(([x, y]) => [x + offset, y + offset] as Point);
		if (c.start) c.start = ids.get(c.start);
		if (c.end) c.end = ids.get(c.end);
		if (!c.start) delete c.start;
		if (!c.end) delete c.end;
		return c;
	});
}

/** The shapes to the top, or the bottom, keeping their order among themselves. */
export function reorder(scene: Scene, ids: readonly string[], to: 'front' | 'back'): Scene {
	const set = new Set(ids);
	const moved = scene.shapes.filter((s) => set.has(s.id));
	const rest = scene.shapes.filter((s) => !set.has(s.id));
	return { ...scene, shapes: to === 'front' ? [...rest, ...moved] : [...moved, ...rest] };
}

// ── Text ─────────────────────────────────────────────────────────────

/** What a shape says, on one line. */
const said = (s: Shape) => (s.text ?? '').replace(/\s+/g, ' ').trim();

/**
 * The drawing's words (for notes.md: search and Claude): each text and label, top
 * to bottom, then what the lines join (`A → B`) and the pages images come from.
 */
export function sceneText(scene: Scene): string[] {
	const byId = new Map(scene.shapes.map((s) => [s.id, s]));
	const name = (id?: string) => (id ? said(byId.get(id)!) || byId.get(id)!.kind : '?');
	const out = scene.shapes
		.filter((s) => s.kind !== 'line' && said(s))
		.toSorted((a, b) => a.y - b.y || a.x - b.x)
		.map(said);
	for (const l of scene.shapes) {
		if (l.kind !== 'line' || !(l.start || l.end)) continue;
		const [back, fwd] = l.heads ?? [false, false];
		const join = back && fwd ? '↔' : back ? '←' : fwd ? '→' : '—';
		out.push(`${name(l.start)} ${join} ${name(l.end)}${said(l) ? ` (${said(l)})` : ''}`);
	}
	for (const i of scene.shapes) if (i.kind === 'image' && i.page) out.push(`Image from p. ${i.page}`);
	return out;
}
