// Saves a value a moment after the last change (typing), one write at a time:
// the latest value always gets written, and a failed write is retried.

export type SaveState = 'saved' | 'pending' | 'saving' | 'error';

export class Saver<T> {
	state = $state<SaveState>('saved');
	/** Why the last write failed, until one succeeds. */
	error = $state<string | null>(null);
	/** When a write last succeeded (null: never, since this saver was made). */
	savedAt = $state<Date | null>(null);
	#latest: T | undefined;
	#changed = false;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#chain: Promise<void> = Promise.resolve();

	constructor(
		private readonly write: (value: T) => Promise<void>,
		private readonly delay = 800,
		private readonly retryDelay = 5000
	) {}

	/** Not written yet (waiting, writing, or failed). */
	get dirty() {
		return this.#changed || this.state === 'saving';
	}

	change(value: T) {
		this.#latest = value;
		this.#changed = true;
		if (this.state !== 'saving') this.state = 'pending';
		this.#schedule(this.delay);
	}

	/** Write now (window closing, ⌘S); resolves once the latest value is written or failed. */
	flush(): Promise<void> {
		clearTimeout(this.#timer);
		this.#chain = this.#chain.then(async () => {
			if (!this.#changed) return;
			const value = this.#latest as T;
			this.#changed = false;
			this.state = 'saving';
			try {
				await this.write(value);
				this.error = null;
				this.savedAt = new Date();
				this.state = this.#changed ? 'pending' : 'saved';
			} catch (e) {
				this.#changed = true;
				this.error = e instanceof Error ? e.message : String(e);
				this.state = 'error';
				this.#schedule(this.retryDelay);
			}
		});
		return this.#chain;
	}

	dispose() {
		clearTimeout(this.#timer);
	}

	#schedule(ms: number) {
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => void this.flush(), ms);
	}
}
