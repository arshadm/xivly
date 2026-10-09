import { describe, expect, it, vi } from 'vitest';
import { anchorAt, anchorLabel, jumpTo, parseAnchor } from './anchor';

describe('anchorAt', () => {
	it('rounds to two decimals and trims the label', () => {
		expect(anchorAt(3.4219, '  Method ')).toEqual({ page: 3.42, label: 'Method' });
		expect(anchorAt(3.4219, '   ')).toEqual({ page: 3.42 });
	});
	it('never goes before the first page', () => {
		expect(anchorAt(0.5)).toEqual({ page: 1 });
	});
});

describe('parseAnchor', () => {
	it('accepts anchors, with or without a label', () => {
		expect(parseAnchor({ page: 5.5 })).toEqual({ page: 5.5 });
		expect(parseAnchor({ page: 2, label: 'Fig. 3', extra: true })).toEqual({ page: 2, label: 'Fig. 3' });
	});
	it('drops a label that is not text', () => {
		expect(parseAnchor({ page: 2, label: 4 })).toEqual({ page: 2 });
	});
	it('rejects anything else', () => {
		for (const raw of [null, 3, 'p. 3', {}, { page: '3' }, { page: 0 }, { page: NaN }, { page: Infinity }]) expect(parseAnchor(raw)).toBeNull();
	});
});

describe('anchorLabel', () => {
	it('uses the label, else the page', () => {
		expect(anchorLabel({ page: 7.9 })).toBe('p. 7');
		expect(anchorLabel({ page: 7.9, label: 'Results' })).toBe('Results');
	});
});

describe('jumpTo', () => {
	const fakeViewer = (status: string) => ({
		document: { status },
		history: { push: vi.fn() },
		location: () => ({ page: 2, fraction: 0.25 }),
		restorePosition: vi.fn(async () => {})
	});

	it('remembers where it came from, then jumps', async () => {
		const v = fakeViewer('ready');
		await jumpTo(v as never, { page: 5.5 });
		expect(v.history.push).toHaveBeenCalledWith({ page: 2, fraction: 0.25 });
		expect(v.restorePosition).toHaveBeenCalledWith(5.5);
	});
	it('does nothing before the document is ready', async () => {
		const v = fakeViewer('loading');
		await jumpTo(v as never, { page: 5.5 });
		expect(v.history.push).not.toHaveBeenCalled();
		expect(v.restorePosition).not.toHaveBeenCalled();
	});
});
