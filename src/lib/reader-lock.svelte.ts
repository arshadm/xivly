// One reader per paper. Two tabs on the same paper (web, Chrome extension)
// would each save the PDF they loaded, and the last save would wipe the other's
// annotations. A reader holds a Web Lock per paper (shared by every tab and
// window of the app) while it shows the paper; a second reader shows "open in
// another tab" instead, and can take the paper over: the first one saves, lets
// go of the lock and shows that state itself, then the second one loads the
// saved PDF.

/**
 * `checking`: asking for the lock. `mine`: this reader may show and save the
 * paper. `elsewhere`: another reader has it. `waiting`: taking it over.
 */
export type ReaderAccess = 'checking' | 'mine' | 'elsewhere' | 'waiting';

/** How long a take-over waits for the other reader (saving a large PDF takes a moment). */
const TAKE_OVER_MS = 15_000;

const lockName = (id: string) => `xivly:reader:${id}`;

/** Whether a reader (any tab or window) shows this paper right now. */
export async function readerOpen(id: string) {
	const { held = [] } = await navigator.locks.query();
	return held.some((l) => l.name === lockName(id));
}

/** The lock, held until the returned function is called; `null` when `ifAvailable` and it's taken. */
function acquire(name: string, options: { ifAvailable?: boolean; signal?: AbortSignal }): Promise<(() => void) | null> {
	return new Promise((resolve, reject) => {
		navigator.locks
			.request(name, options, (lock) => {
				if (!lock) return resolve(null);
				return new Promise<void>((release) => resolve(release));
			})
			.catch(reject);
	});
}

export class ReaderLock {
	access = $state<ReaderAccess>('checking');
	#release: (() => void) | null = null;
	#waiting: AbortController | null = null;
	#disposed = false;

	constructor(readonly id: string) {}

	/** Hold the lock if no other reader has it (on open, and again when the tab comes back). */
	async claim() {
		if (this.access === 'mine' || this.access === 'waiting') return;
		this.#got(await acquire(lockName(this.id), { ifAvailable: true }));
	}

	/**
	 * Take the paper over: `ask` the reader that has it to hand it over, then
	 * wait for the lock. Back to `elsewhere` if it doesn't come (`cancel`, or no
	 * answer in time).
	 */
	async takeOver(ask: () => void) {
		if (this.access !== 'elsewhere') return;
		this.access = 'waiting';
		const waiting = (this.#waiting = new AbortController());
		const timeout = setTimeout(() => waiting.abort(), TAKE_OVER_MS);
		const lock = acquire(lockName(this.id), { signal: waiting.signal });
		ask();
		try {
			this.#got(await lock);
		} catch {
			if (!this.#disposed) this.access = 'elsewhere';
		} finally {
			clearTimeout(timeout);
			this.#waiting = null;
		}
	}

	/** Stop waiting (the other reader couldn't save its annotations, so it keeps the paper). */
	cancel() {
		this.#waiting?.abort();
	}

	/**
	 * Another reader asks for the paper: `save` first (`false` when there are
	 * annotations it couldn't save: the paper stays here), then let go.
	 */
	async handOver(save: () => Promise<boolean>) {
		if (this.access !== 'mine') return false;
		if (!(await save())) return false;
		this.#release?.();
		this.#release = null;
		this.access = 'elsewhere';
		return true;
	}

	dispose() {
		this.#disposed = true;
		this.#waiting?.abort();
		this.#release?.();
		this.#release = null;
	}

	#got(release: (() => void) | null) {
		// Disposed meanwhile (the tab moved on to another paper): let go at once.
		if (this.#disposed) return release?.();
		this.#release = release;
		this.access = release ? 'mine' : 'elsewhere';
	}
}
