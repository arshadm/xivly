// What `claude -p --output-format stream-json` says, as one answer: its text as
// it streams, what Claude is doing (reading the paper…), and how it ended.

/** One run's answer, built up event by event. */
export interface Answer {
	/** The text so far (complete once `done`). */
	text: string;
	/** What Claude is doing right now ("Reading paper.pdf"), while it isn't writing. */
	activity: string | null;
	/** Tools used, in order (shown under the answer). */
	tools: string[];
	sessionId?: string;
	done: boolean;
	error?: string;
	/** API-price equivalent of the tokens used (drawn from the subscription, not charged). */
	cost?: number;
}

export const emptyAnswer = (): Answer => ({ text: '', activity: null, tools: [], done: false });

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const base = (p: unknown) => (typeof p === 'string' ? p.split(/[\\/]/).pop() || p : '');

/** What a tool call is doing, in a few words. */
function describeTool(name: string, input: unknown): string {
	const i = isObject(input) ? input : {};
	switch (name) {
		case 'Read': {
			const pages = typeof i.pages === 'string' ? ` (pages ${i.pages})` : '';
			return `Reading ${base(i.file_path) || 'a file'}${pages}`;
		}
		case 'Grep':
			return `Searching for “${String(i.pattern ?? '')}”`;
		case 'Glob':
			return 'Looking for files';
		default:
			return `Using ${name}`;
	}
}

/** The answer after one more event. */
export function onEvent(a: Answer, e: unknown): Answer {
	if (!isObject(e)) return a;
	switch (e.type) {
		case 'system':
			return e.subtype === 'init' && typeof e.session_id === 'string' ? { ...a, sessionId: e.session_id } : a;
		case 'stream_event': {
			const ev = isObject(e.event) ? e.event : {};
			const delta = isObject(ev.delta) ? ev.delta : {};
			if (ev.type === 'content_block_delta' && delta.type === 'text_delta' && typeof delta.text === 'string') return { ...a, text: a.text + delta.text, activity: null };
			// A text block after a tool call starts a new paragraph.
			if (ev.type === 'content_block_start' && isObject(ev.content_block) && ev.content_block.type === 'text' && a.text && !a.text.endsWith('\n')) return { ...a, text: `${a.text}\n\n` };
			return a;
		}
		case 'assistant': {
			const content = isObject(e.message) && Array.isArray(e.message.content) ? e.message.content : [];
			const calls = content.filter((c): c is Json => isObject(c) && c.type === 'tool_use').map((c) => describeTool(String(c.name ?? ''), c.input));
			return calls.length ? { ...a, activity: calls.at(-1)!, tools: [...a.tools, ...calls] } : a;
		}
		case 'result': {
			const text = typeof e.result === 'string' && e.result.trim() && !a.text.trim() ? e.result : a.text;
			return {
				...a,
				text,
				activity: null,
				done: true,
				sessionId: typeof e.session_id === 'string' ? e.session_id : a.sessionId,
				cost: typeof e.total_cost_usd === 'number' ? e.total_cost_usd : a.cost,
				error: e.is_error ? (typeof e.result === 'string' && e.result) || String(e.subtype ?? 'Claude reported an error') : a.error
			};
		}
		case 'xivly_exit': {
			if (a.done && !a.error) return { ...a, activity: null };
			const stderr = typeof e.stderr === 'string' ? e.stderr.trim().split('\n').slice(-3).join(' ') : '';
			// Killed (cancelled): no code.
			const why = e.code === null ? 'Stopped' : a.error || stderr || `claude exited with code ${String(e.code)}`;
			return { ...a, activity: null, done: true, error: a.error ?? why };
		}
		default:
			return a;
	}
}
