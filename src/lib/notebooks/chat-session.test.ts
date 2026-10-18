import { describe, expect, it, vi } from 'vitest';
import { MemoryFs } from '#lib/onboarding/memory-fs.js';
import type { ClaudeCli, ClaudeRequest } from '#lib/platform/index.js';
import { normalizePaper } from '#lib/repo.js';
import { NotebookChatSession, NotebookChatStore } from './chat-session.svelte';

const enc = new TextEncoder();
const attention = normalizePaper('2017-attention', { title: 'Attention Is All You Need', authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar'], year: 2017 });
const resnet = normalizePaper('2015-resnet', { title: 'Deep Residual Learning', authors: ['Kaiming He'], year: 2015 });
const papers = new Map([attention, resnet].map((p) => [p.id, p]));

const delta = (text: string) => ({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } });
const start = (n: number) => ({ type: 'stream_event', event: { type: 'message_start', message: { usage: { input_tokens: n } } } });
const exit = (code: number | null = 0) => ({ type: 'xivly_exit', code, stderr: '' });
/** Claude answering `text` in the run's session. */
const answer = (text: string, tokens = 1000) => (r: ClaudeRequest) => [{ type: 'system', subtype: 'init', session_id: r.sessionId }, start(tokens), delta(text), { type: 'result', is_error: false, result: text, session_id: r.sessionId }, exit()];

async function setup(script: (r: ClaudeRequest) => unknown[]) {
	const fs = new MemoryFs();
	await fs.write('notebooks/idea/notebook.json', enc.encode('{"kind":"notebook","title":"Sparse attention"}'));
	const requests: ClaudeRequest[] = [];
	const cli: ClaudeCli = {
		locate: async () => ({ path: '/bin/claude', version: '1' }),
		async run(r, onEvent) {
			requests.push(r);
			queueMicrotask(() => script(r).forEach(onEvent));
		},
		cancel: vi.fn(async () => {})
	};
	const store = new NotebookChatStore(fs);
	let text = '# Idea\n\nKeep the top-k keys.';
	const deps = {
		claude: cli,
		store,
		locate: async () => '/bin/claude',
		model: () => 'sonnet',
		notebook: () => ({ title: 'Sparse attention', text }),
		paper: (id: string) => papers.get(id) ?? null,
		notes: async (id: string) => (id === resnet.id ? '### Notes\n\nSkip connections.' : '')
	};
	const session = new NotebookChatSession('idea', deps);
	return { session, store, requests, setText: (t: string) => (text = t), deps };
}

describe('NotebookChatSession', () => {
	it('sends the notebook text first, then only when it changed', async () => {
		const { session, requests, setText } = await setup(answer('Fine.'));
		await session.send('Is it new?');
		expect(requests[0]).toMatchObject({ notebookId: 'idea', resume: false, tools: ['Read'], addDirs: [] });
		expect(requests[0].paperId).toBeUndefined();
		expect(requests[0].system).toContain('"Sparse attention"');
		expect(requests[0].prompt).toContain('Keep the top-k keys.');
		await session.send('And?');
		expect(requests[1]).toMatchObject({ resume: true, prompt: 'And?' });
		setText('# Idea\n\nKeep the top-k keys, per head.');
		await session.send('Now?');
		expect(requests[2].prompt).toContain('per head');
		expect(session.chat.tokens).toBe(1000);
	});

	it('adds the papers mentioned with @: a PDF’s folder, notes in the message; each once', async () => {
		const { session, requests, store } = await setup(answer('Noted.'));
		await session.send('Compare them', [
			{ paperId: attention.id, kind: 'pdf' },
			{ paperId: resnet.id, kind: 'notes' },
			{ paperId: 'gone', kind: 'pdf' }
		]);
		expect(requests[0].addDirs).toEqual(['papers/2017-attention']);
		expect(requests[0].prompt).toContain('../../papers/2017-attention/paper.pdf');
		expect(requests[0].prompt).toContain('Skip connections.');
		expect(session.chat.context).toEqual([
			{ paperId: attention.id, kind: 'pdf' },
			{ paperId: resnet.id, kind: 'notes' }
		]);
		await session.send('Again', [{ paperId: attention.id, kind: 'pdf' }]);
		expect(requests[1].prompt).toBe('Again');
		expect(requests[1].addDirs).toEqual(['papers/2017-attention']);
		expect((await store.current('idea'))?.context).toHaveLength(2);
	});

	it('keeps nothing new when Claude never saw the question', async () => {
		const { session } = await setup(() => [exit(1)]);
		expect(await session.send('Hello?', [{ paperId: attention.id, kind: 'pdf' }])).toBe(false);
		expect(session.chat.context).toEqual([]);
		expect(session.chat.sentText).toBeUndefined();
		expect(session.chat.messages.at(-1)?.error).toBeTruthy();
	});

	it('clears: the conversation archived, a new one with nothing in it', async () => {
		const { session, store, requests } = await setup(answer('Yes.'));
		await session.send('First', [{ paperId: attention.id, kind: 'pdf' }]);
		const first = session.chat;
		await session.clear();
		expect(session.chat.messages).toEqual([]);
		expect(session.chat.context).toEqual([]);
		expect(session.chat.sessionId).not.toBe(first.sessionId);
		expect((await store.archived('idea')).map((c) => c.id)).toEqual([first.id]);
		await session.send('Fresh start');
		expect(requests[1]).toMatchObject({ resume: false, addDirs: [] });
		expect(requests[1].prompt).toContain('Keep the top-k keys.');
	});

	it('summarizes: a new, smaller conversation that starts from the summary', async () => {
		const { session, store, requests } = await setup((r) => answer(r.prompt.includes('Summarize our conversation') ? 'We chose top-k [Vaswani et al. 2017, p. 4].' : 'Answer.', 50_000)(r));
		await session.send('Explain', [{ paperId: attention.id, kind: 'pdf' }]);
		const old = session.chat;
		await session.summarize();
		expect(requests[1]).toMatchObject({ resume: true, sessionId: old.sessionId });
		expect(session.chat).toMatchObject({ summary: 'We chose top-k [Vaswani et al. 2017, p. 4].', messages: [], started: false, context: [{ paperId: attention.id, kind: 'pdf', summarized: true }] });
		expect(session.chat.sessionId).not.toBe(old.sessionId);
		const archived = (await store.archived('idea'))[0];
		expect(archived.messages.at(-1)?.text).toContain('We chose top-k');

		// The new session hears the summary and the notebook text; mentioning the paper again adds it in full.
		await session.send('Go on', [{ paperId: attention.id, kind: 'pdf' }]);
		expect(requests[2]).toMatchObject({ resume: false, addDirs: ['papers/2017-attention'] });
		expect(requests[2].prompt).toContain('## Summary of our conversation so far');
		expect(requests[2].prompt).toContain('Keep the top-k keys.');
		expect(requests[2].prompt).toContain('## Paper added: “Attention Is All You Need”');
		expect(session.chat.context).toEqual([{ paperId: attention.id, kind: 'pdf' }]);
		await session.send('More');
		expect(requests[3].prompt).toBe('More');
	});

	it('keeps the conversation when the summary fails', async () => {
		const { session } = await setup((r) => (r.prompt.includes('Summarize our conversation') ? [exit(1)] : answer('Answer.')(r)));
		await session.send('Explain');
		const before = session.chat;
		await expect(session.summarize()).rejects.toThrow();
		expect(session.chat).toBe(before);
		expect(session.running).toBe(false);
	});
});
