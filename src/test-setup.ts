// Vitest runs in Node: older Node versions (CI) have no Web Locks API, which
// Repo uses to serialize read-merge-write per file and readers hold per paper.
// An in-process stand-in: one queue per lock name, exclusive mode only, with
// the options the app uses (`ifAvailable`, `signal`) and `query`.
if (!globalThis.navigator?.locks) {
	type Options = { ifAvailable?: boolean; signal?: AbortSignal };
	type Callback<T> = (lock: { name: string } | null) => Promise<T> | T;
	const queues = new Map<string, Promise<unknown>>();
	const held = new Set<string>();
	const aborted = () => new DOMException('The request was aborted', 'AbortError');
	const locks = {
		request<T>(name: string, ...args: [Callback<T>] | [Options, Callback<T>]): Promise<T> {
			const [options, fn] = args.length === 1 ? [{} as Options, args[0]] : args;
			if (options.ifAvailable && (held.has(name) || queues.has(name))) return Promise.resolve().then(() => fn(null));
			if (options.signal?.aborted) return Promise.reject(aborted());
			let granted = false;
			const previous = queues.get(name) ?? Promise.resolve();
			const run = previous.then(async () => {
				if (options.signal?.aborted) throw aborted();
				granted = true;
				held.add(name);
				try {
					return await fn({ name });
				} finally {
					held.delete(name);
				}
			});
			const tail = run.catch(() => {});
			queues.set(name, tail);
			void tail.then(() => queues.get(name) === tail && queues.delete(name));
			// A queued request rejects as soon as it's aborted (not when its turn comes).
			const abort = new Promise<never>((_, reject) => options.signal?.addEventListener('abort', () => !granted && reject(aborted()), { once: true }));
			return Promise.race([run, abort]);
		},
		async query() {
			return { held: [...held].map((name) => ({ name, mode: 'exclusive' })), pending: [] };
		}
	};
	if (globalThis.navigator) Object.defineProperty(globalThis.navigator, 'locks', { value: locks, configurable: true });
	else Object.defineProperty(globalThis, 'navigator', { value: { locks }, configurable: true });
}
