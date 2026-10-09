import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Saver } from './saver.svelte';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Saver', () => {
	it('writes the latest value once typing pauses', async () => {
		const write = vi.fn(async () => {});
		const saver = new Saver<string>(write, 800);
		saver.change('a');
		await vi.advanceTimersByTimeAsync(500);
		saver.change('ab');
		expect(saver.state).toBe('pending');
		await vi.advanceTimersByTimeAsync(500);
		expect(write).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(300);
		expect(write).toHaveBeenCalledExactlyOnceWith('ab');
		expect(saver.state).toBe('saved');
		expect(saver.dirty).toBe(false);
		expect(saver.savedAt).toBeInstanceOf(Date);
	});

	it('flush writes at once, and only when something changed', async () => {
		const write = vi.fn(async () => {});
		const saver = new Saver<string>(write);
		await saver.flush();
		expect(write).not.toHaveBeenCalled();
		saver.change('x');
		await saver.flush();
		expect(write).toHaveBeenCalledExactlyOnceWith('x');
		await vi.advanceTimersByTimeAsync(2000);
		expect(write).toHaveBeenCalledTimes(1);
	});

	it('one write at a time; a change during a write is written after it', async () => {
		let release!: () => void;
		const writes: string[] = [];
		const saver = new Saver<string>(async (v) => {
			writes.push(v);
			if (v === 'first') await new Promise<void>((r) => (release = r));
		});
		saver.change('first');
		const flushing = saver.flush();
		await vi.advanceTimersByTimeAsync(0);
		saver.change('second');
		expect(saver.state).toBe('saving');
		expect(saver.dirty).toBe(true);
		const second = saver.flush();
		release();
		await flushing;
		await second;
		expect(writes).toEqual(['first', 'second']);
		expect(saver.state).toBe('saved');
	});

	it('a failed write is reported, then retried', async () => {
		const write = vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined);
		const saver = new Saver<string>(write, 800, 5000);
		saver.change('x');
		await saver.flush();
		expect(saver.state).toBe('error');
		expect(saver.error).toBe('disk full');
		expect(saver.dirty).toBe(true);
		await vi.advanceTimersByTimeAsync(5000);
		expect(write).toHaveBeenCalledTimes(2);
		expect(saver.state).toBe('saved');
		expect(saver.error).toBeNull();
	});
});
