/// <reference types="chrome" />
// Chrome extension, page side: the app is the web build in an extension page,
// plus what the service worker (./background.ts) asks of it. Loaded by
// +layout.svelte in extension builds only.
import { untrack } from 'svelte';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import { parseArxiv } from '#lib/arxiv.js';
import { toast } from '#lib/components/Toasts.svelte';
import { library } from '#lib/library.svelte.js';
import { isPdf } from '#lib/repo.js';
import { prompts } from '#lib/ui/prompt.svelte.js';
import { readerTab, searchParams } from '#lib/windows.js';
import type { ExtensionMessage } from './messages';

export function startExtension() {
	if (__XIVLY_EXTENSION_DEV__) liveReload();
	// The toolbar button focuses a tab showing the library; "Open in Xivly" the paper's reader.
	chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, respond) => {
		const found =
			message.type === 'find-library'
				? page.route.id === '/'
				: // The reader holding the paper's lock names its tab after it (windows.ts).
					page.route.id === '/read' && window.name === readerTab(message.id);
		if (!found) return false;
		void chrome.tabs.getCurrent().then(respond);
		return true;
	});
	// "Open in Xivly" opens `#/?add=<url>`: added once the library is open (it may need a click first).
	$effect.root(() => {
		$effect(() => {
			const url = searchParams(page.url).get('add');
			if (url && library.status === 'ready') untrack(() => void open(url));
		});
	});
}

/**
 * `bun run dev:extension` rebuilds into build-extension/ and writes
 * dev-build.json last: a new page build reloads this tab, a new service worker
 * or manifest reloads the whole extension (Chrome reads unpacked files live).
 */
function liveReload() {
	let last: { page: string; worker: string } | undefined;
	setInterval(async () => {
		const build = await fetch('/dev-build.json', { cache: 'no-store' })
			.then((r) => r.json())
			.catch(() => undefined);
		if (!build) return;
		if (last && build.worker !== last.worker) {
			// The reload closes this tab: the new service worker reopens it.
			const { reopen = [] } = await chrome.storage.local.get('reopen');
			await chrome.storage.local.set({ reopen: [...(reopen as string[]), location.href] });
			chrome.runtime.reload();
		} else if (last && build.page !== last.page) location.reload();
		last = build;
	}, 1000);
}

/** Add the paper at `url` (arXiv, or any PDF), then read it in this tab. */
async function open(url: string) {
	// A reload must not add it again.
	await goto(resolve('/'), { replace: true });
	try {
		const id = parseArxiv(url) ? (await library.importArxiv(url)).id : await importPdf(url);
		if (!id) return;
		// Already open in a reader: show that tab, and close this one.
		const reader = await chrome.runtime.sendMessage<ExtensionMessage, chrome.tabs.Tab | undefined>({ type: 'find-reader', id }).catch(() => undefined);
		if (reader?.id !== undefined) {
			await chrome.tabs.update(reader.id, { active: true });
			await chrome.windows.update(reader.windowId, { focused: true });
			const self = await chrome.tabs.getCurrent();
			if (self?.id !== undefined) await chrome.tabs.remove(self.id);
			return;
		}
		await goto(`${resolve('/read')}?id=${encodeURIComponent(id)}`, { replace: true });
	} catch (e) {
		toast(e instanceof Error ? e.message : String(e), 'error');
	}
}

/** Any PDF on the web; the link is kept (`links.other`), so the same one opens its paper again. */
async function importPdf(url: string): Promise<string | undefined> {
	const existing = library.papers.find((p) => p.links?.other?.includes(url));
	if (existing) return existing.id;
	const res = await download(url);
	if (!res) return;
	const bytes = new Uint8Array(await res.arrayBuffer());
	if (!isPdf(bytes)) throw new Error('That isn’t a PDF');
	const name = decodeURIComponent(new URL(res.url).pathname.split('/').pop() ?? '').replace(/\.pdf$/i, '') || 'paper';
	const [id] = await library.import([new File([bytes], `${name}.pdf`, { type: 'application/pdf' })]);
	if (id) await library.update(id, (cur) => ({ links: { ...cur.links, other: [...(cur.links?.other ?? []), url] } }));
	return id;
}

/**
 * Sites that don't allow cross-origin downloads (CORS) need their host
 * permission, optional in the manifest: asked for the first time, in a click.
 */
async function download(url: string): Promise<Response | null> {
	const { origin, host } = new URL(url);
	const origins = [`${origin}/*`];
	try {
		return ok(await fetch(url));
	} catch (e) {
		if (!(e instanceof TypeError) || (await chrome.permissions.contains({ origins }))) throw e;
	}
	const allow = await prompts.confirm(`Download papers from ${host}?`, {
		message: `${host} doesn’t let other sites download its PDFs. Chrome will ask you to let Xivly read ${host}: it only downloads the PDFs you open in Xivly.`,
		confirmLabel: 'Continue'
	});
	// Still in the click on "Continue" (Chrome asks only in a user gesture).
	if (!allow || !(await chrome.permissions.request({ origins }))) return null;
	return ok(await fetch(url));
}

function ok(res: Response) {
	if (!res.ok) throw new Error(`${new URL(res.url).host}: HTTP ${res.status}`);
	return res;
}
