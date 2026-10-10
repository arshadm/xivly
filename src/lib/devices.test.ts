import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceStore, deviceId, mergeVisits } from './devices';
import { MemoryFs } from './onboarding/memory-fs';

const enc = new TextEncoder();
const dec = new TextDecoder();
const json = async (fs: MemoryFs, path: string) => JSON.parse(dec.decode((await fs.read(path))!));

describe('visits from several devices', () => {
	it('the latest opening, and the position recorded last', () => {
		const mac = new Map([['p', { opened: '2026-10-01T10:00:00Z', position: 3.2, at: '2026-10-01T10:05:00Z' }]]);
		const ipad = new Map([['p', { opened: '2026-10-02T09:00:00Z', position: 7.5, at: '2026-10-02T09:30:00Z' }]]);
		expect(mergeVisits([mac, ipad]).get('p')).toEqual({ opened: '2026-10-02T09:00:00Z', position: 7.5, at: '2026-10-02T09:30:00Z' });
		expect(mergeVisits([ipad, mac]).get('p')).toEqual({ opened: '2026-10-02T09:00:00Z', position: 7.5, at: '2026-10-02T09:30:00Z' });
	});

	it('a newer record without a position keeps the older position', () => {
		const a = new Map([['p', { position: 4, at: '1' }]]);
		const b = new Map([['p', { opened: 'x', at: '2' }]]);
		expect(mergeVisits([a, b]).get('p')).toMatchObject({ position: 4, opened: 'x' });
	});
});

describe('deviceId', () => {
	it('made once, then the same', () => {
		const store = new Map<string, string>();
		const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
		const id = deviceId(s);
		expect(id).toMatch(/^[0-9a-f-]{36}$/);
		expect(deviceId(s)).toBe(id);
	});
});

describe('DeviceStore', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('writes only its own file, a moment after; reads every device’s', async () => {
		const fs = new MemoryFs();
		await fs.write('.xivly/devices/ipad.json', enc.encode(JSON.stringify({ papers: { p: { position: 9, at: '2000-01-01T00:00:00Z' }, q: { position: 2, at: '2999-01-01T00:00:00Z' } } })));
		const mac = new DeviceStore(fs, 'mac', 1000);
		mac.note('p', { position: 4.5 });
		mac.note('p', { opened: '2026-10-10T08:00:00Z' });
		expect(await fs.exists('.xivly/devices/mac.json')).toBe(false);
		await vi.advanceTimersByTimeAsync(1000);
		await mac.flush();
		const mine = await json(fs, '.xivly/devices/mac.json');
		expect(mine.papers.p).toMatchObject({ position: 4.5, opened: '2026-10-10T08:00:00Z' });
		expect(mine.papers.q).toBeUndefined();
		const all = await mac.readAll();
		expect(all.get('p')?.position).toBe(4.5);
		expect(all.get('q')?.position).toBe(2);
		// The iPad's file was never written.
		expect((await json(fs, '.xivly/devices/ipad.json')).papers.p.position).toBe(9);
	});

	it('two windows of one device: both kept', async () => {
		const fs = new MemoryFs();
		const a = new DeviceStore(fs, 'mac');
		const b = new DeviceStore(fs, 'mac');
		a.note('p', { position: 2 });
		b.note('q', { position: 5 });
		await a.flush();
		await b.flush();
		expect(Object.keys((await json(fs, '.xivly/devices/mac.json')).papers).sort()).toEqual(['p', 'q']);
	});

	it('forgets a removed paper', async () => {
		const fs = new MemoryFs();
		const s = new DeviceStore(fs, 'mac');
		s.note('p', { position: 2 });
		await s.flush();
		s.forget('p');
		await s.flush();
		expect((await json(fs, '.xivly/devices/mac.json')).papers.p).toBeUndefined();
	});
});
