// Promise-based ask / confirm / choose dialogs (native prompt/confirm don't exist in
// every webview). Rendered by PromptHost.svelte.

interface Request {
	title: string;
	message?: string;
	/** Text input when set (prompt), else a confirmation. */
	value?: string;
	placeholder?: string;
	confirmLabel: string;
	danger?: boolean;
	/** Choices (choose): buttons after Cancel, the last one the default. */
	choices?: { value: string; label: string }[];
	resolve: (v: string | boolean | null) => void;
}

class PromptState {
	current = $state.raw<Request | null>(null);

	ask(title: string, opts: { value?: string; placeholder?: string; confirmLabel?: string; message?: string } = {}): Promise<string | null> {
		return new Promise((resolve) => this.#show({ title, confirmLabel: 'OK', value: '', ...opts, resolve: (v) => resolve(typeof v === 'string' ? v : null) }));
	}

	confirm(title: string, opts: { message?: string; confirmLabel?: string; danger?: boolean } = {}): Promise<boolean> {
		return new Promise((resolve) => this.#show({ title, confirmLabel: 'OK', ...opts, resolve: (v) => resolve(v === true) }));
	}

	/** One of a few choices (the last is the default), or null when cancelled. */
	choose<T extends string>(title: string, choices: { value: T; label: string }[], opts: { message?: string } = {}): Promise<T | null> {
		return new Promise((resolve) => this.#show({ title, confirmLabel: '', choices, ...opts, resolve: (v) => resolve(choices.find((c) => c.value === v)?.value ?? null) }));
	}

	/** A new prompt cancels the one still open (its caller gets null / false). */
	#show(request: Request) {
		this.current?.resolve(null);
		this.current = request;
	}

	close(result: string | boolean | null) {
		this.current?.resolve(result);
		this.current = null;
	}
}

export const prompts = new PromptState();
