// A mind map: a tree of topics. Every edit returns a new tree (the editor keeps
// each version for undo); the topic to select afterwards comes with it.

export interface Topic {
	id: string;
	/** Inline Markdown: **bold**, *italic*, `code`, $maths$. */
	text: string;
	/** A page of the paper it points at (a chip that jumps there). */
	page?: number;
	collapsed?: boolean;
	/** For the central topic's branches: which side they grow on (else balanced). */
	side?: 'left' | 'right';
	children: Topic[];
}

export interface MindMap {
	root: Topic;
}

const newId = () => crypto.randomUUID().slice(0, 8);
const topic = (text = ''): Topic => ({ id: newId(), text, children: [] });

/** A new map: the central topic, and one branch to start typing in. */
export function newMap(title: string): MindMap {
	return { root: { ...topic(title || 'Topic'), children: [topic()] } };
}

export interface Found {
	topic: Topic;
	parent: Topic | null;
	index: number;
	depth: number;
}

export function find(root: Topic, id: string, parent: Topic | null = null, index = 0, depth = 0): Found | null {
	if (root.id === id) return { topic: root, parent, index, depth };
	for (const [i, c] of root.children.entries()) {
		const hit = find(c, id, root, i, depth + 1);
		if (hit) return hit;
	}
	return null;
}

/** The tree with topic `id` replaced by `change(topic)` (untouched branches shared). */
function update(root: Topic, id: string, change: (t: Topic) => Topic): Topic {
	if (root.id === id) return change(root);
	let changed = false;
	const children = root.children.map((c) => {
		const next = update(c, id, change);
		if (next !== c) changed = true;
		return next;
	});
	return changed ? { ...root, children } : root;
}

export interface Edit {
	map: MindMap;
	/** The topic to select after the edit. */
	select: string;
}

export function setText(map: MindMap, id: string, text: string): MindMap {
	return { ...map, root: update(map.root, id, (t) => ({ ...t, text })) };
}

export function setPage(map: MindMap, id: string, page: number | undefined): MindMap {
	return { ...map, root: update(map.root, id, (t) => ({ ...t, page })) };
}

export function toggleCollapsed(map: MindMap, id: string): MindMap {
	return { ...map, root: update(map.root, id, (t) => ({ ...t, collapsed: !t.collapsed || undefined })) };
}

/** A new topic as the last child of `id` (expanded, so it shows). */
export function addChild(map: MindMap, id: string, text = ''): Edit {
	const child = topic(text);
	return { map: { ...map, root: update(map.root, id, (t) => ({ ...t, collapsed: undefined, children: [...t.children, child] })) }, select: child.id };
}

/** A new topic right after `id` (on the central topic: a new branch). */
export function addSibling(map: MindMap, id: string, text = ''): Edit {
	const at = find(map.root, id);
	if (!at?.parent) return addChild(map, id, text);
	const sibling: Topic = { ...topic(text), side: at.topic.side };
	const children = [...at.parent.children];
	children.splice(at.index + 1, 0, sibling);
	return { map: { ...map, root: update(map.root, at.parent.id, (p) => ({ ...p, children })) }, select: sibling.id };
}

/** Removes a topic and its branch (not the central topic); selects a neighbour, else the parent. */
export function remove(map: MindMap, id: string): Edit {
	const at = find(map.root, id);
	if (!at?.parent) return { map, select: id };
	const children = at.parent.children.filter((c) => c.id !== id);
	const next = children[at.index] ?? children[at.index - 1] ?? at.parent;
	return { map: { ...map, root: update(map.root, at.parent.id, (p) => ({ ...p, children })) }, select: next.id };
}

