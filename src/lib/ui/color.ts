/** Small colour helpers for the ColorPicker recipe (hex ⇄ HSV). */
export type Hsv = { h: number; s: number; v: number };

export function hexToHsv(hex: string): Hsv {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) return { h: 0, s: 0, v: 1 };
	const n = parseInt(m[1], 16);
	const r = ((n >> 16) & 255) / 255;
	const g = ((n >> 8) & 255) / 255;
	const b = (n & 255) / 255;
	const mx = Math.max(r, g, b);
	const d = mx - Math.min(r, g, b);
	return { h: hue(r, g, b, mx, d), s: mx ? d / mx : 0, v: mx };
}

/** Hue in degrees from RGB in [0, 1], their max and range (0 for greys). */
function hue(r: number, g: number, b: number, max: number, range: number): number {
	if (!range) return 0;
	let sector: number;
	if (max === r) sector = ((g - b) / range) % 6;
	else if (max === g) sector = (b - r) / range + 2;
	else sector = (r - g) / range + 4;
	return (sector * 60 + 360) % 360;
}

export function hsvToHex({ h, s, v }: Hsv): string {
	const f = (n: number) => {
		const k = (n + h / 60) % 6;
		return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
	};
	const c = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
	return `#${c(f(5))}${c(f(3))}${c(f(1))}`;
}

export const isHex = (s: string) => /^#[0-9a-f]{6}$/i.test(s.trim());

/** Readable text colour on top of a background. */
export function contrastText(hex: string) {
	const { v, s } = hexToHsv(hex);
	return v > 0.62 && s < 0.7 ? '#1c1917' : '#fafaf9';
}
