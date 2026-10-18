// A notebook's conversation with Claude, as its Chat tab runs it: `claude -p` in the
// notebook's folder, the folders of the PDFs added with @ readable too (see chat.ts
// for what each question sends). Clear archives the conversation and starts a new
// one; Summarize asks Claude to sum it up, archives it, and starts a new, smaller
// one from the summary.
import type { ClaudeCli, LibraryFs } from '#lib/platform/index.js';
import { emptyAnswer, onEvent, type Answer } from '#lib/chat/events.js';
import { chatTitle, newChat, normalizeChat } from '#lib/chat/store.js';
import type { Paper } from '#lib/types.js';
import { buildTurn, fingerprint, notebookSystemPrompt, parseContext, sameItem, SUMMARY_REQUEST, type Added, type ContextItem, type NotebookChat } from './chat';

const enc = new TextEncoder();
const dec = new TextDecoder();
const ID = /^[\w.-]+$/;
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

/** A notebook chat file as the app needs it, or null when it isn't one. */
function normalizeNotebookChat(id: string, raw: unknown): NotebookChat | null {
	const chat = normalizeChat(id, raw);
	if (!chat) return null;
	const r = raw as Record<string, unknown>;
	return { ...chat, context: parseContext(r.context), sentText: str(r.sentText), summary: str(r.summary), tokens: typeof r.tokens === 'number' ? r.tokens : undefined };
}

/** A new, empty conversation. */
const newNotebookChat = (model: string): NotebookChat => ({ ...newChat(model), context: [] });

/** `notebooks/<id>/chats/current.json`, and the conversations before it in `chats/archive/`. */
export class NotebookChatStore {
	constructor(readonly fs: LibraryFs) {}

	#dir = (notebookId: string) => `notebooks/${notebookId}/chats`;

	async current(notebookId: string): Promise<NotebookChat | null> {
		const bytes = await this.fs.read(`${this.#dir(notebookId)}/current.json`);
		if (!bytes) return null;
		const raw = JSON.parse(dec.decode(bytes)) as Record<string, unknown>;
		return normalizeNotebookChat(str(raw.id) && ID.test(raw.id as string) ? (raw.id as string) : 'current', raw);
	}

	/** Write the conversation (under its lock); refused once the notebook is gone. */
	save(notebookId: string, chat: NotebookChat) {
		return this.#write(notebookId, `${this.#dir(notebookId)}/current.json`, chat);
	}

	/** Keep a conversation in the archive (by its id: when it started). */
	archive(notebookId: string, chat: NotebookChat) {
		if (!ID.test(chat.id)) throw new Error(`Not a chat id: ${chat.id}`);
		return this.#write(notebookId, `${this.#dir(notebookId)}/archive/${chat.id}.json`, chat);
	}

	/** The archived conversations, newest first (unreadable files left out). */
	async archived(notebookId: string): Promise<NotebookChat[]> {
		const dir = `${this.#dir(notebookId)}/archive`;
		if (!(await this.fs.exists(dir))) return [];
		const names = (await this.fs.list(dir)).filter((e) => !e.dir && e.name.endsWith('.json')).map((e) => e.name.slice(0, -5));
		const chats = await Promise.all(
			names
				.filter((n) => ID.test(n))
				.map(async (n) => {
					const bytes = await this.fs.read(`${dir}/${n}.json`).catch(() => null);
					try {
						return bytes ? normalizeNotebookChat(n, JSON.parse(dec.decode(bytes))) : null;
					} catch {
						return null;
					}
				})
		);
		return chats.filter((c): c is NotebookChat => !!c).sort((a, b) => b.updated.localeCompare(a.updated));
	}

	#write(notebookId: string, path: string, chat: NotebookChat) {
		return navigator.locks.request(`xivly:${path}`, async () => {
			if (!(await this.fs.exists(`notebooks/${notebookId}/notebook.json`))) throw new Error('This notebook is no longer in the library');
			await this.fs.write(path, enc.encode(JSON.stringify(chat, null, 2) + '\n'));
		});
	}
}

export interface NotebookChatDeps {
	claude: ClaudeCli;
	store: NotebookChatStore;
	/** Where claude is (found once per window). */
	locate: () => Promise<string>;
	model: () => string;
	/** The notebook's title, and its text as Markdown, now. */
	notebook: () => { title: string; text: string };
	paper: (id: string) => Paper | null;
	/** Your notes and highlights on a paper, as Markdown. */
	notes: (paperId: string) => Promise<string>;
}

export class NotebookChatSession {
	chat = $state.raw<NotebookChat>() as NotebookChat;
	/** The answer streaming in (null between questions). */
	answer = $state.raw<Answer | null>(null);
	running = $state(false);
	/** What's running: a question, or a summary. */
	task = $state<'ask' | 'summarize' | null>(null);
	#runId: string | null = null;

	constructor(
		readonly notebookId: string,
		private readonly deps: NotebookChatDeps,
		chat?: NotebookChat | null
	) {
		this.chat = chat ?? newNotebookChat(deps.model());
	}

