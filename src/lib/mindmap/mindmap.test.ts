import { describe, expect, it } from 'vitest';
import { branchPath, layout, sides, type Placed } from './layout';
import { addChild, addSibling, demote, find, flipSide, move, newMap, normalizeMap, promote, remove, setPage, setText, toggleCollapsed, toOutline, visibleTopics, type MindMap, type Topic } from './tree';

const t = (id: string, children: Topic[] = [], more: Partial<Topic> = {}): Topic => ({ id, text: id, children, ...more });
const map = (root: Topic): MindMap => ({ root });
const ids = (ts: Topic[]) => ts.map((x) => x.id);

describe('mind map edits', () => {
	const m = map(t('root', [t('a', [t('a1'), t('a2')]), t('b')]));

	it('a new map: the title in the middle and a branch to type in', () => {
		const n = newMap('Fusing kernels');
		expect(n.root.text).toBe('Fusing kernels');
		expect(n.root.children).toHaveLength(1);
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

	it('branches split between right and left by height; given sides kept', () => {
		const root = t('root', [t('a', [t('a1'), t('a2'), t('a3')]), t('b'), t('c'), t('d')]);
		const s = sides(root, (x) => (x.id === 'a' ? 3 : 1));
		expect([...s]).toEqual([['a', 'right'], ['b', 'left'], ['c', 'left'], ['d', 'left']]);
		expect(sides(t('root', [t('a', [], { side: 'left' }), t('b')]), () => 1).get('a')).toBe('left');
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
