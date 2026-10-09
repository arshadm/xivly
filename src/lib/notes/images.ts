// Images in the notes: pasted, dropped or picked, saved next to the paper
// (`notes-assets/<hash>.<ext>`) and referenced by that relative path, so
// notes.md shows them too. Shown from the library through blob URLs (the
// desktop app only loads images from itself).
import Image, { type ImageOptions } from '@tiptap/extension-image';

/** Image types kept, and their file extension. */
export const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg' };
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** The MIME type for a kept image's extension. */
export const imageMime = (path: string) => Object.entries(IMAGE_TYPES).find(([, ext]) => path.toLowerCase().endsWith(`.${ext}`))?.[0] ?? 'application/octet-stream';

/** Where the notes' images live: save one (its path), and a URL to show one by its path. */
export interface NoteAssets {
	save(file: File): Promise<string>;
	url(src: string): Promise<string | null>;
}

/** The image files among pasted / dropped files. */
export const imageFiles = (files: FileList | null | undefined) => [...(files ?? [])].filter((f) => f.type in IMAGE_TYPES);

/** A path inside the paper's folder: relative, no `..`. */
export function isPaperPath(path: string) {
	return !!path && !path.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(path) && path.split('/').every((part) => part && part !== '.' && part !== '..');
}

export const NotesImage = Image.extend<ImageOptions & { assets: NoteAssets | null }>({
	addOptions() {
		return { ...this.parent!(), assets: null };
	},

	addNodeView() {
		return ({ node: initial }) => {
			let node = initial;
			const img = document.createElement('img');
			img.className = 'notes-image';
			img.draggable = false;
			const load = (src: string) => {
				img.alt = String(node.attrs.alt ?? '');
				img.classList.remove('notes-image-missing');
				void this.options.assets
					?.url(src)
					.catch(() => null)
					.then((url: string | null) => (url ? (img.src = url) : img.classList.add('notes-image-missing')));
			};
			load(String(node.attrs.src ?? ''));
			return {
				dom: img,
				update: (next) => {
					if (next.type !== node.type) return false;
					const src = String(next.attrs.src ?? '');
					const changed = src !== node.attrs.src;
					node = next;
					if (changed) load(src);
					return true;
				}
			};
		};
	}
});
