// Shared by the extension's service worker and its pages.

/** Where "Open in Xivly" shows up: arXiv (and its mirrors parseArxiv knows) and PDF links. */
export const PAPER_URLS = [
	'*://*.arxiv.org/abs/*',
	'*://*.arxiv.org/pdf/*',
	'*://*.arxiv.org/html/*',
	'*://*.alphaxiv.org/abs/*',
	'*://*.alphaxiv.org/overview/*',
	'*://huggingface.co/papers/*',
	'*://*/*.pdf',
	'*://*/*.pdf?*',
	'*://*/*.pdf#*'
];

/**
 * Between the extension's pages and its service worker: "is a library tab
 * open?", "is this paper open in a reader?" (answered with that tab).
 */
export type ExtensionMessage = { type: 'find-library' } | { type: 'find-reader'; id: string };
