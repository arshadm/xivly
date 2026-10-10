// Balanced mind-map layout: the central topic at (0, 0), its branches split
// between the right and the left so both sides are about as tall, each branch
// growing outward with its children stacked and centred on it. Sizes are the
// topics' measured boxes (their text decides them).
import type { Topic } from './tree';

export interface Size {
	w: number;
	h: number;
}

export interface Placed {
	id: string;
	/** Top-left corner (the central topic is centred on 0, 0). */
	x: number;
	y: number;
	w: number;
	h: number;
	side: 'root' | 'left' | 'right';
	depth: number;
	parent: string | null;
	/** Topics hidden under it (collapsed), to show as a count. */
	hidden: number;
}

export interface Branch {
	from: string;
	to: string;
	/** Start (on the parent's edge) and end (on the child's edge). */
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

export interface Layout {
	topics: Placed[];
	branches: Branch[];
	/** The box around everything. */
	bounds: { x: number; y: number; w: number; h: number };
}

export interface LayoutOptions {
	/** Horizontal room between a topic and its children. */
	gapX?: number;
	/** Vertical room between neighbouring branches. */
	gapY?: number;
}

const count = (t: Topic): number => t.children.reduce((n, c) => n + 1 + count(c), 0);
const shown = (t: Topic) => (t.collapsed ? [] : t.children);

/**
 * Which side each branch of the central topic goes on: the ones given a side keep it;
 * the rest fill the right first, in order, until it holds about half the height.
 */
export function sides(root: Topic, height: (t: Topic) => number): Map<string, 'left' | 'right'> {
	const out = new Map<string, 'left' | 'right'>();
	const branches = shown(root);
	const total = branches.reduce((n, b) => n + height(b), 0);
	let right = branches.filter((b) => b.side === 'right').reduce((n, b) => n + height(b), 0);
	for (const b of branches) {
		if (b.side) out.set(b.id, b.side);
		else if (right < total / 2 || branches.length === 1) {
			out.set(b.id, 'right');
			right += height(b);
		} else out.set(b.id, 'left');
	}
	return out;
}

export function layout(root: Topic, size: (id: string) => Size, opts: LayoutOptions = {}): Layout {
	const gapX = opts.gapX ?? 40;
	const gapY = opts.gapY ?? 12;
	// The height a branch takes: its own box, or its children stacked, whichever is taller.
	const heights = new Map<string, number>();
	const height = (t: Topic): number => {
		let h = heights.get(t.id);
		if (h === undefined) {
			const kids = shown(t);
			const stacked = kids.reduce((n, c) => n + height(c), 0) + gapY * Math.max(0, kids.length - 1);
			h = Math.max(size(t.id).h, stacked);
			heights.set(t.id, h);
		}
		return h;
	};

	const topics: Placed[] = [];
	const branches: Branch[] = [];
	const rootSize = size(root.id);
	const rootBox: Placed = { id: root.id, x: -rootSize.w / 2, y: -rootSize.h / 2, w: rootSize.w, h: rootSize.h, side: 'root', depth: 0, parent: null, hidden: root.collapsed ? count(root) : 0 };
	topics.push(rootBox);

	/** Place `kids` of `parent` on one side, stacked from `top`. */
	function place(kids: Topic[], parent: Placed, side: 'left' | 'right', top: number) {
		let y = top;
		for (const c of kids) {
			const s = size(c.id);
			const band = height(c);
			const x = side === 'right' ? parent.x + parent.w + gapX : parent.x - gapX - s.w;
			const box: Placed = { id: c.id, x, y: y + (band - s.h) / 2, w: s.w, h: s.h, side, depth: parent.depth + 1, parent: parent.id, hidden: c.collapsed ? count(c) : 0 };
			topics.push(box);
			branches.push({
				from: parent.id,
				to: c.id,
				x1: side === 'right' ? parent.x + parent.w : parent.x,
				y1: parent.y + parent.h / 2,
				x2: side === 'right' ? box.x : box.x + box.w,
				y2: box.y + box.h / 2
			});
			const kidsOf = shown(c);
			if (kidsOf.length) {
				const stacked = kidsOf.reduce((n, k) => n + height(k), 0) + gapY * (kidsOf.length - 1);
				place(kidsOf, box, side, y + (band - stacked) / 2);
			}
			y += band + gapY;
		}
	}

	const side = sides(root, height);
	for (const s of ['right', 'left'] as const) {
		const kids = shown(root).filter((c) => side.get(c.id) === s);
		const stacked = kids.reduce((n, k) => n + height(k), 0) + gapY * Math.max(0, kids.length - 1);
		place(kids, rootBox, s, -stacked / 2);
	}

	const x0 = Math.min(...topics.map((t) => t.x));
	const y0 = Math.min(...topics.map((t) => t.y));
	const x1 = Math.max(...topics.map((t) => t.x + t.w));
	const y1 = Math.max(...topics.map((t) => t.y + t.h));
	return { topics, branches, bounds: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}

/** A smooth S-curve for a branch (SVG path). */
export function branchPath(b: Branch) {
	const mid = (b.x1 + b.x2) / 2;
	return `M ${b.x1} ${b.y1} C ${mid} ${b.y1}, ${mid} ${b.y2}, ${b.x2} ${b.y2}`;
}
