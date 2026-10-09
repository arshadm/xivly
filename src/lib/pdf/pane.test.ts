import { describe, expect, it } from 'vitest';
import { clampWidth, PANE_MIN } from './pane';

describe('clampWidth', () => {
	it('keeps a width that fits', () => {
		expect(clampWidth(420, 1280)).toBe(420);
	});
	it('never goes under the minimum', () => {
		expect(clampWidth(100, 1280)).toBe(PANE_MIN);
	});
	it('leaves the pages at least 40% of the window', () => {
		expect(clampWidth(1000, 1280)).toBe(768);
	});
	it('a window too small for both still gets the minimum', () => {
		expect(clampWidth(400, 300)).toBe(PANE_MIN);
	});
});
