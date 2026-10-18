import { describe, expect, it } from 'vitest';
import { canMove, childrenOf, loopCuts, normalizeNode, parents, rankIn, ranksBetween, subtree, type NotebookNode } from './tree';

const node = (id: string, fields: Partial<NotebookNode> = {}): NotebookNode => ({ ...normalizeNode(id, {}), ...fields });
const folder = (id: string, fields: Partial<NotebookNode> = {}) => node(id, { kind: 'folder', ...fields });
const ids = (nodes: NotebookNode[]) => nodes.map((n) => n.id);

describe('normalizeNode', () => {
	it('keeps unknown fields and fixes bad types', () => {
		const n = normalizeNode('x', { kind: 'box', title: '  ', parent: 3, rank: 'a', papers: ['a', 1, 'a', 'b'], mine: { k: 1 } });
		expect(n).toMatchObject({ id: 'x', kind: 'notebook', title: 'x', parent: undefined, rank: 0, papers: ['a', 'b'], mine: { k: 1 } });
		expect(normalizeNode('y', { kind: 'folder', title: ' Ideas ', parent: 'f', rank: 2.5 })).toMatchObject({ kind: 'folder', title: 'Ideas', parent: 'f', rank: 2.5 });
		expect(normalizeNode('z', 'nope').title).toBe('z');
	});
});

describe('the tree', () => {
	const nodes = [folder('f', { rank: 1 }), node('a', { rank: 0 }), node('b', { parent: 'f', rank: 1 }), folder('g', { parent: 'f', rank: 0 }), node('c', { parent: 'g' })];

	it('lists a folder in rank order, then by title', () => {
		expect(ids(childrenOf(nodes))).toEqual(['a', 'f']);
		expect(ids(childrenOf(nodes, 'f'))).toEqual(['g', 'b']);
		expect(ids(childrenOf([node('y', { title: 'B' }), node('x', { title: 'A' })]))).toEqual(['x', 'y']);
	});

	it('shows an item whose parent is missing or not a folder at the top level', () => {
		const odd = [node('n'), node('a', { parent: 'gone' }), node('b', { parent: 'n' }), node('c', { parent: 'c' })];
		expect(ids(childrenOf(odd))).toEqual(['a', 'b', 'c', 'n']);
	});

	it('breaks a loop edited by hand at its smallest id', () => {
		const loop = [folder('b', { parent: 'a' }), folder('a', { parent: 'c' }), folder('c', { parent: 'b' }), node('d', { parent: 'c' })];
		const shown = parents(loop);
		expect(shown.get('a')).toBeUndefined();
		expect(ids(childrenOf(loop))).toEqual(['a']);
		expect(subtree(loop, 'a')).toEqual(['a', 'b', 'c', 'd']);
	});

	it('finds everything inside a folder', () => {
		expect(subtree(nodes, 'f')).toEqual(['f', 'b', 'g', 'c']);
		expect(subtree(nodes, 'a')).toEqual(['a']);
	});

	it('moves only into folders, never into itself or one inside it', () => {
		expect(canMove(nodes, 'a', 'f')).toBe(true);
		expect(canMove(nodes, 'g', undefined)).toBe(true);
		expect(canMove(nodes, 'a', 'b')).toBe(false);
		expect(canMove(nodes, 'f', 'f')).toBe(false);
		expect(canMove(nodes, 'f', 'g')).toBe(false);
		expect(canMove(nodes, 'a', 'gone')).toBe(false);
	});

	it('ranks a place among the others', () => {
		expect(rankIn(nodes, 'a', 'f', 0)).toBe(-1);
		expect(rankIn(nodes, 'a', 'f', 1)).toBe(0.5);
		expect(rankIn(nodes, 'a', 'f', 9)).toBe(2);
		expect(rankIn(nodes, 'b', 'f', 0)).toBe(-1);
		expect(rankIn(nodes, 'a', 'g', 0)).toBe(-1);
		expect(rankIn([], 'a', undefined, 0)).toBe(0);
	});

	it('spreads several ranks between two neighbors', () => {
		expect(ranksBetween(0, 1, 3)).toEqual([0.25, 0.5, 0.75]);
		expect(ranksBetween(undefined, 5, 2)).toEqual([3, 4]);
		expect(ranksBetween(2, undefined, 2)).toEqual([3, 4]);
		expect(ranksBetween(undefined, undefined, 2)).toEqual([0, 1]);
	});
});

describe('loopCuts', () => {
	it('names the item each loop is cut at, and nothing else', () => {
		expect(loopCuts([folder('b', { parent: 'a' }), folder('a', { parent: 'b' }), folder('c', { parent: 'gone' })])).toEqual(['a']);
		expect(loopCuts([folder('a'), node('b', { parent: 'a' })])).toEqual([]);
	});
});
