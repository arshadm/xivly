import { describe, expect, it } from 'vitest';
import { branchPath, layout, type Placed } from './layout';
import { addChild, addSibling, balance, branchSides, demote, find, flipSide, move, newMap, normalizeMap, promote, remove, setPage, setText, toggleCollapsed, toOutline, visibleTopics, type MindMap, type Topic } from './tree';

const t = (id: string, children: Topic[] = [], more: Partial<Topic> = {}): Topic => ({ id, text: id, children, ...more });
const map = (root: Topic): MindMap => ({ root });
const ids = (ts: Topic[]) => ts.map((x) => x.id);

describe('mind map edits', () => {
	const m = map(t('root', [t('a', [t('a1'), t('a2')]), t('b')]));

	it('a new map: the title in the middle', () => {
		const n = newMap('Fusing kernels');
		expect(n.root.text).toBe('Fusing kernels');
		expect(n.root.children).toHaveLength(0);
	});

	it('child, sibling (a branch from the central topic), and they get selected', () => {
		const c = addChild(m, 'a1', 'deeper');
		expect(find(c.map.root, c.select)?.parent?.id).toBe('a1');
		const s = addSibling(m, 'a1', 'next');
		expect(ids(find(s.map.root, 'a')!.topic.children)).toEqual(['a1', s.select, 'a2']);
		// On the central topic: a new branch.
		const b = addSibling(m, 'root');
		expect(find(b.map.root, b.select)?.parent?.id).toBe('root');
	});

	it('remove selects a neighbour, else the parent; the central topic stays', () => {
		expect(remove(m, 'a1').select).toBe('a2');
		expect(remove(m, 'a2').select).toBe('a1');
		const only = remove(map(t('root', [t('x', [t('y')])])), 'y');
		expect(only.select).toBe('x');
		expect(remove(m, 'root').map).toBe(m);
	});

	it('move, promote and demote', () => {
		expect(ids(move(m, 'a2', -1).map.root.children[0].children)).toEqual(['a2', 'a1']);
		expect(move(m, 'a1', -1).map).toBe(m);
		expect(ids(promote(m, 'a2').map.root.children)).toEqual(['a', 'a2', 'b']);
		expect(promote(m, 'a').map).toBe(m);
		expect(ids(find(demote(m, 'b').map.root, 'a')!.topic.children)).toEqual(['a1', 'a2', 'b']);
		expect(demote(m, 'a').map).toBe(m);
	});

	it('edits never change the map they were given; untouched branches are shared', () => {
		const next = setText(m, 'a1', 'changed');
		expect(find(m.root, 'a1')!.topic.text).toBe('a1');
		expect(next.root.children[1]).toBe(m.root.children[1]);
	});

	it('page links, and a branch moved to the other side (central topic’s branches only)', () => {
		expect(find(setPage(m, 'a1', 5).root, 'a1')!.topic.page).toBe(5);
		expect(find(flipSide(m, 'b', 'left').root, 'b')!.topic.side).toBe('left');
		expect(flipSide(m, 'a1', 'left')).toBe(m);
	});

	it('collapsed branches are skipped when reading in order', () => {
		expect(ids(visibleTopics(toggleCollapsed(m, 'a').root))).toEqual(['root', 'a', 'b']);
		expect(ids(visibleTopics(m.root))).toEqual(['root', 'a', 'a1', 'a2', 'b']);
	});

	it('an outline for notes.md, with page links', () => {
		const o = map(t('root', [t('a', [], { text: 'Method **fusion**', page: 3 }), t('b', [], { text: '' })]));
		expect(toOutline(o)).toBe('- root\n  - Method **fusion** (p. 3)\n  - …');
	});

	it('maps from files: duplicate ids renewed, junk dropped', () => {
		const n = normalizeMap({ root: { id: 'r', text: 'R', children: [{ id: 'x', text: 'A', page: 'p' }, { id: 'x', text: 'B' }, 5, { text: 'C', side: 'up' }] } });
		expect(n.root.children.map((c) => c.text)).toEqual(['A', 'B', 'C']);
		expect(new Set([n.root.id, ...n.root.children.map((c) => c.id)]).size).toBe(4);
		expect(n.root.children[0].page).toBeUndefined();
		expect(normalizeMap(null, 'Title').root.text).toBe('Title');
	});
});

