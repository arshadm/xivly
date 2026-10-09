import { Channel, invoke } from '@tauri-apps/api/core';
import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener';
import type { LibraryFs, Platform } from './types';

/** Headers are ASCII-only. */
const header = (s: string) => encodeURIComponent(s).replaceAll('%2F', '/');

/**
 * The library at `rootDir`. Every fs command names it, and Rust refuses it
 * once the library was changed: a window left open across a change (or a
 * task still running for the old library) can never write into the new one,
 * where a paper may have the same id.
 */
function libraryFs(rootDir: string): LibraryFs {
	return {
		async read(path) {
			try {
				return new Uint8Array(await invoke<ArrayBuffer>('fs_read', { rootDir, path }));
			} catch (e) {
				if (String(e).startsWith('ENOENT')) return null;
				throw new Error(String(e));
			}
		},
		write: (path, data) => invoke('fs_write', data, { headers: { 'x-root': header(rootDir), 'x-path': header(path) } }),
		list: (path) => invoke('fs_list', { rootDir, path }),
		readEach: (dir, file) => invoke('fs_read_each', { rootDir, dir, file }),
		exists: (path) => invoke('fs_exists', { rootDir, path }),
		mkdir: (path) => invoke('fs_mkdir', { rootDir, path }),
		trash: (path) => invoke('fs_trash', { rootDir, path })
	};
}

/** The library this window opened last (Show in Finder, hooks). */
let rootDir = '';

function opened(path: string) {
	rootDir = path;
	return { fs: libraryFs(path), name: path.split(/[\\/]/).pop() ?? path };
}

export const tauriPlatform: Platform = {
	kind: 'desktop',
	onDisk: true,
	// Always a library: the default one (iCloud Drive/Xivly) is created on first launch.
	restore: async () => opened(await invoke<string>('get_library_path')),
	reconnect: async () => null,
	async pick() {
		// The native picker runs in Rust, which changes the library once every
		// window saved its work; then this window reopens it or closes
		// (`library-change-finished`, +layout.svelte).
		await invoke('change_library');
		return null;
	},
	openUrl: (url) => openUrl(url),
	reveal: async (path) => revealItemInDir(await invoke<string>('fs_abs', { rootDir, path })),
	runHook: (event, paperId) => invoke('run_hook', { rootDir, event, paperId }),
	async pickArxivFetchDir() {
		const { open } = await import('@tauri-apps/plugin-dialog');
		const dir = await open({ directory: true, title: 'The arxiv_fetch folder (with arxiv.db)' });
		return dir && !Array.isArray(dir) ? dir : null;
	},
	readArxivFetch: (dir) => invoke('feed_import_arxiv_fetch', { dir }),
	claude: {
		locate: (path) => invoke('claude_locate', { path: path || null }),
		run(request, onEvent) {
			const channel = new Channel<unknown>();
			channel.onmessage = onEvent;
			return invoke('claude_run', { request: { ...request, rootDir }, onEvent: channel });
		},
		cancel: (id) => invoke('claude_cancel', { id })
	}
};
