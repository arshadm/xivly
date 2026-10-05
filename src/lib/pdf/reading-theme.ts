import { paperColors } from 'svelte-pdf-mini';

/** Swatches for the paper color picker: "white" plus the matte category palette. */
export const paperSwatches = [
	{ value: 'white', color: '#ffffff', label: 'White' },
	{ value: 'warm', color: '#efe4cf', label: 'Warm paper' },
	...paperColors.map((c) => ({ value: c.name, color: c.light, label: c.name[0].toUpperCase() + c.name.slice(1) }))
];

/** Resolve a swatch id or #hex to the color used by `pageThemes.paper`. */
export function paperHex(value: string, dark: boolean): string {
	if (value.startsWith('#')) return value;
	if (value === 'white') return dark ? '#9ca3af' : '#ffffff';
	if (value === 'warm') return dark ? '#c9a66b' : '#efe4cf';
	const c = paperColors.find((p) => p.name === value);
	if (!c) return '#efe4cf';
	return dark ? c.accent : c.light;
}

