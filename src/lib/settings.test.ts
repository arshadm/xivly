import { describe, expect, it } from 'vitest';
import { applyChanges, overrideOf, pick } from './settings.svelte';

describe('settings storage', () => {
	it('keeps known keys and valid choices only', () => {
		expect(pick({ coverStyle: 'stack', recentWindow: 'month', zoomMode: 'auto', unknown: 1 } as never)).toEqual({ coverStyle: 'stack', recentWindow: 'month', zoomMode: 'auto' });
		expect(pick({ coverStyle: 'gone', recentWindow: 'year' } as never)).toEqual({});
	});
	it('stores only what differs from the defaults', () => {
		expect(overrideOf('recentWindow', 'week')).toBeUndefined();
		expect(overrideOf('recentWindow', 'day')).toBe('day');
		expect(overrideOf('noteEmojis', ['💬', '🤔', '💡', '🤯', '🧐', '🤨', '😍', '📌'])).toBeUndefined();
		expect(overrideOf('noteEmojis', ['🔥', '🤔', '💡', '🤯', '🧐', '🤨', '😍', '📌'])).toEqual(['🔥', '🤔', '💡', '🤯', '🧐', '🤨', '😍', '📌']);
	});
	it('keeps a note emoji set of 8 single emoji only', () => {
		const ok = ['🔥', '🤔', '💡', '🤯', '😵‍💫', '🤨', '😍', '📌'];
		expect(pick({ noteEmojis: ok })).toEqual({ noteEmojis: ok });
		expect(pick({ noteEmojis: ok.slice(0, 7) })).toEqual({});
		expect(pick({ noteEmojis: [...ok.slice(0, 7), 'ab'] })).toEqual({});
	});
	it('keeps a known text box font only', () => {
		expect(pick({ freetextFont: 'Courier' })).toEqual({ freetextFont: 'Courier' });
		expect(pick({ freetextFont: 'Comic' } as never)).toEqual({});
		expect(overrideOf('freetextFont', 'Handwritten')).toBeUndefined();
	});
	it('merges changed keys into what another window stored', () => {
		const stored = { coverStyle: 'stack', recentWindow: 'day' } as const;
		expect(applyChanges(stored, { recentWindow: undefined, sortDesc: false })).toEqual({ coverStyle: 'stack', sortDesc: false });
		expect(applyChanges(stored, null)).toEqual({});
	});
});