	/** The PDFs in the conversation: their folders, for Claude to read. */
	#dirs(context: ContextItem[]) {
		return [...new Set(context.filter((c) => c.kind === 'pdf' && this.deps.paper(c.paperId)).map((c) => `papers/${c.paperId}`))];
	}

	/** One run in this conversation; resolves with the finished answer. */
	async #run(prompt: string, context: ContextItem[]): Promise<Answer> {
		const runId = crypto.randomUUID();
		this.#runId = runId;
		this.answer = emptyAnswer();
		let finish!: () => void;
		const finished = new Promise<void>((r) => (finish = r));
		try {
			const claude = await this.deps.locate();
			await this.deps.claude.run(
				{ id: runId, claude, notebookId: this.notebookId, addDirs: this.#dirs(context), prompt, sessionId: this.chat.sessionId, resume: this.chat.started, model: this.deps.model(), system: notebookSystemPrompt(this.deps.notebook().title), tools: ['Read'] },
				(e) => {
					this.answer = onEvent(this.answer ?? emptyAnswer(), e);
					if ((e as { type?: string })?.type === 'xivly_exit') finish();
				}
			);
			await finished;
		} catch (e) {
			this.answer = { ...(this.answer ?? emptyAnswer()), done: true, error: e instanceof Error ? e.message : String(e) };
		}
		const a = this.answer ?? emptyAnswer();
		this.answer = null;
		this.#runId = null;
		return a;
	}

	/**
	 * Ask, with papers added (@): the ones new to the conversation are sent (a summarized one
	 * in full again). Resolves `false` when it failed before Claude saw them (they're not kept).
	 */
	async send(question: string, items: ContextItem[] = []): Promise<boolean> {
		const q = question.trim();
		if (!q || this.running) return false;
		const now = new Date().toISOString();
		const before = this.chat;
		const fresh = items.filter((i, k) => items.findIndex((j) => sameItem(i, j)) === k && !before.context.some((c) => sameItem(c, i) && !c.summarized) && this.deps.paper(i.paperId));
		const context = [...before.context.filter((c) => !fresh.some((f) => sameItem(f, c))), ...fresh.map(({ paperId, kind }) => ({ paperId, kind }))];
		this.chat = { ...before, context, title: before.title || chatTitle(q), updated: now, messages: [...before.messages, { role: 'user', text: q, at: now }] };
		this.running = true;
		this.task = 'ask';
		try {
			const added: Added[] = [];
			for (const item of fresh) added.push({ item, paper: this.deps.paper(item.paperId)!, notes: item.kind === 'notes' ? await this.deps.notes(item.paperId).catch(() => '') : undefined });
			const { text } = this.deps.notebook();
			const sentText = fingerprint(text);
			const prompt = buildTurn({ question: q, notebookText: sentText !== before.sentText ? text : undefined, added, summary: !before.started ? before.summary : undefined });
			const a = await this.#run(prompt, context);
			const at = new Date().toISOString();
			// Claude never saw it (couldn't start, or failed before the session began): nothing new is in the conversation.
			const seen = !a.error || !!a.sessionId;
			this.chat = {
				...this.chat,
				...(seen ? { context, sentText, tokens: a.contextTokens ?? this.chat.tokens } : { context: before.context }),
				// Once Claude Code knows the session, later questions continue it.
				started: this.chat.started || !!a.sessionId,
				model: this.deps.model(),
				updated: at,
				messages: [...this.chat.messages, { role: 'assistant', text: a.text, at, tools: a.tools.length ? a.tools : undefined, error: a.error, cost: a.cost }]
			};
			await this.deps.store.save(this.notebookId, this.chat).catch(() => {});
			return seen;
		} finally {
			this.running = false;
			this.task = null;
		}
	}

	stop() {
		if (this.#runId) void this.deps.claude.cancel(this.#runId);
	}

	/** Start again: this conversation goes to the archive, and nothing is in the new one. */
	async clear() {
		if (this.running) return;
		const old = this.chat;
		if (old.messages.length) await this.deps.store.archive(this.notebookId, old);
		this.chat = newNotebookChat(this.deps.model());
		await this.deps.store.save(this.notebookId, this.chat);
	}

	/**
	 * Make the conversation smaller: Claude sums it up, it goes to the archive, and a new one
	 * starts from the summary (the papers in it marked summarized). Throws why when it can't.
	 */
	async summarize() {
		if (this.running || !this.chat.messages.length) return;
		this.running = true;
		this.task = 'summarize';
		try {
			const old = this.chat;
			const a = await this.#run(SUMMARY_REQUEST, old.context);
			if (a.error || !a.text.trim()) throw new Error(a.error || 'Claude gave no summary');
			const at = new Date().toISOString();
			await this.deps.store.archive(this.notebookId, {
				...old,
				started: old.started || !!a.sessionId,
				updated: at,
				messages: [...old.messages, { role: 'user', text: SUMMARY_REQUEST, at }, { role: 'assistant', text: a.text, at, cost: a.cost }]
			});
			this.chat = { ...newNotebookChat(this.deps.model()), title: old.title, summary: a.text.trim(), context: old.context.map((c) => ({ ...c, summarized: true })) };
			await this.deps.store.save(this.notebookId, this.chat);
		} finally {
			this.running = false;
			this.task = null;
		}
	}
}
