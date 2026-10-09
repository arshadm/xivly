import { describe, expect, it } from 'vitest';
import { MemoryFs } from '#lib/onboarding/memory-fs.js';
import { ChatStore, chatTitle, newChat, normalizeChat } from './store';

const enc = new TextEncoder();

describe('chats', () => {
	it('a new chat: an id from the time, a fresh session, not started', () => {
		const c = newChat('sonnet', new Date('2026-10-09T14:03:05.123Z'));
		expect(c).toMatchObject({ id: '2026-10-09T14-03-05-123Z', model: 'sonnet', started: false, messages: [] });
		expect(c.sessionId).toMatch(/^[0-9a-f-]{36}$/);
	});

	it('titles: the first question on one line, shortened', () => {
		expect(chatTitle('  What is\nthe main idea? ')).toBe('What is the main idea?');
		expect(chatTitle('x'.repeat(100))).toHaveLength(58);
	});

	it('hand-edited files: broken messages left out, a title from the first question', () => {
		const c = normalizeChat('a', { sessionId: 's', messages: [{ role: 'user', text: 'Why?' }, { role: 'system', text: 'x' }, { role: 'assistant' }, null] });
		expect(c?.messages).toEqual([{ role: 'user', text: 'Why?', at: '', tools: undefined, error: undefined, cost: undefined }]);
		expect(c?.title).toBe('Why?');
		expect(normalizeChat('a', { messages: [] })).toBeNull();
	});

	it('saved per paper, listed newest first; never into a removed paper', async () => {
		const fs = new MemoryFs();
		await fs.mkdir('papers/p1');
		const store = new ChatStore(fs);
		const a = { ...newChat('sonnet', new Date('2026-10-01T00:00:00Z')), title: 'Old', updated: '2026-10-01T00:00:00Z' };
		const b = { ...newChat('sonnet', new Date('2026-10-02T00:00:00Z')), title: 'New', updated: '2026-10-02T00:00:00Z' };
		await store.save('p1', a);
		await store.save('p1', b);
		await fs.write('papers/p1/chats/broken.json', enc.encode('{ nope'));
		expect((await store.list('p1')).map((c) => c.title)).toEqual(['New', 'Old']);
		expect((await store.read('p1', a.id))?.sessionId).toBe(a.sessionId);
		expect(await store.list('p2')).toEqual([]);
		await expect(store.save('p2', a)).rejects.toThrow(/no longer in the library/);
		await store.remove('p1', a.id);
		expect((await store.list('p1')).map((c) => c.title)).toEqual(['New']);
	});
});
