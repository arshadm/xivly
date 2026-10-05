// Online paper metadata (citation cards: abstract, TLDR, citation count…)
// cached on this device, so cards open instantly and APIs are asked once.
import type { CacheAdapter } from 'svelte-pdf-mini';
import { idb } from './idb';

const DAY = 86_400_000;
/** Found metadata is refreshed monthly (citation counts move); misses retried daily. */
const TTL = { hit: 30 * DAY, miss: DAY };

type Entry = { value: Parameters<CacheAdapter['set']>[1]; at: number };
const store = idb('metadata');

export const metadataCache: CacheAdapter = {
	async get(key) {
		const e = await store.get<Entry>(key);
		if (!e || Date.now() - e.at > (e.value ? TTL.hit : TTL.miss)) return undefined;
		return e.value;
	},
	set: (key, value) => store.set(key, { value, at: Date.now() } satisfies Entry)
};
