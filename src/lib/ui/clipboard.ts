// Clipboard that works in desktop webviews too: on desktop every copy goes
// to the native pasteboard (WKWebView gates navigator.clipboard.readText
// behind a paste prompt, and clipboard managers like Paste miss some of its
// writes). The PDF viewer's copies (⌘C, menus) are routed here as well.
import { setClipboard } from 'svelte-pdf-mini';
import { platform } from '#lib/platform/index.js';

const native = () => import('@tauri-apps/plugin-clipboard-manager');

export const clipboard = {
	async write(text: string) {
		if (platform.kind === 'desktop') return (await native()).writeText(text);
		return navigator.clipboard.writeText(text);
	},
	async read(): Promise<string> {
		if (platform.kind === 'desktop') return (await native()).readText();
		return navigator.clipboard.readText();
	}
};

if (platform.kind === 'desktop')
	setClipboard({
		text: clipboard.write,
		rich: async (text, html) => (await native()).writeHtml(html, text)
	});
