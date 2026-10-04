// App-level shortcuts (reading/annotation keys come from svelte-pdf-mini's
// keymap). One list for tooltips, menus, Settings › Shortcuts and the `?` sheet.
export const mod = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+';
const mac = mod === '⌘';
const shift = mac ? '⇧' : 'Shift+';
const alt = mac ? '⌥' : 'Alt+';

export const keys = {
	settings: `${mod},`,
	search: `${mod}K`,
	addPapers: `${mod}O`,
	toggleTheme: `${mod}${shift}D`,
	library: `${mod}${shift}L`,
	help: '?',
	save: `${mod}S`,
	find: `${mod}F`,
	panel: `${mod}\\`,
	panelAlt: `${mod}B`,
	closeWindow: `${mod}W`,
	scrollContinuous: `${alt}${mod}1`,
	scrollPaged: `${alt}${mod}2`,
	scrollHorizontal: `${alt}${mod}3`,
	spread: `${alt}${mod}S`,
	minimap: `${alt}${mod}M`
} as const;

export type Group = { title: string; items: { label: string; keys: string[] }[] };

export const shortcuts: Group[] = [
	{
		title: 'App',
		items: [
			{ label: 'Settings', keys: [keys.settings] },
			{ label: 'Day / night', keys: [keys.toggleTheme] },
			{ label: 'Show the library', keys: [keys.library] },
			{ label: 'All shortcuts', keys: [keys.help] }
		]
	},
	{
		title: 'Library',
		items: [
			{ label: 'Search papers', keys: [keys.search] },
			{ label: 'Add papers', keys: [keys.addPapers] },
			{ label: 'Open the paper', keys: ['↵'] }
		]
	},
	{
		title: 'Paper',
		items: [
			{ label: 'Save annotations', keys: [keys.save] },
			{ label: 'Find in paper', keys: [keys.find] },
			{ label: 'Side panel', keys: [keys.panelAlt, keys.panel] },
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
			{ label: 'Minimap', keys: [keys.minimap] }
		]
	}
];

/** Does `e` match a combo label like "⌘⇧D", "⌥⌘2" or "Ctrl+Alt+2"? */
export function matches(e: KeyboardEvent, combo: string) {
	const has = (glyph: string, word: string) => combo.includes(glyph) || combo.includes(word);
	const wantMod = has('⌘', 'Ctrl+');
	const wantShift = has('⇧', 'Shift+');
	const wantAlt = has('⌥', 'Alt+');
	const key = combo.replace(/⌘|⇧|⌥|Ctrl\+|Shift\+|Alt\+/g, '');
	if ((e.metaKey || e.ctrlKey) !== wantMod || e.altKey !== wantAlt) return false;
	// Shift is part of '?' itself; only enforce it for letter / digit combos.
	if (/^[a-z0-9]$/i.test(key) && e.shiftKey !== wantShift) return false;
	// ⌥ changes e.key on macOS (⌥2 → ™): compare the physical key too.
	return e.key.toLowerCase() === key.toLowerCase() || e.code === `Key${key.toUpperCase()}` || e.code === `Digit${key}`;
}
