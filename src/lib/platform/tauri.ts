import { invoke } from '@tauri-apps/api/core';
import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener';
import type { LibraryFs, Platform } from './types';

const fs: LibraryFs = {
	async read(path) {
		try {
			return new Uint8Array(await invoke<ArrayBuffer>('fs_read', { path }));
		} catch (e) {
			if (String(e).startsWith('ENOENT')) return null;
			throw new Error(String(e));
		}
	},
	write: (path, data) => invoke('fs_write', data, { headers: { 'x-path': encodeURIComponent(path).replaceAll('%2F', '/') } }),
	list: (path) => invoke('fs_list', { path }),
	exists: (path) => invoke('fs_exists', { path }),
	mkdir: (path) => invoke('fs_mkdir', { path }),
	trash: (path) => invoke('fs_trash', { path })
};

const named = (path: string) => ({ fs, name: path.split(/[\\/]/).pop() ?? path });

export const tauriPlatform: Platform = {
	kind: 'desktop',
	onDisk: true,
	// Always a library: the default one (iCloud Drive/Xivly) is created on first launch.
	restore: async () => named(await invoke<string>('get_library_path')),
	reconnect: async () => null,
	async pick() {
		// The native picker runs in Rust, which also stores the choice.
		const dir = await invoke<string | null>('pick_library');
		return dir ? named(dir) : null;
	},
	openUrl: (url) => openUrl(url),
	reveal: async (path) => revealItemInDir(await invoke<string>('fs_abs', { path })),
	runHook: (event, paperId) => invoke('run_hook', { event, paperId })
};
