// Everything platform-specific goes through this interface. The library
// logic on top (`#lib/repo.ts`) is shared by the desktop and web builds.

/** Minimal filesystem over the library root. Paths are relative, `/`-separated. */
export interface LibraryFs {
	/** `null` when missing; throws on any other error. */
	read(path: string): Promise<Uint8Array | null>;
	/** Atomic (temp + rename / swap file). Creates parent folders. */
	write(path: string, data: Uint8Array): Promise<void>;
	list(path: string): Promise<{ name: string; dir: boolean }[]>;
	/**
	 * Optional: `file` in every child folder of `dir` at once (desktop: one call
	 * for the whole library). `text` is null when it's missing; `error` when it
	 * exists but must be read alone (`read` says why).
	 */
	readEach?(dir: string, file: string): Promise<{ name: string; text: string | null; error: boolean }[]>;
	exists(path: string): Promise<boolean>;
	mkdir(path: string): Promise<void>;
	/** Recoverable delete (system Trash on desktop, `.xivly/trash/` on web). */
	trash(path: string): Promise<void>;
}

import type { ArxivFetchExport } from '#lib/feed/import.js';

/** A question to Claude about a paper (`claude -p` in its folder). */
interface ClaudeRequest {
	/** This run's id (to cancel it). */
	id: string;
	/** The claude to run (from `locate`). */
	claude: string;
	paperId: string;
	prompt: string;
	/** The conversation: started with this id, or continued (`resume`). */
	sessionId: string;
	resume: boolean;
	model?: string;
	/** Added to Claude Code's system prompt. */
	system?: string;
	/** Tools Claude may use, e.g. ['Read']. */
	tools: string[];
}

interface ClaudeCli {
	/** Where claude is (`path`: the one set in Settings, else found) and its version; throws when there's none. */
	locate(path?: string): Promise<{ path: string; version: string }>;
	/** Start a run; `onEvent` gets each stream-json event, then `{ type: 'xivly_exit' }`. */
	run(request: ClaudeRequest, onEvent: (event: unknown) => void): Promise<void>;
	cancel(id: string): Promise<void>;
}

export type HookEvent = 'paper-added' | 'paper-saved' | 'paper-updated' | 'paper-removed';

export interface Platform {
	kind: 'desktop' | 'web';
	/** Re-open the last library without user interaction, if possible. */
	restore(): Promise<{ fs: LibraryFs; name: string } | { needsPermission: string } | null>;
	/** Re-grant access after a restart (web: needs a user gesture). */
	reconnect(): Promise<{ fs: LibraryFs; name: string } | null>;
	/** Ask the user for a library folder. */
	pick(): Promise<{ fs: LibraryFs; name: string } | null>;
	/** Whether the library is a real folder on disk (vs browser-private storage). */
	onDisk: boolean;
	openUrl(url: string): Promise<void>;
	/** Desktop only. */
	reveal?(path: string): Promise<void>;
	/** Desktop only: run `.xivly/hooks/<event>*` scripts. */
	runHook?(event: HookEvent, paperId: string): Promise<void>;
	/** Desktop only: pick the arxiv_fetch tool's folder (null: cancelled). */
	pickArxivFetchDir?(): Promise<string | null>;
	/** Desktop only: read that folder's arxiv.db and config.json. */
	readArxivFetch?(dir: string): Promise<ArxivFetchExport>;
	/** Desktop only: the claude CLI (Claude Code), run in a paper's folder. */
	claude?: ClaudeCli;
}