describe('balanced layout', () => {
	const size = (w = 80, h = 24) => () => ({ w, h });
	const overlap = (a: Placed, b: Placed) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

	it('branches without a side split by topic count (right first); given sides kept', () => {
		const root = t('root', [t('a', [t('a1'), t('a2'), t('a3')]), t('b'), t('c'), t('d')]);
		expect([...branchSides(root)]).toEqual([['a', 'right'], ['b', 'left'], ['c', 'left'], ['d', 'left']]);
		expect(branchSides(t('root', [t('a', [], { side: 'left' }), t('b')])).get('a')).toBe('left');
	});

	it('a branch never changes side as its text (its drawn size) changes', () => {
		const m = map(t('root', [t('a'), t('b')]));
		const side = (sizes: (id: string) => { w: number; h: number }) => layout(m.root, sizes).topics.find((x) => x.id === 'b')!.side;
		expect(side(() => ({ w: 96, h: 32 }))).toBe(side((id) => (id === 'b' ? { w: 240, h: 90 } : { w: 80, h: 30 })));
	});

	it('a new branch goes on the lighter side and stays there; existing branches are fixed where they are', () => {
		let m: MindMap = newMap('Paper');
		const first = addChild(m, m.root.id, 'one');
		m = first.map;
		const second = addChild(m, m.root.id, 'two');
		m = second.map;
		expect(m.root.children.map((c) => c.side)).toEqual(['right', 'left']);
		// More under "one": "two" stays on the left; typing changes nothing either.
		m = addChild(addChild(m, first.select, 'x').map, first.select, 'y').map;
		m = setText(m, second.select, 'a much longer text that wraps over several lines');
		expect(layout(m.root, () => ({ w: 80, h: 30 })).topics.find((x) => x.id === second.select)!.side).toBe('left');
		// A third: the lighter side is the left now (1 against 2).
		expect(addChild(m, m.root.id).map.root.children.at(-1)!.side).toBe('left');
		// Next to a branch: on its side.
		expect(addSibling(m, first.select).map.root.children[1].side).toBe('right');
	});

	it('balance spreads the branches again', () => {
		const m = map(t('root', [t('a', [], { side: 'left' }), t('b', [], { side: 'left' }), t('c', [], { side: 'left' })]));
		expect(balance(m).root.children.map((c) => c.side)).toEqual(['right', 'right', 'left']);
	});

	it('the central topic in the middle; right grows right, left grows left; no overlaps', () => {
		const root = t('root', [t('a', [t('a1'), t('a2', [t('a2x')])]), t('b', [t('b1')]), t('c'), t('d', [t('d1'), t('d2')])]);
		const l = layout(root, size());
		const at = (id: string) => l.topics.find((x) => x.id === id)!;
		expect(at('root')).toMatchObject({ x: -40, y: -12, side: 'root' });
		for (const p of l.topics.filter((x) => x.side === 'right')) expect(p.x).toBeGreaterThan(at(p.parent!).x);
		for (const p of l.topics.filter((x) => x.side === 'left')) expect(p.x).toBeLessThan(at(p.parent!).x);
		for (const [i, a] of l.topics.entries()) for (const b of l.topics.slice(i + 1)) expect(overlap(a, b), `${a.id} / ${b.id}`).toBe(false);
		// Children keep their order, top to bottom.
		expect(at('a1').y).toBeLessThan(at('a2').y);
		expect(l.branches).toHaveLength(l.topics.length - 1);
	});

	it('collapsed: children hidden, and counted', () => {
		const l = layout(t('root', [t('a', [t('a1', [t('a1x')]), t('a2')], { collapsed: true })]), size());
		expect(l.topics.map((x) => x.id)).toEqual(['root', 'a']);
		expect(l.topics[1].hidden).toBe(3);
	});

	it('bigger topics push their neighbours apart; branches are smooth curves', () => {
		const sizes: Record<string, { w: number; h: number }> = { a: { w: 200, h: 120 } };
		const l = layout(t('root', [t('a'), t('b'), t('c')]), (id) => sizes[id] ?? { w: 60, h: 20 });
		const a = l.topics.find((x) => x.id === 'a')!;
		expect(a.h).toBe(120);
		expect(branchPath(l.branches[0])).toMatch(/^M [-\d.]+ [-\d.]+ C /);
		expect(l.bounds.w).toBeGreaterThan(200);
	});
});
