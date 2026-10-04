// Clipboard text that works in desktop webviews too (WKWebView gates
// navigator.clipboard.readText behind a paste prompt).
import { platform } from '$lib/platform';

export const clipboard = {
	async write(text: string) {
		if (platform.kind === 'desktop') return (await import('@tauri-apps/plugin-clipboard-manager')).writeText(text);
		return navigator.clipboard.writeText(text);
	},
	async read(): Promise<string> {
		if (platform.kind === 'desktop') return (await import('@tauri-apps/plugin-clipboard-manager')).readText();
		return navigator.clipboard.readText();
	}
};
