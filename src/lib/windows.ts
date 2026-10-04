// Windows (desktop) and tabs (web): the library stays open, each paper gets
// its own reader window.
import { resolve } from '$app/paths';
import { platform } from './platform';

const readerPath = (id: string) => `${resolve('/read')}?id=${encodeURIComponent(id)}`;
/** Window labels allow `a-zA-Z0-9-/:_`; paper ids are slugs. */
const labelFor = (id: string) => `paper-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

/** Open a paper in its own window / tab, or focus it if already open. */
export async function openPaper(id: string, title = 'Xivly') {
	if (platform.kind !== 'desktop') {
		// A named target reuses the paper's tab when it's already open.
		window.open(readerPath(id), `xivly-${id}`)?.focus();
		return;
	}
	const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
	const { LogicalPosition } = await import('@tauri-apps/api/dpi');
	const label = labelFor(id);
	const existing = await WebviewWindow.getByLabel(label);
	if (existing) {
		await existing.unminimize();
		await existing.setFocus();
		return;
	}
	new WebviewWindow(label, {
		url: readerPath(id),
		title,
		width: 1180,
		height: 900,
		minWidth: 640,
		minHeight: 480,
		titleBarStyle: 'overlay',
		hiddenTitle: true,
		trafficLightPosition: new LogicalPosition(16, 20),
		dragDropEnabled: false
	});
}

/** Bring the library back (desktop: re-create its window if it was closed). */
export async function showLibrary() {
	if (platform.kind !== 'desktop') {
		window.open(resolve('/'), 'xivly-library')?.focus();
		return;
	}
	const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
	const { LogicalPosition } = await import('@tauri-apps/api/dpi');
	const main = await WebviewWindow.getByLabel('main');
	if (main) return main.setFocus();
	new WebviewWindow('main', {
		url: resolve('/'),
		title: 'Xivly',
		width: 1280,
		height: 840,
		titleBarStyle: 'overlay',
		hiddenTitle: true,
		trafficLightPosition: new LogicalPosition(16, 20),
		dragDropEnabled: false
	});
}

/** Close this window (desktop) or tab (web; only works for tabs we opened). */
export async function closeWindow() {
	if (platform.kind !== 'desktop') return window.close();
	const { getCurrentWindow } = await import('@tauri-apps/api/window');
	await getCurrentWindow().close();
}

export async function setWindowTitle(title: string) {
	document.title = title;
	if (platform.kind !== 'desktop') return;
	const { getCurrentWindow } = await import('@tauri-apps/api/window');
	await getCurrentWindow().setTitle(title);
}

/** Native Save / Don't Save / Cancel. */
export async function askUnsaved(title: string): Promise<'save' | 'discard' | 'cancel'> {
	if (platform.kind !== 'desktop') return confirm(`Save annotations in “${title}” before closing?`) ? 'save' : 'discard';
	const { message } = await import('@tauri-apps/plugin-dialog');
	const r = await message(`Your annotations in “${title}” haven’t been saved yet.`, {
		title: 'Save changes?',
		kind: 'warning',
		buttons: { yes: 'Save', no: 'Don’t Save', cancel: 'Cancel' }
	});
	return r === 'Yes' || r === 'Save' ? 'save' : r === 'No' || r === 'Don’t Save' ? 'discard' : 'cancel';
}

/** Save a file the user names (desktop: native dialog; web: download). */
export async function saveFile(file: Blob, name: string) {
	if (platform.kind !== 'desktop') {
		const url = URL.createObjectURL(file);
		Object.assign(document.createElement('a'), { href: url, download: name }).click();
		setTimeout(() => URL.revokeObjectURL(url), 5000);
		return;
	}
	const { save } = await import('@tauri-apps/plugin-dialog');
	const { writeFile } = await import('@tauri-apps/plugin-fs');
	const ext = name.split('.').pop() ?? '';
	const path = await save({ defaultPath: name, filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : [] });
	// The dialog grants fs access to exactly the chosen path.
	if (path) await writeFile(path, new Uint8Array(await file.arrayBuffer()));
}
