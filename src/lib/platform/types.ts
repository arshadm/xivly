// Everything platform-specific goes through this interface. The library
// logic on top (`#lib/repo.ts`) is shared by the desktop and web builds.

/** Minimal filesystem over the library root. Paths are relative, `/`-separated. */
export interface LibraryFs {
	/** `null` when missing; throws on any other error. */
	read(path: string): Promise<Uint8Array | null>;
	/** Atomic (temp + rename / swap file). Creates parent folders. */
	write(path: string, data: Uint8Array): Promise<void>;
	list(path: string): Promise<{ name: string; dir: boolean }[]>;
	exists(path: string): Promise<boolean>;
	mkdir(path: string): Promise<void>;
	/** Recoverable delete (system Trash on desktop, `.xivly/trash/` on web). */
	trash(path: string): Promise<void>;
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
}
