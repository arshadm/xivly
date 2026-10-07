import { afterEach, describe, expect, it } from 'vitest';
import { ReaderLock, readerOpen } from './reader-lock.svelte';

const tick = () => new Promise((r) => setTimeout(r, 0));
let locks: ReaderLock[] = [];
const reader = (id: string) => {
	const l = new ReaderLock(id);
	locks.push(l);
	return l;
};
afterEach(() => {
	locks.forEach((l) => l.dispose());
	locks = [];
});

describe('ReaderLock: one reader per paper', () => {
	it('lets the first reader have the paper, the second one sees it open elsewhere', async () => {
		const a = reader('p');
		const b = reader('p');
		await a.claim();
		await b.claim();
		expect(a.access).toBe('mine');
		expect(b.access).toBe('elsewhere');
		expect(await readerOpen('p')).toBe(true);
		// Another paper is free.
		const c = reader('q');
		await c.claim();
		expect(c.access).toBe('mine');
	});

	it('takes the paper over once the first reader saved', async () => {
		const a = reader('p');
		const b = reader('p');
		await a.claim();
		await b.claim();
		const saved: string[] = [];
		const done = b.takeOver(() => void a.handOver(async () => (saved.push('a'), true)));
		expect(b.access).toBe('waiting');
		await done;
		expect(saved).toEqual(['a']);
		expect(a.access).toBe('elsewhere');
		expect(b.access).toBe('mine');
	});

	it('keeps the paper where its annotations could not be saved', async () => {
		const a = reader('p');
		const b = reader('p');
		await a.claim();
		await b.claim();
		const done = b.takeOver(() => void a.handOver(async () => false).then((ok) => !ok && b.cancel()));
		await done;
		expect(a.access).toBe('mine');
		expect(b.access).toBe('elsewhere');
	});

	it('frees the paper when its reader goes away', async () => {
		const a = reader('p');
		await a.claim();
		a.dispose();
		await tick();
		expect(await readerOpen('p')).toBe(false);
		const b = reader('p');
		await b.claim();
		expect(b.access).toBe('mine');
	});

	it('never hands over to a reader that is not asking', async () => {
		const a = reader('p');
		const b = reader('p');
		await b.claim();
		expect(await a.handOver(async () => true)).toBe(false);
		await a.claim();
		expect(a.access).toBe('elsewhere');
	});
});
