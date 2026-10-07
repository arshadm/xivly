// The library's pure helpers (colors, metadata choices, a concurrency limit), testable on their own.
import { paperColors, type PaperColor } from 'svelte-pdf-mini/core';
import type { CategoryColor, Paper, PaperLinks } from './types';

const stone = paperColors.find((c) => c.name === 'stone')!;

/** Mix two `#rrggbb` colors (t = share of `b`). */
export function mix(a: string, b: string, t: number) {
	const ch = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
	return '#' + [0, 1, 2].map((i) => Math.round(ch(a, i) * (1 - t) + ch(b, i) * t).toString(16).padStart(2, '0')).join('');
}

/** A category's palette entry; a custom `#rrggbb` gets matte shades made like the palette's. */
export function categoryColor(color: CategoryColor | undefined): PaperColor {
	if (color && /^#[0-9a-f]{6}$/i.test(color)) return { name: color, accent: color, light: mix(color, '#ffffff', 0.84), dark: mix(color, '#151413', 0.86) };
	return paperColors.find((c) => c.name === color) ?? stone;
}

/** `fn` over `items`, at most `limit` at a time; results in order. */
export async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const i = next++;
			out[i] = await fn(items[i]);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return out;
}

/** The same URL, give or take case and a trailing slash. */
const sameUrl = (a: string, b: string) => a.replace(/\/+$/, '').toLowerCase() === b.replace(/\/+$/, '').toLowerCase();

/**
 * `found` links added to a paper's links (as on disk), never replacing them:
 * the project page only when there is none, new URLs first in each list. The
 * extension, the user or an agent may have added links the lookup doesn't know.
 * `current` itself (same object) when nothing is new.
 */
export function mergeLinks(current: PaperLinks | undefined, found: PaperLinks | undefined): PaperLinks | undefined {
	let out = current;
	for (const [key, value] of Object.entries(found ?? {}) as [keyof PaperLinks, PaperLinks[keyof PaperLinks]][]) {
		if (key === 'project') {
			if (typeof value === 'string' && value && !out?.project) out = { ...out, project: value };
			continue;
		}
		const list = (out?.[key] ?? []) as string[];
		const fresh = (Array.isArray(value) ? value : []).filter((u, i, all) => typeof u === 'string' && u && !list.some((x) => sameUrl(x, u)) && all.findIndex((x) => sameUrl(x, u)) === i);
		if (fresh.length) out = { ...out, [key]: [...fresh, ...list] };
	}
	return out;
}

/**
 * Whether a Hugging Face lookup brings nothing new: no better title or authors,
 * the same links and the same `hf` data (only the lookup date changes).
 */
export function hfUnchanged(p: Pick<Paper, 'links'>, patch: { links: Paper['links']; title?: string; authors?: string[] }, hf: object, before: object) {
	return patch.title === undefined && patch.authors === undefined && JSON.stringify(patch.links ?? {}) === JSON.stringify(p.links ?? {}) && JSON.stringify(hf) === JSON.stringify(before);
}

/**
 * arXiv's title (via Hugging Face) when the one read from the PDF is worse:
 * the same words in the wrong case ("Bdh-Cq" for "BDH-CQ"), or not a title at
 * all ("working", a file name). Otherwise undefined: keep the user's title.
 */
export function betterTitle(current: string, official?: string) {
	if (!official || official === current) return undefined;
	// Same letters once case, spaces and punctuation are ignored ("Lan- guage" = "Language").
	const letters = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
	if (letters(official) === letters(current)) return official;
	if (current.length < 12 || !current.includes(' ')) return official;
	return undefined;
}

/** arXiv's author list when the one read from the PDF is missing or garbled (names in capitals, fragments). */
export function betterAuthors(current: string[] | undefined, official?: string[]) {
	if (!official?.length) return undefined;
	const garbled = !current?.length || current.some((a) => !/\p{Ll}/u.test(a));
	return garbled ? official : undefined;
}

const MINOR = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'over', 'the', 'to', 'via', 'vs', 'with']);

/**
 * Titles set in capitals ("MULTIMODAL FLOW: UNIFIED…") become title case
 * ("Multimodal Flow: Unified…"); anything else is left as typed.
 */
export function tidyTitle(title: string) {
	const letters = title.replace(/[^\p{L}]/gu, '');
	if (letters.length < 8 || letters !== letters.toUpperCase()) return title;
	let first = true;
	return title.toLowerCase().replace(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu, (w) => {
		const keep = !first && MINOR.has(w);
		first = false;
		return keep ? w : w[0].toUpperCase() + w.slice(1);
	}).replace(/([:?!.]\s+)(\p{Ll})/gu, (_, p, c) => p + c.toUpperCase());
}
