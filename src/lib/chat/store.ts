// Conversations with Claude about a paper: `papers/<id>/chats/<chat>.json`, one
// file per conversation, with the Claude Code session it continues.
import type { LibraryFs } from '#lib/platform/index.js';

interface ChatMessage {
	role: 'user' | 'assistant';
	text: string;
	/** ISO timestamp. */
	at: string;
	/** What Claude did for this answer ("Reading paper.pdf"). */
	tools?: string[];
	error?: string;
	/** API-price equivalent of the tokens (drawn from the subscription). */
	cost?: number;
}

export interface Chat {
	version: number;
	/** The file name (without .json): when it started, sortable. */
	id: string;
	/** The first question, shortened. */
	title: string;
	/** Claude Code's session: continued with `--resume` once it exists (`started`). */
	sessionId: string;
	started: boolean;
	model: string;
	created: string;
	updated: string;
	messages: ChatMessage[];
	[extra: string]: unknown;
}

const VERSION = 1;
const enc = new TextEncoder();
const dec = new TextDecoder();
const ID = /^[\w.-]+$/;
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

/** A new conversation (its id from the time: chats list in order). */
export function newChat(model: string, now = new Date()): Chat {
	const at = now.toISOString();
	return { version: VERSION, id: at.replace(/[:.]/g, '-'), title: '', sessionId: crypto.randomUUID(), started: false, model, created: at, updated: at, messages: [] };
}

/** The first question as a title: one line, at most ~60 characters. */
export function chatTitle(question: string) {
	const line = question.replace(/\s+/g, ' ').trim();
	return line.length > 60 ? `${line.slice(0, 57).trimEnd()}…` : line;
}

/** A chat file as the app needs it, or null when it isn't one. */
export function normalizeChat(id: string, raw: unknown): Chat | null {
	if (!isObject(raw) || !str(raw.sessionId)) return null;
	const messages = (Array.isArray(raw.messages) ? raw.messages : [])
		.filter(isObject)
		.filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string')
		.map(
			(m): ChatMessage => ({
				role: m.role as ChatMessage['role'],
				text: m.text as string,
				at: str(m.at) ?? '',
				tools: Array.isArray(m.tools) ? m.tools.filter((t): t is string => typeof t === 'string') : undefined,
				error: str(m.error),
				cost: typeof m.cost === 'number' ? m.cost : undefined
			})
		);
	return {
		...raw,
		version: VERSION,
		id,
		title: str(raw.title) || chatTitle(messages.find((m) => m.role === 'user')?.text ?? '') || 'Chat',
		sessionId: str(raw.sessionId)!,
		started: raw.started === true,
		model: str(raw.model) ?? '',
		created: str(raw.created) ?? '',
		updated: str(raw.updated) ?? str(raw.created) ?? '',
		messages
	};
}

export class ChatStore {
	constructor(readonly fs: LibraryFs) {}

	#dir = (paperId: string) => `papers/${paperId}/chats`;

	/** A paper's conversations, newest first (unreadable files left out). */
	async list(paperId: string): Promise<Chat[]> {
		const dir = this.#dir(paperId);
		if (!(await this.fs.exists(dir))) return [];
		const names = (await this.fs.list(dir)).filter((e) => !e.dir && e.name.endsWith('.json')).map((e) => e.name.slice(0, -5));
		const chats = await Promise.all(names.filter((n) => ID.test(n)).map((n) => this.read(paperId, n).catch(() => null)));
		return chats.filter((c): c is Chat => !!c).sort((a, b) => b.updated.localeCompare(a.updated));
	}

	async read(paperId: string, id: string): Promise<Chat | null> {
		const bytes = await this.fs.read(`${this.#dir(paperId)}/${id}.json`);
		if (!bytes) return null;
		return normalizeChat(id, JSON.parse(dec.decode(bytes)));
	}

	/** Write a conversation (under its lock); refused once the paper is gone. */
	save(paperId: string, chat: Chat): Promise<void> {
		if (!ID.test(chat.id)) throw new Error(`Not a chat id: ${chat.id}`);
		const path = `${this.#dir(paperId)}/${chat.id}.json`;
		return navigator.locks.request(`xivly:${path}`, async () => {
			if (!(await this.fs.exists(`papers/${paperId}`))) throw new Error('This paper is no longer in the library');
			await this.fs.write(path, enc.encode(JSON.stringify(chat, null, 2) + '\n'));
		});
	}

	remove(paperId: string, id: string) {
		return this.fs.trash(`${this.#dir(paperId)}/${id}.json`);
	}
}
