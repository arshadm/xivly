// App-level shortcuts (reading/annotation keys come from svelte-pdf-mini's
// keymap). One list for tooltips, menus, Settings › Shortcuts and the `?` sheet.
import { mac } from './os';

export const mod = mac ? '⌘' : 'Ctrl+';
const shift = mac ? '⇧' : 'Shift+';
const alt = mac ? '⌥' : 'Alt+';
const ctrl = mac ? '⌃' : 'Ctrl+';

export const keys = {
	settings: `${mod},`,
	/** macOS quits from the app menu (⌘Q); elsewhere there's no menu, so the app handles it. */
	quit: `${mod}Q`,
	search: `${mod}K`,
	addPapers: `${mod}O`,
	addArxiv: `${mod}${shift}O`,
	toggleTheme: `${mod}${shift}D`,
	library: `${mod}${shift}L`,
	help: '?',
	save: `${mod}S`,
	find: `${mod}F`,
	panel: `${mod}\\`,
	panelAlt: `${mod}B`,
	closeWindow: `${mod}W`,
	// Side panel views (as in Preview); pressing a view's shortcut again closes the panel.
	panelContents: `${alt}${mod}1`,
	panelPages: `${alt}${mod}2`,
	panelFigures: `${alt}${mod}3`,
	panelReferences: `${alt}${mod}4`,
	panelNotes: `${alt}${mod}5`,
	panelBookmarks: `${alt}${mod}6`,
	panelInfo: `${mod}I`,
	addBookmark: `${mod}D`,
	notesPane: `${mod}E`,
	goToBookmark: `${mod}J`,
	scrollContinuous: mac ? `${ctrl}${mod}1` : 'Ctrl+Shift+1',
	scrollPaged: mac ? `${ctrl}${mod}2` : 'Ctrl+Shift+2',
	scrollHorizontal: mac ? `${ctrl}${mod}3` : 'Ctrl+Shift+3',
	spread: `${alt}${mod}S`,
	minimap: `${alt}${mod}M`,
	annotations: `${alt}${mod}A`,
	sideNotes: `${alt}${mod}N`,
	lineMarkers: `${alt}${mod}L`
} as const;

export type Group = { title: string; items: { label: string; keys: string[] }[] };

export const shortcuts: Group[] = [
	{
		title: 'App',
		items: [
			{ label: 'Settings', keys: [keys.settings] },
			{ label: 'Quit', keys: [keys.quit] },
			{ label: 'Day / night', keys: [keys.toggleTheme] },
			{ label: 'Show the library', keys: [keys.library] },
			{ label: 'All shortcuts', keys: [keys.help] }
		]
	},
	{
		title: 'Library',
		items: [
			{ label: 'Search papers', keys: [keys.search] },
			{ label: 'Add PDF files', keys: [keys.addPapers] },
			{ label: 'Add papers (an arXiv link, or search Hugging Face)', keys: [keys.addArxiv] },
			{ label: 'Open the paper', keys: ['↵'] }
		]
	},
	{
		title: 'Paper',
		items: [
			{ label: 'Save annotations', keys: [keys.save] },
			{ label: 'Find in paper', keys: [keys.find] },
			{ label: 'Side panel', keys: [keys.panelAlt, keys.panel] },
			{ label: 'Contents', keys: [keys.panelContents] },
			{ label: 'Pages', keys: [keys.panelPages] },
			{ label: 'Figures, tables & equations', keys: [keys.panelFigures] },
			{ label: 'References', keys: [keys.panelReferences] },
			{ label: 'Notes', keys: [keys.panelNotes] },
			{ label: 'Bookmarks', keys: [keys.panelBookmarks] },
			{ label: 'Bookmark this spot', keys: [keys.addBookmark] },
			{ label: 'Go to bookmark', keys: [keys.goToBookmark] },
			{ label: 'Paper info', keys: [keys.panelInfo] },
			{ label: 'Notes pane', keys: [keys.notesPane] },
			{ label: 'Close', keys: [keys.closeWindow] }
		]
	},
	{
		title: 'Layout',
		items: [
			{ label: 'Continuous scrolling', keys: [keys.scrollContinuous] },
			{ label: 'Paged', keys: [keys.scrollPaged] },
			{ label: 'Horizontal', keys: [keys.scrollHorizontal] },
			{ label: 'Spread (two pages)', keys: [keys.spread] },
			{ label: 'Minimap', keys: [keys.minimap] },
			{ label: 'Show annotations', keys: [keys.annotations] },
			{ label: 'Side notes', keys: [keys.sideNotes] },
			{ label: 'Line markers', keys: [keys.lineMarkers] }
		]
	}
];

/** Does `e` match a combo label like "⌘⇧D", "⌥⌘2" or "Ctrl+Alt+2"? */
export function matches(e: KeyboardEvent, combo: string) {
	// Windows reports AltGr (typing @ # { [ on many layouts) as Ctrl+Alt: never a shortcut.
	if (!mac && e.getModifierState('AltGraph')) return false;
	const has = (glyph: string, word: string) => combo.includes(glyph) || combo.includes(word);
	// On macOS ⌃ is its own modifier; elsewhere "Ctrl+" is the mod key.
	const wantCtrl = mac && combo.includes('⌃');
	const wantMod = has('⌘', 'Ctrl+');
	const wantShift = has('⇧', 'Shift+');
	const wantAlt = has('⌥', 'Alt+');
	const key = combo.replace(/⌘|⇧|⌥|⌃|Ctrl\+|Shift\+|Alt\+/g, '');
	if (mac ? e.metaKey !== wantMod || e.ctrlKey !== wantCtrl : e.ctrlKey !== wantMod) return false;
	if (e.altKey !== wantAlt) return false;
	// Shift is part of '?' itself; only enforce it for letter / digit combos.
	if (/^[a-z0-9]$/i.test(key) && e.shiftKey !== wantShift) return false;
	// ⌥ changes e.key on macOS (⌥2 → ™): compare the physical key too.
	return e.key.toLowerCase() === key.toLowerCase() || e.code === `Key${key.toUpperCase()}` || e.code === `Digit${key}`;
}
