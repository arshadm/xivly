import { describe, expect, it } from 'vitest';
import { emptyAnswer, onEvent, type Answer } from './events';

const delta = (text: string) => ({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } } });
const run = (...events: unknown[]) => events.reduce<Answer>((a, e) => onEvent(a, e), emptyAnswer());

describe('a streamed answer', () => {
	it('text as it streams; the session from init; cost and done from the result', () => {
		const a = run({ type: 'system', subtype: 'init', session_id: 's-1' }, delta('The paper '), delta('fuses kernels [p. 3].'));
		expect(a).toMatchObject({ text: 'The paper fuses kernels [p. 3].', sessionId: 's-1', done: false });
		const done = onEvent(a, { type: 'result', subtype: 'success', is_error: false, result: 'The paper fuses kernels [p. 3].', session_id: 's-1', total_cost_usd: 0.012 });
		expect(done).toMatchObject({ done: true, cost: 0.012, error: undefined });
		expect(onEvent(done, { type: 'xivly_exit', code: 0, stderr: '' })).toMatchObject({ done: true, error: undefined });
	});

	it('tool calls show what Claude is doing, and the text after them is a new paragraph', () => {
		const a = run(
			delta('Let me look.'),
			{ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/lib/papers/x/paper.pdf', pages: '1-5' } }] } }
		);
		expect(a.activity).toBe('Reading paper.pdf (pages 1-5)');
		const b = run(
			delta('Let me look.'),
			{ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'paper.pdf' } }] } },
			{ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'text', text: '' } } },
			delta('It is about fusion.')
		);
		expect(b).toMatchObject({ text: 'Let me look.\n\nIt is about fusion.', activity: null, tools: ['Reading paper.pdf'] });
	});

	it('a result without streamed text still gives the answer', () => {
		expect(run({ type: 'result', is_error: false, result: 'Short answer.' }).text).toBe('Short answer.');
	});

	it('errors: reported by Claude, a crash (stderr), or stopped', () => {
		expect(run({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'Credit balance is too low' }).error).toBe('Credit balance is too low');
		expect(run({ type: 'xivly_exit', code: 1, stderr: 'line 1\nError: not logged in' }).error).toBe('line 1 Error: not logged in');
		expect(run(delta('Partial'), { type: 'xivly_exit', code: null, stderr: '' })).toMatchObject({ text: 'Partial', done: true, error: 'Stopped' });
	});

	it('anything else is ignored', () => {
		expect(run({ type: 'rate_limit_event' }, 'nonsense', null, { type: 'xivly_text', text: 'log line' })).toEqual(emptyAnswer());
	});
});
