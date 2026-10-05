// Promise-based ask / confirm dialogs (native prompt/confirm don't exist in
// every webview). Rendered by PromptHost.svelte.

interface Request {
	title: string;
	message?: string;
	/** Text input when set (prompt), else a confirmation. */
	value?: string;
	placeholder?: string;
	confirmLabel: string;
	danger?: boolean;
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
