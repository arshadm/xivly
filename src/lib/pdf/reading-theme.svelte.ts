import { pageThemes, paperColors, type PageThemeStrategy } from 'svelte-pdf-mini';

export type PageFrame = 'shadow' | 'border' | 'rounded' | 'flat' | 'none';

/** Swatches for the paper colour picker: "white" plus the matte category palette. */
export const paperSwatches = [
	{ value: 'white', color: '#ffffff', label: 'White' },
	{ value: 'warm', color: '#efe4cf', label: 'Warm paper' },
	...paperColors.map((c) => ({ value: c.name, color: c.light, label: c.name[0].toUpperCase() + c.name.slice(1) }))
];

/** Resolve a swatch id or #hex to the colour used by `pageThemes.paper`. */
export function paperHex(value: string, dark: boolean): string {
	if (value.startsWith('#')) return value;
	if (value === 'white') return dark ? '#9ca3af' : '#ffffff';
	if (value === 'warm') return dark ? '#c9a66b' : '#efe4cf';
	const c = paperColors.find((p) => p.name === value);
	if (!c) return '#efe4cf';
	return dark ? c.accent : c.light;
}

/**
 * The reading theme used across the demo apps: `pageThemes.paper` (soft tint by day,
 * tinted vector recolor by night), a colour, a strength and a page frame.
 */
export class ReadingTheme {
	dark = $state(false);
	color = $state('warm');
	strength = $state(0.5);
	frame = $state<PageFrame>('shadow');

	constructor(init: Partial<Pick<ReadingTheme, 'dark' | 'color' | 'strength' | 'frame'>> = {}) {
		Object.assign(this, init);
	}

	readonly strategy: PageThemeStrategy = $derived(
		this.color === 'white' && !this.dark ? pageThemes.none() : pageThemes.paper({ color: paperHex(this.color, this.dark), dark: this.dark, strength: this.strength })
	);
	/** CSS colour of a page (for UI that should match it). */
	readonly swatch = $derived(this.strategy.background ?? '#ffffff');
}
