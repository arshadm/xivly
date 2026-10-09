import { describe, expect, it, vi } from 'vitest';
import { MemoryFs } from '#lib/onboarding/memory-fs.js';
import type { ClaudeCli, ClaudeRequest } from '#lib/platform/index.js';
import { ChatSession, linkPages, systemPrompt } from './session.svelte';
import { ChatStore } from './store';

/** A stand-in claude: replays events for each run, records the requests. */
function fakeClaude(script: (r: ClaudeRequest) => unknown[]) {
	const requests: ClaudeRequest[] = [];
	const cli: ClaudeCli = {
		locate: async () => ({ path: '/bin/claude', version: '1' }),
		async run(r, onEvent) {
			requests.push(r);
			queueMicrotask(() => script(r).forEach(onEvent));
		},
		cancel: vi.fn(async () => {})
	};
	return { cli, requests };
}
const delta = (text: string) => ({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } });
const exit = (code: number | null = 0) => ({ type: 'xivly_exit', code, stderr: '' });

async function setup(script: (r: ClaudeRequest) => unknown[], locate = async () => '/bin/claude') {
	const fs = new MemoryFs();
	await fs.mkdir('papers/p1');
	const store = new ChatStore(fs);
	const { cli, requests } = fakeClaude(script);
	const session = new ChatSession('p1', 'Fusing kernels', { claude: cli, store, locate, model: () => 'sonnet' });
	return { session, store, requests, cli };
}

describe('ChatSession', () => {
	it('asks, streams the answer, saves; the next question continues the session', async () => {
		const { session, store, requests } = await setup((r) => [{ type: 'system', subtype: 'init', session_id: r.sessionId }, delta('It fuses '), delta('kernels [p. 3].'), { type: 'result', is_error: false, result: 'It fuses kernels [p. 3].', session_id: r.sessionId, total_cost_usd: 0.01 }, exit()]);
		await session.send('  What does it do? ');
		expect(requests[0]).toMatchObject({ paperId: 'p1', prompt: 'What does it do?', resume: false, model: 'sonnet', tools: ['Read'] });
		expect(requests[0].system).toContain('"Fusing kernels"');
		expect(session.chat.messages.map((m) => [m.role, m.text])).toEqual([
			['user', 'What does it do?'],
			['assistant', 'It fuses kernels [p. 3].']
		]);
		expect(session.chat).toMatchObject({ started: true, title: 'What does it do?' });
		expect(session.running).toBe(false);
		expect((await store.list('p1'))[0].messages).toHaveLength(2);

		await session.send('And why?');
		expect(requests[1]).toMatchObject({ resume: true, sessionId: requests[0].sessionId });
		expect(session.chat.messages).toHaveLength(4);
	});

	it('a crash is an answer with an error (no session yet: the next question starts afresh)', async () => {
		const { session, requests } = await setup(() => [{ type: 'xivly_exit', code: 1, stderr: 'Error: not logged in' }]);
		await session.send('Hello?');
		expect(session.chat.messages[1]).toMatchObject({ role: 'assistant', text: '', error: 'Error: not logged in' });
		await session.send('Again?');
		expect(requests[1].resume).toBe(false);
	});

	it('no claude: says so', async () => {
		const { session } = await setup(() => [], async () => {
			throw new Error('Claude Code (the claude command) wasn’t found');
		});
		await session.send('Hello?');
		expect(session.chat.messages[1].error).toContain('wasn’t found');
		expect(session.running).toBe(false);
	});

	it('stop cancels the run', async () => {
		let release!: () => void;
		const { session, cli } = await setup(() => []);
		cli.run = async (_r, onEvent) => {
			onEvent(delta('Partial'));
			release = () => onEvent(exit(null));
		};
		const sending = session.send('Long question');
		await vi.waitFor(() => expect(session.answer?.text).toBe('Partial'));
		session.stop();
		expect(cli.cancel).toHaveBeenCalled();
		release();
		await sending;
		expect(session.chat.messages[1]).toMatchObject({ text: 'Partial', error: 'Stopped' });
	});
});

describe('chat helpers', () => {
	it('page citations become links to the page', () => {
		expect(linkPages('See [p. 4] and [pp. 6–7], not [ref 2].')).toBe('See [p. 4](#xivly-page-4) and [pp. 6–7](#xivly-page-6), not [ref 2].');
	});
	it('the system prompt names the files and the citation form', () => {
		expect(systemPrompt('T')).toMatch(/paper\.pdf[\s\S]*notes\.md[\s\S]*\[p\. N\]/);
	});
});
