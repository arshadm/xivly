// Vitest runs in Node: older Node versions (CI) have no Web Locks API, which
// Repo uses to serialize read-merge-write per file. An in-process stand-in:
// one queue per lock name, exclusive mode only (all Repo needs).
if (!globalThis.navigator?.locks) {
	const queues = new Map<string, Promise<unknown>>();
	const locks = {
		request<T>(name: string, fn: () => Promise<T>): Promise<T> {
			const previous = queues.get(name) ?? Promise.resolve();
			const run = previous.then(fn, fn);
			queues.set(name, run.catch(() => {}));
			return run;
		}
	};
	if (globalThis.navigator) Object.defineProperty(globalThis.navigator, 'locks', { value: locks, configurable: true });
	else Object.defineProperty(globalThis, 'navigator', { value: { locks }, configurable: true });
}
