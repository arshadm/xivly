/// <reference types="chrome" />
// Chrome extension service worker (bundled on its own by scripts/build-extension.ts).
//
// The app itself is index.html, the web build in an extension page: this only
// opens it. The toolbar button shows the library (an open one is focused), and
// "Open in Xivly" (a paper's page or link) opens a new tab that adds the paper,
// then shows it in the reader (see ./app.svelte.ts).
import { PAPER_URLS, focusLibraryTab } from './messages';

const app = (hash = '') => chrome.runtime.getURL(`index.html${hash}`);

chrome.runtime.onInstalled.addListener(() => {
	chrome.contextMenus.removeAll(() => {
		chrome.contextMenus.create({ id: 'link', title: 'Open in Xivly', contexts: ['link'], targetUrlPatterns: PAPER_URLS });
		chrome.contextMenus.create({ id: 'page', title: 'Open in Xivly', contexts: ['page'], documentUrlPatterns: PAPER_URLS });
		// Chrome's PDF viewer may not show the page menu: the toolbar button's menu
		// works on any tab (its click grants activeTab, which reveals the tab's URL).
		chrome.contextMenus.create({ id: 'tab', title: 'Open this tab in Xivly', contexts: ['action'] });
	});
});

// bun run dev:extension: a reload closes the extension's tabs; reopen them.
if (__XIVLY_EXTENSION_DEV__)
	void chrome.storage.local.get('reopen').then(({ reopen }) => {
		for (const url of (reopen as string[] | undefined) ?? []) void chrome.tabs.create({ url });
		void chrome.storage.local.remove('reopen');
	});

chrome.action.onClicked.addListener(() => void showLibrary());

chrome.contextMenus.onClicked.addListener((info, tab) => {
	const url = info.menuItemId === 'link' ? info.linkUrl : info.menuItemId === 'page' ? (info.frameUrl ?? info.pageUrl) : tab?.url;
	if (!url) return;
	void chrome.tabs.create({
		url: app(`#/?add=${encodeURIComponent(url)}`),
		index: tab ? tab.index + 1 : undefined,
		openerTabId: tab?.id
	});
});

/** Focus a library tab (the app answers from its library route), or open one. */
async function showLibrary() {
	if (!(await focusLibraryTab())) await chrome.tabs.create({ url: app() });
}
