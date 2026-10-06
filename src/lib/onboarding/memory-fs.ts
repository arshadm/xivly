// An in-memory library folder (LibraryFs), so the starter builder can use the
// app's own Repo and produce exactly what the app would write on disk.
import type { LibraryFs } from '$lib/platform';

export class MemoryFs implements LibraryFs {
	files = new Map<string, Uint8Array>();
	#dirs = new Set<string>(['']);

	async read(path: string) {
		return this.files.get(path) ?? null;
	}
	async write(path: string, data: Uint8Array) {
		this.#mkdirs(path.split('/').slice(0, -1).join('/'));
		this.files.set(path, data);
	}
	async list(path: string) {
		const prefix = path ? `${path}/` : '';
		const out = new Map<string, boolean>();
		for (const p of [...this.files.keys(), ...this.#dirs]) {
			if (!p.startsWith(prefix) || p === path) continue;
			const [name, ...rest] = p.slice(prefix.length).split('/');
			if (name) out.set(name, out.get(name) || rest.length > 0 || this.#dirs.has(prefix + name));
		}
		return [...out].map(([name, dir]) => ({ name, dir }));
	}
	async exists(path: string) {
		return this.files.has(path) || this.#dirs.has(path);
	}
	async mkdir(path: string) {
		this.#mkdirs(path);
	}
	async trash(path: string) {
		for (const p of [...this.files.keys()]) if (p === path || p.startsWith(`${path}/`)) this.files.delete(p);
		for (const d of [...this.#dirs]) if (d === path || d.startsWith(`${path}/`)) this.#dirs.delete(d);
	}
	#mkdirs(path: string) {
		const parts = path.split('/').filter(Boolean);
		for (let i = 1; i <= parts.length; i++) this.#dirs.add(parts.slice(0, i).join('/'));
	}
}
