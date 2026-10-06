import { afterEach, describe, expect, it, vi } from 'vitest';

const key = (k: string, o: Partial<KeyboardEventInit> & { altGr?: boolean } = {}) =>
	({ key: k, code: o.code ?? '', metaKey: !!o.metaKey, ctrlKey: !!o.ctrlKey, altKey: !!o.altKey, shiftKey: !!o.shiftKey, getModifierState: (m: string) => m === 'AltGraph' && !!o.altGr }) as unknown as KeyboardEvent;

async function load(os: 'macos' | 'windows') {
	vi.resetModules();
	vi.doMock('./os', () => ({ os, mac: os === 'macos' }));
	return import('./shortcuts');
}
afterEach(() => vi.doUnmock('./os'));

describe('matches (macOS)', () => {
	it('matches ⌘ combos and the physical key under ⌥', async () => {
		const { matches } = await load('macos');
		expect(matches(key('s', { metaKey: true }), '⌘S')).toBe(true);
		expect(matches(key('s', { ctrlKey: true }), '⌘S')).toBe(false);
		expect(matches(key('™', { metaKey: true, altKey: true, code: 'Digit2' }), '⌥⌘2')).toBe(true);
		expect(matches(key('1', { metaKey: true, ctrlKey: true, code: 'Digit1' }), '⌃⌘1')).toBe(true);
		expect(matches(key('?', { shiftKey: true }), '?')).toBe(true);
		expect(matches(key('D', { metaKey: true, shiftKey: true, code: 'KeyD' }), '⌘⇧D')).toBe(true);
		expect(matches(key('d', { metaKey: true, code: 'KeyD' }), '⌘⇧D')).toBe(false);
	});
});

describe('matches (Windows / Linux)', () => {
	it('uses Ctrl as the mod key', async () => {
		const { matches } = await load('windows');
		expect(matches(key('s', { ctrlKey: true }), 'Ctrl+S')).toBe(true);
		expect(matches(key('s', { metaKey: true }), 'Ctrl+S')).toBe(false);
		expect(matches(key('b', { ctrlKey: true, altKey: true, code: 'KeyB' }), 'Alt+Ctrl+B')).toBe(true);
	});
	it('never treats AltGr (Ctrl+Alt) typing as a shortcut', async () => {
		const { matches } = await load('windows');
		expect(matches(key('@', { ctrlKey: true, altKey: true, code: 'Digit2', altGr: true }), 'Alt+Ctrl+2')).toBe(false);
	});
});
