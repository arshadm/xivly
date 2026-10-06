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

/** Service worker → pages: "is a library tab open?" (answered with its tab). */
export type ExtensionMessage = { type: 'find-library' };
