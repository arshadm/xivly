import { describe, expect, it } from 'vitest';
import { MemoryFs } from '#lib/onboarding/memory-fs.js';
import { DEFAULT_PROMPTS, fillPrompt, needsSelection, normalizePrompts, readPrompts, writePrompts } from './prompts';

describe('saved prompts', () => {
	it('placeholders filled; missing values empty; unknown ones kept', () => {
		expect(fillPrompt('About {{ title }} ({{year}}): {{selection}}', { title: 'Fusion', year: '2026', selection: '  some text ' })).toBe('About Fusion (2026): some text');
		expect(fillPrompt('Explain:\n\n{{selection}}\n\n\nThanks {{name}}', {})).toBe('Explain:\n\nThanks {{name}}');
	});

	it('knows which need a selection', () => {
		expect(needsSelection('Explain {{ selection }}')).toBe(true);
		expect(needsSelection('Summarise')).toBe(false);
	});

	it('the defaults until the library has its own; hand edits normalized', async () => {
		const fs = new MemoryFs();
		expect(await readPrompts(fs)).toEqual(DEFAULT_PROMPTS);
		await writePrompts(fs, [{ id: 'a', name: 'Mine', text: 'Hi {{title}}' }]);
		expect(await readPrompts(fs)).toEqual([{ id: 'a', name: 'Mine', text: 'Hi {{title}}' }]);
		expect(normalizePrompts({ prompts: [{ name: ' X ', text: 't' }, { name: '', text: 't' }, { text: 't' }, 4] })).toEqual([{ id: 'p0', name: 'X', text: 't' }]);
		await fs.write('.xivly/prompts.json', new TextEncoder().encode('{ broken'));
		expect(await readPrompts(fs)).toEqual(DEFAULT_PROMPTS);
	});
});
