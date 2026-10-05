// Adding papers: PDF files, or an arXiv link / id (typed in the "+" panel, or pasted).
import { parseArxiv } from './arxiv';
import { toast } from './components/Toasts.svelte';
import { library } from './library.svelte';
import { openPaperWhenReady } from './windows';

/** New papers open right away (a handful at most, when many are dropped at once). */
const MAX_OPEN = 4;

/** Import files and open what was added. Call it in the user's gesture. */
export async function addFiles(files: File[]) {
	const pdfs = files.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
	const pending = pdfs.slice(0, MAX_OPEN).map(() => openPaperWhenReady());
	const ids = await library.import(pdfs);
	pending.forEach((p, i) => (ids[i] ? p.open(ids[i], library.get(ids[i])?.title) : p.cancel()));
}

/** The file picker, then open what was added. */
export async function pickFiles() {
	await addFiles(await library.pickFiles());
}

export async function addFromArxiv(text: string) {
	if (!parseArxiv(text)) return toast('That isn’t an arXiv link or id', 'error');
	const pending = openPaperWhenReady();
	try {
		const { id, existed } = await library.importArxiv(text);
		const title = library.get(id)?.title ?? id;
		if (existed) toast(`Already in your library: ${title}`);
		pending.open(id, title);
	} catch (e) {
		pending.cancel();
		toast(String(e), 'error');
	}
}

/** Library window: pasting an arXiv link or PDF files adds them. */
export function onLibraryPaste(e: ClipboardEvent) {
	const t = e.target as HTMLElement | null;
	if (t?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName ?? '')) return;
	const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type === 'application/pdf');
	const text = e.clipboardData?.getData('text/plain') ?? '';
	if (files.length) {
		e.preventDefault();
		void addFiles(files);
	} else if (parseArxiv(text)) {
		e.preventDefault();
		void addFromArxiv(text);
	}
}
