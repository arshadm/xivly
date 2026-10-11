import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetOpen, lastView, openPapers, rememberOpen, rememberView } from './session';

beforeEach(() => {
	const store = new Map<string, string>();
	vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
});

describe('the session', () => {
	it('papers open: in the order opened, each once; closed ones forgotten', () => {
		rememberOpen('a');
		rememberOpen('b');
		rememberOpen('a');
		expect(openPapers()).toEqual(['b', 'a']);
		forgetOpen('b');
		expect(openPapers()).toEqual(['a']);
	});

	it('the library view, unless its category is gone', () => {
		expect(lastView(() => true)).toBeNull();
		rememberView({ kind: 'reading' });
		expect(lastView(() => true)).toEqual({ kind: 'reading' });
		rememberView({ kind: 'category', id: 'mlsys' });
		expect(lastView((id) => id === 'mlsys')).toEqual({ kind: 'category', id: 'mlsys' });
		expect(lastView(() => false)).toBeNull();
		localStorage.setItem('xivly:session-view', '{"kind":"nonsense"}');
		expect(lastView(() => true)).toBeNull();
	});
});
