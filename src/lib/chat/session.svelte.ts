// One conversation with Claude about a paper, as the Chat tab runs it: the
// question goes to `claude -p` in the paper's folder (continuing the Claude
// Code session once there is one), the answer streams in, and the
// conversation is saved next to the paper.
import type { ClaudeCli } from '#lib/platform/index.js';
import { emptyAnswer, onEvent, type Answer } from './events';
import { chatTitle, newChat, type Chat, type ChatStore } from './store';

/** What Claude is told, besides Claude Code's own instructions. */
export function systemPrompt(title: string) {
	return [
		`You are helping the user read a research paper: "${title}". You are in its folder, in their Xivly library:`,
		'- paper.pdf: the paper (read it with the Read tool; use the pages parameter for long papers),',
		'- paper.json: its metadata,',
		'- notes.md: the user’s own notes on it (may not exist).',
		'When you refer to a place in the paper, cite its PDF page number as [p. N] (e.g. [p. 4]): the user can click it to go there.',
		'Answer in Markdown, concisely, and from the paper; say so when something isn’t in it.'
	].join('\n');
}

/** `[p. 4]` (and `[pp. 4–5]`) as links the chat turns into jumps to the page. */
export function linkPages(markdown: string) {
	return markdown.replace(/\[(pp?\.)\s*(\d+)((?:\s*[-–]\s*\d+)?)\]/g, (_, p, n, rest) => `[${p} ${n}${rest}](#xivly-page-${n})`);
}

export interface ChatDeps {
	claude: ClaudeCli;
	store: ChatStore;
	/** Where claude is (found once per window). */
	locate: () => Promise<string>;
	model: () => string;
}

export class ChatSession {
	chat = $state.raw<Chat>() as Chat;
	/** The answer streaming in (null between questions). */
	answer = $state.raw<Answer | null>(null);
	running = $state(false);
	#runId: string | null = null;

	constructor(
		readonly paperId: string,
		readonly title: string,
		private readonly deps: ChatDeps,
		chat?: Chat
	) {
		this.chat = chat ?? newChat(deps.model());
	}

	/** Ask; resolves once the answer is complete (or failed) and the conversation saved. */
	async send(question: string) {
		const q = question.trim();
		if (!q || this.running) return;
		const now = new Date().toISOString();
		this.chat = { ...this.chat, title: this.chat.title || chatTitle(q), updated: now, messages: [...this.chat.messages, { role: 'user', text: q, at: now }] };
		this.running = true;
		this.answer = emptyAnswer();
		const runId = crypto.randomUUID();
		this.#runId = runId;
		let finish!: () => void;
		const finished = new Promise<void>((r) => (finish = r));
		try {
			const claude = await this.deps.locate();
			await this.deps.claude.run(
				{ id: runId, claude, paperId: this.paperId, prompt: q, sessionId: this.chat.sessionId, resume: this.chat.started, model: this.deps.model(), system: systemPrompt(this.title), tools: ['Read'] },
				(e) => {
					this.answer = onEvent(this.answer ?? emptyAnswer(), e);
					if ((e as { type?: string })?.type === 'xivly_exit') finish();
				}
			);
			await finished;
		} catch (e) {
			this.answer = { ...(this.answer ?? emptyAnswer()), done: true, error: e instanceof Error ? e.message : String(e) };
		}
		await this.#settle();
	}

	stop() {
		if (this.#runId) void this.deps.claude.cancel(this.#runId);
	}

	/** The answer into the conversation, saved. */
	async #settle() {
		const a = this.answer ?? emptyAnswer();
		const at = new Date().toISOString();
		this.chat = {
			...this.chat,
			// Once Claude Code knows the session, later questions continue it.
			started: this.chat.started || !!a.sessionId,
			model: this.deps.model(),
			updated: at,
			messages: [...this.chat.messages, { role: 'assistant', text: a.text, at, tools: a.tools.length ? a.tools : undefined, error: a.error, cost: a.cost }]
		};
		this.answer = null;
		this.running = false;
		this.#runId = null;
		await this.deps.store.save(this.paperId, this.chat).catch(() => {});
	}
}
