// Saved prompts for the chat (`.xivly/prompts.json`, library-wide so they sync):
// a name and a text with placeholders filled from the paper and the reader.
import type { LibraryFs } from '#lib/platform/index.js';

export interface SavedPrompt {
	id: string;
	name: string;
	text: string;
}

const PROMPTS_PATH = '.xivly/prompts.json';

/** Until the library has its own (written the first time they're edited). */
export const DEFAULT_PROMPTS: SavedPrompt[] = [
	{ id: 'summary', name: 'Summarise', text: 'Summarise this paper in a few bullet points.' },
	{ id: 'contributions', name: 'Contributions', text: 'What are the main contributions, and how are they evaluated?' },
	{ id: 'method', name: 'Method, step by step', text: 'Explain the method step by step.' },
	{ id: 'limitations', name: 'Limitations', text: 'What are the limitations, and what would you try next?' },
	{ id: 'selection', name: 'Explain the selection', text: 'Explain this passage in plain terms, and how it fits the rest of the paper:\n\n{{selection}}' },
	{ id: 'notes', name: 'Check my notes', text: 'Here are my notes on this paper. Is anything wrong or missing?\n\n{{notes}}' },
	{
		id: 'mindmap',
		name: 'Mind map of the paper',
		text: 'Make a mind map of this paper as one nested Markdown list: the main idea first, then its main parts (problem, method, results, limitations…), each with a few short points of a few words. Cite pages as [p. N]. Reply with only the list.'
	}
];

/** The placeholders a prompt can use. */
export const PLACEHOLDERS = ['title', 'authors', 'year', 'abstract', 'selection', 'notes'] as const;
export type PromptContext = Partial<Record<(typeof PLACEHOLDERS)[number], string>>;

/** `{{title}}` and the like, filled; a placeholder without a value becomes empty; unknown ones stay. */
export function fillPrompt(text: string, ctx: PromptContext): string {
	return text
		.replace(/\{\{\s*(\w+)\s*\}\}/g, (all, name: string) => ((PLACEHOLDERS as readonly string[]).includes(name) ? (ctx[name as keyof PromptContext] ?? '').trim() : all))
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/** Does the prompt need what's selected in the paper? */
export const needsSelection = (text: string) => /\{\{\s*selection\s*\}\}/.test(text);

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** prompts.json's prompts (broken entries left out), or null when it isn't a prompts file. */
export function normalizePrompts(raw: unknown): SavedPrompt[] | null {
	if (!isObject(raw) || !Array.isArray(raw.prompts)) return null;
	return raw.prompts
		.filter(isObject)
		.filter((p) => typeof p.name === 'string' && p.name.trim() && typeof p.text === 'string')
		.map((p, i) => ({ id: typeof p.id === 'string' && p.id ? p.id : `p${i}`, name: (p.name as string).trim(), text: p.text as string }));
}

/** The library's prompts (the defaults while it has none, or when the file is unreadable). */
export async function readPrompts(fs: LibraryFs): Promise<SavedPrompt[]> {
	const bytes = await fs.read(PROMPTS_PATH).catch(() => null);
	if (!bytes) return DEFAULT_PROMPTS;
	try {
		return normalizePrompts(JSON.parse(new TextDecoder().decode(bytes))) ?? DEFAULT_PROMPTS;
	} catch {
		return DEFAULT_PROMPTS;
	}
}

export function writePrompts(fs: LibraryFs, prompts: SavedPrompt[]) {
	return navigator.locks.request(`xivly:${PROMPTS_PATH}`, () => fs.write(PROMPTS_PATH, new TextEncoder().encode(JSON.stringify({ version: 1, prompts }, null, 2) + '\n')));
}