/** Up (-1) or down (1) among its siblings. */
export function move(map: MindMap, id: string, dir: -1 | 1): Edit {
	const at = find(map.root, id);
	if (!at?.parent) return { map, select: id };
	const to = at.index + dir;
	if (to < 0 || to >= at.parent.children.length) return { map, select: id };
	const children = [...at.parent.children];
	[children[at.index], children[to]] = [children[to], children[at.index]];
	return { map: { ...map, root: update(map.root, at.parent.id, (p) => ({ ...p, children })) }, select: id };
}

/** One level out: after its parent, among the parent's siblings (not onto the central topic's level and above). */
export function promote(map: MindMap, id: string): Edit {
	const at = find(map.root, id);
	if (!at?.parent) return { map, select: id };
	const grand = find(map.root, at.parent.id);
	if (!grand?.parent) return { map, select: id };
	let root = update(map.root, at.parent.id, (p) => ({ ...p, children: p.children.filter((c) => c.id !== id) }));
	root = update(root, grand.parent.id, (g) => {
		const children = [...g.children];
		children.splice(grand.index + 1, 0, { ...at.topic, side: grand.topic.side });
		return { ...g, children };
	});
	return { map: { ...map, root }, select: id };
}

/** One level in: the last child of the topic before it. */
export function demote(map: MindMap, id: string): Edit {
	const at = find(map.root, id);
	if (!at?.parent || at.index === 0) return { map, select: id };
	const before = at.parent.children[at.index - 1];
	const moved = { ...at.topic, side: undefined };
	let root = update(map.root, at.parent.id, (p) => ({ ...p, children: p.children.filter((c) => c.id !== id) }));
	root = update(root, before.id, (b) => ({ ...b, collapsed: undefined, children: [...b.children, moved] }));
	return { map: { ...map, root }, select: id };
}

/** A branch of the central topic onto the other side. */
export function flipSide(map: MindMap, id: string, side: 'left' | 'right'): MindMap {
	const at = find(map.root, id);
	if (!at?.parent || at.parent.id !== map.root.id) return map;
	return { ...map, root: update(map.root, id, (t) => ({ ...t, side })) };
}

// ── Files ────────────────────────────────────────────────────────────────

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function normalizeTopic(raw: unknown, seen: Set<string>): Topic | null {
	if (!isObject(raw)) return null;
	let id = typeof raw.id === 'string' && raw.id ? raw.id : newId();
	if (seen.has(id)) id = newId();
	seen.add(id);
	const page = Number(raw.page);
	return {
		id,
		text: typeof raw.text === 'string' ? raw.text : '',
		page: Number.isInteger(page) && page >= 1 ? page : undefined,
		collapsed: raw.collapsed === true || undefined,
		side: raw.side === 'left' || raw.side === 'right' ? raw.side : undefined,
		children: (Array.isArray(raw.children) ? raw.children : []).map((c) => normalizeTopic(c, seen)).filter((c): c is Topic => !!c)
	};
}

/** A map from the notes file (hand-edited, older…): ids made unique, wrong types dropped. */
export function normalizeMap(raw: unknown, title = 'Topic'): MindMap {
	const root = isObject(raw) ? normalizeTopic(raw.root, new Set()) : null;
	return { root: root ?? { id: newId(), text: title, children: [] } };
}

/** The map as a nested Markdown list (notes.md, export, Claude). */
export function toOutline(map: MindMap): string {
	const lines: string[] = [];
	const walk = (t: Topic, depth: number) => {
		const text = t.text.replace(/\s+/g, ' ').trim() || '…';
		lines.push(`${'  '.repeat(depth)}- ${text}${t.page ? ` (p. ${t.page})` : ''}`);
		t.children.forEach((c) => walk(c, depth + 1));
	};
	walk(map.root, 0);
	return lines.join('\n');
}

/** Topics in the order they're read (the central one first), for arrow keys and search. */
export function visibleTopics(root: Topic): Topic[] {
	const out: Topic[] = [];
	const walk = (t: Topic) => {
		out.push(t);
		if (!t.collapsed) t.children.forEach(walk);
	};
	walk(root);
	return out;
}
