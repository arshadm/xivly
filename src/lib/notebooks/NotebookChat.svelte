<!--
	A notebook's Chat tab. Claude sees the notebook's text; type @ in the question box to
	add a paper's PDF or your notes on it (linked papers first, then the library). What's
	been added shows as chips above the box and stays in the conversation until it's
	cleared (a new conversation, nothing in it) or summarized (a new, smaller one that
	starts from a summary). The meter says how large the conversation has grown.
	Earlier conversations are kept and can be read again.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { Annotations } from 'svelte-pdf-mini';
	import { settingsDialog } from '#lib/components/SettingsDialog.svelte';
	import { toast } from '#lib/components/Toasts.svelte';
	import { locateClaude } from '#lib/chat/locate.js';
	import { onDiskChange } from '#lib/disk-changes.js';
	import { library } from '#lib/library.svelte.js';
	import { refLabel, searchPapers } from '#lib/notes/paper-ref.js';
	import { platform } from '#lib/platform/index.js';
	import { settings } from '#lib/settings.svelte.js';
	import type { Paper } from '#lib/types.js';
	import { button, iconButton, mutedIcon } from '#lib/ui/button.js';
	import { clipboard } from '#lib/ui/clipboard.js';
	import { contextMenuState, type MenuItem } from '#lib/ui/context-menu.svelte.js';
	import { prompts } from '#lib/ui/prompt.svelte.js';
	import Tip from '#lib/ui/Tip.svelte';
	import { citationTarget, linkCitations, sameItem, type ContextItem, type NotebookChat as Chat } from './chat';
	import { NotebookChatSession, NotebookChatStore } from './chat-session.svelte';
	import { paperNotesMarkdown } from './paper-notes';

	let {
		notebookId,
		title,
		text,
		linked,
		onshow,
		onlink
	}: {
		notebookId: string;
		title: string;
		/** The notebook's text as Markdown, now. */
		text: () => string;
		/** Papers linked to the notebook (offered first after @). */
		linked: ReadonlySet<string>;
		/** A citation was clicked: show the paper at that page. */
		onshow: (paperId: string, page?: number) => void;
		/** Link a paper (mentioned in the chat) to the notebook. */
		onlink: (paperId: string) => void;
	} = $props();

	const store = $derived(library.repo ? new NotebookChatStore(library.repo.fs) : null);
	let session = $state<NotebookChatSession | null>(null);
	/** An archived conversation being read (null: the current one). */
	let viewing = $state.raw<Chat | null>(null);
	let archived = $state.raw<Chat[]>([]);

	$effect(() => {
		const s = store;
		const id = notebookId;
		if (!s || !platform.claude) return;
		void s
			.current(id)
			.catch(() => null)
			.then((chat) => {
				session = new NotebookChatSession(
					id,
					{
						claude: platform.claude!,
						store: s,
						locate: locateClaude,
						model: () => settings.values.claudeModel,
						notebook: () => ({ title, text: text() }),
						paper: (pid) => library.get(pid) ?? null,
						notes: (pid) => paperNotesMarkdown(library.repo!, pid)
					},
					chat
				);
			});
		void s.archived(id).then((list) => (archived = list));
	});

	// The conversation changed on disk (another device, synced): shown here, unless a question is running.
	$effect(() => {
		const s = store;
		const id = notebookId;
		return onDiskChange(async (paths) => {
			if (!s || !session || session.running) return;
			if (paths.some((p) => p.startsWith(`notebooks/${id}/chats/archive/`))) archived = await s.archived(id).catch(() => archived);
			if (!paths.includes(`notebooks/${id}/chats/current.json`)) return;
			const chat = await s.current(id).catch(() => null);
			if (chat && session && !session.running && JSON.stringify(chat) !== JSON.stringify(session.chat)) session.chat = chat;
		});
	});

	const shown = $derived(viewing ?? session?.chat ?? null);
	/** The papers the conversation knows (for citations). */
	const known = $derived((shown?.context ?? []).map((c) => library.get(c.paperId)).filter((p): p is Paper => !!p));

	// ── The question, and papers added with @ ─────────────────────────────
	let question = $state('');
	let pending = $state<ContextItem[]>([]);
	let input = $state<HTMLTextAreaElement>();
	let scroller = $state<HTMLElement>();

	/** The @ being typed (before the cursor): its query and where it starts. */
	let mention = $state<{ start: number; query: string; index: number } | null>(null);
	const options = $derived(mention ? searchPapers(library.papers, mention.query, linked, 6).flatMap((p) => (['pdf', 'notes'] as const).map((kind) => ({ paper: p, kind }))) : []);

	function findMention() {
		const el = input;
		if (!el) return void (mention = null);
		const before = question.slice(0, el.selectionStart ?? question.length);
		const m = /(?:^|\s)@([^@\n]{0,60})$/.exec(before);
		mention = m ? { start: before.length - m[1].length - 1, query: m[1], index: mention?.query === m[1] ? mention.index : 0 } : null;
	}

	async function choose(o: { paper: Paper; kind: 'pdf' | 'notes' }) {
		if (!mention) return;
		const end = input?.selectionStart ?? question.length;
		const at = mention.start;
		question = question.slice(0, at) + question.slice(end).replace(/^\s*/, '');
		const item = { paperId: o.paper.id, kind: o.kind };
		if (!pending.some((p) => sameItem(p, item))) pending = [...pending, item];
		mention = null;
		if (!linked.has(o.paper.id)) toast(`“${o.paper.title}” isn’t linked to this notebook`, 'info', { label: 'Link it', run: () => onlink(o.paper.id) });
		await tick();
		input?.focus();
		input?.setSelectionRange(at, at);
	}

	async function ask() {
		if (!session || !question.trim() || session.running) return;
		const q = question;
		const items = pending;
		[question, pending] = ['', []];
		const sending = session.send(q, items);
		await tick();
		scrollDown(true);
		// Claude never saw them: they're kept, to try again.
		if (!(await sending)) pending = items;
	}

	function onkeydown(e: KeyboardEvent) {
		if (mention && options.length) {
			if (e.key === 'ArrowDown') return (e.preventDefault(), (mention.index = (mention.index + 1) % options.length));
			if (e.key === 'ArrowUp') return (e.preventDefault(), (mention.index = (mention.index - 1 + options.length) % options.length));
			if (e.key === 'Enter' || e.key === 'Tab') return (e.preventDefault(), void choose(options[mention.index]));
		}
		if (mention && e.key === 'Escape') return (e.preventDefault(), e.stopPropagation(), (mention = null));
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			void ask();
		}
	}

	/** Focus the question box, once it's there. */
	export async function focus() {
		for (let i = 0; i < 120 && !input; i++) await new Promise(requestAnimationFrame);
		input?.focus();
	}

	// Keep the newest text in view while it streams, unless scrolled up to read.
	let pinned = true;
	const onscroll = () => scroller && (pinned = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 40);
	function scrollDown(force = false) {
		if (scroller && (force || pinned)) scroller.scrollTop = scroller.scrollHeight;
	}
	$effect(() => {
		void session?.answer?.text;
		void shown?.messages.length;
		void tick().then(() => scrollDown());
	});

	/** Links in answers: a citation shows the paper at its page, others open in the browser. */
	function onclick(e: MouseEvent) {
		const a = (e.target as Element | null)?.closest?.('a[href]');
		if (!a) return;
		e.preventDefault();
		const href = a.getAttribute('href')!;
		const cited = citationTarget(href);
		if (cited) onshow(cited.paperId, cited.page);
		else if (/^https?:/i.test(href)) void platform.openUrl(href);
	}

	// ── Clear and Summarize ──────────────────────────────────────────────
	async function clear() {
		if (!session?.chat.messages.length && !session?.chat.context.length && !session?.chat.summary) return;
		const ok = await prompts.confirm('Clear the conversation?', { message: 'A new conversation starts, with nothing added to it. This one is kept: find it under Earlier conversations.', confirmLabel: 'Clear' });
		if (!ok || !session) return;
		try {
			await session.clear();
			viewing = null;
			archived = (await store?.archived(notebookId)) ?? archived;
		} catch (e) {
			toast(`Couldn’t clear: ${e instanceof Error ? e.message : e}`, 'error');
		}
	}

	async function summarize() {
		if (!session) return;
		try {
			await session.summarize();
			viewing = null;
			archived = (await store?.archived(notebookId)) ?? archived;
			toast('Summarized: the conversation goes on from the summary');
		} catch (e) {
			toast(`Couldn’t summarize: ${e instanceof Error ? e.message : e}`, 'error');
		}
	}

	const earlier = (): MenuItem[] =>
		archived.map((c) => ({
			label: `${c.title || 'Chat'} · ${new Date(c.updated).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`,
			checked: viewing?.id === c.id,
			onSelect: () => (viewing = c)
		}));

	// The meter: the conversation's size against a model's context (200k tokens).
	const LIMIT = 200_000;
	const tokens = $derived(session?.chat.tokens ?? 0);
	const kTokens = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
	const meterTone = $derived(tokens > LIMIT * 0.6 ? 'bg-red-500' : tokens > LIMIT * 0.3 ? 'bg-amber-500' : 'bg-emerald-500');

	const itemLabel = (c: ContextItem) => {
		const p = library.get(c.paperId);
		return `${p ? refLabel(p) : c.paperId} · ${c.kind === 'pdf' ? 'PDF' : 'notes'}`;
	};
	const cost = (c?: number) => (c ? `≈ $${c.toFixed(c < 0.1 ? 3 : 2)} of subscription usage (API-price equivalent)` : '');
	const busy = $derived(!!session?.running);
</script>

{#if !platform.claude}
	<div class="grid flex-1 place-items-center px-6 text-center text-[13px] text-muted">Chatting with Claude about a notebook runs in the desktop app (it uses Claude Code with your own login).</div>
{:else if session && shown}
	<div class="flex min-h-0 flex-1 flex-col bg-white dark:bg-stone-900">
		<div class="flex shrink-0 items-center gap-1 border-b border-stone-200 py-1 pr-2 pl-4 dark:border-stone-800">
			<p class="min-w-0 flex-1 truncate text-xs text-muted" title={shown.title}>{viewing ? 'Earlier conversation' : shown.title || 'New conversation'}</p>
			{#if !viewing && tokens}
				<Tip label="How large the conversation is: {tokens.toLocaleString()} tokens. Summarize to make it smaller.">
					{#snippet child({ props })}
						<span {...props} class="flex items-center gap-1.5 px-1 text-[11px] text-muted tabular-nums" aria-label="Conversation size: {tokens} tokens">
							<span class="h-1.5 w-10 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700"><span class="block h-full {meterTone}" style:width="{Math.min(100, (tokens / LIMIT) * 100)}%"></span></span>{kTokens(tokens)}
						</span>
					{/snippet}
				</Tip>
			{/if}
			<Tip label="Summarize: a new, smaller conversation that goes on from a summary">
				{#snippet child({ props })}<button {...props} class={iconButton(7, mutedIcon)} aria-label="Summarize the conversation" disabled={busy || !!viewing || !session?.chat.messages.length} onclick={summarize}><span class="icon-[lucide--shrink] size-4"></span></button>{/snippet}
			</Tip>
			<Tip label="Clear: start a new conversation">
				{#snippet child({ props })}<button {...props} class={iconButton(7, mutedIcon)} aria-label="Clear the conversation" disabled={busy || !!viewing} onclick={clear}><span class="icon-[lucide--eraser] size-4"></span></button>{/snippet}
			</Tip>
			<Tip label="Earlier conversations">
				{#snippet child({ props })}<button {...props} class={iconButton(7, mutedIcon)} aria-label="Earlier conversations" disabled={!archived.length || busy} onclick={(e) => contextMenuState.showAt(e.currentTarget, earlier())}><span class="icon-[lucide--history] size-4"></span></button>{/snippet}
			</Tip>
		</div>

		{#if viewing}
			<div class="flex shrink-0 items-center gap-2 border-b border-stone-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900 dark:border-stone-800 dark:bg-amber-950/40 dark:text-amber-200">
				<span class="flex-1">An earlier conversation, from {new Date(viewing.created).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.</span>
				<button class="underline underline-offset-2" onclick={() => (viewing = null)}>Back to the current one</button>
			</div>
		{/if}

		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div bind:this={scroller} {onscroll} {onclick} data-chat-answers class="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 text-[13.5px] leading-relaxed" aria-live="polite">
			{#if shown.summary}
				<details class="rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-700">
					<summary class="cursor-pointer text-xs text-muted">Goes on from a summary of the conversation before</summary>
					<div class="mt-2"><Annotations.Markdown source={linkCitations(shown.summary, known)} /></div>
				</details>
			{/if}
			{#if !shown.messages.length && !busy}
				<p class="pt-2 text-xs leading-relaxed text-muted">Ask Claude about this idea. It reads the notebook; type <kbd class="rounded border border-stone-300 px-1 dark:border-stone-700">@</kbd> to add a paper (its PDF, or your notes and highlights on it).</p>
			{/if}
			{#each shown.messages as m, i (i)}
				{#if m.role === 'user'}
					<div class="ml-8 rounded-lg bg-stone-100 px-3 py-2 whitespace-pre-wrap dark:bg-stone-800">{m.text}</div>
				{:else}
					<div class="answer">
						{#if m.text}<Annotations.Markdown source={linkCitations(m.text, known)} />{/if}
						{#if m.error}
							<p class="mt-1 rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300">
								{m.error}
								{#if /claude|logged in|install/i.test(m.error)}<button class="ml-1 underline" onclick={() => Object.assign(settingsDialog, { open: true, section: 'claude' })}>Settings › Claude</button>{/if}
							</p>
						{/if}
						<div class="mt-1 flex items-center gap-1 text-[11px] text-muted">
							<span class="min-w-0 flex-1 truncate" title={cost(m.cost)}>{m.tools?.join(' · ') ?? ''}</span>
							{#if m.text}<Tip label="Copy (Markdown)">{#snippet child({ props })}<button {...props} class={iconButton(6, mutedIcon)} aria-label="Copy the answer" onclick={() => clipboard.write(m.text).then(() => toast('Copied'))}><span class="icon-[lucide--copy] size-3.5"></span></button>{/snippet}</Tip>{/if}
						</div>
					</div>
				{/if}
			{/each}
			{#if session.answer && !viewing}
				<div class="answer">
					{#if session.answer.text && session.task === 'ask'}<p class="whitespace-pre-wrap">{session.answer.text}</p>{/if}
					<p class="mt-1 flex items-center gap-1.5 text-xs text-muted"><span class="icon-[lucide--loader-circle] size-3.5 animate-spin"></span>{session.task === 'summarize' ? 'Summarizing the conversation…' : (session.answer.activity ?? (session.answer.text ? 'Writing…' : 'Thinking…'))}</p>
				</div>
			{/if}
		</div>

		{#if !viewing}
			<div class="relative shrink-0 border-t border-stone-200 p-3 dark:border-stone-800">
				{#if session.chat.context.length || pending.length}
					<ul class="mb-2 flex flex-wrap gap-1" aria-label="In the conversation">
						{#each session.chat.context as c (`${c.paperId}/${c.kind}`)}
							<li
								class="inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] {c.summarized ? 'border-dashed border-stone-300 text-muted dark:border-stone-600' : 'border-stone-300 bg-stone-100 text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200'}"
								title={c.summarized ? 'In the conversation through its summary: mention it again to add it in full' : 'In the conversation'}
							>
								<span class="size-3 shrink-0 {c.kind === 'pdf' ? 'icon-[lucide--file-text]' : 'icon-[lucide--notebook-pen]'}"></span><span class="truncate">{itemLabel(c)}</span>{#if c.summarized}<span>(summarized)</span>{/if}
							</li>
						{/each}
						{#each pending as c (`${c.paperId}/${c.kind}`)}
							<li class="inline-flex max-w-full items-center gap-1 rounded-full border border-blue-300 bg-blue-50 py-0.5 pr-0.5 pl-2 text-[11px] text-blue-800 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200" title="Added with your next question">
								<span class="size-3 shrink-0 {c.kind === 'pdf' ? 'icon-[lucide--file-text]' : 'icon-[lucide--notebook-pen]'}"></span><span class="truncate">{itemLabel(c)}</span>
								<button class="grid size-4 place-items-center rounded-full hover:bg-blue-200/70 dark:hover:bg-blue-900" aria-label="Don’t add {itemLabel(c)}" onclick={() => (pending = pending.filter((p) => !sameItem(p, c)))}><span class="icon-[lucide--x] size-3"></span></button>
							</li>
						{/each}
					</ul>
				{/if}
				{#if mention}
					<div class="absolute right-3 bottom-full left-3 z-10 mb-1 max-h-64 overflow-y-auto rounded-lg border border-stone-200 bg-white p-1 text-[13px] shadow-lg dark:border-stone-700 dark:bg-stone-900" role="listbox" aria-label="Add a paper">
						{#each options as o, i (`${o.paper.id}/${o.kind}`)}
							<button type="button" role="option" aria-selected={i === mention.index} class="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left aria-selected:bg-stone-100 dark:aria-selected:bg-stone-800" onmousedown={(e) => (e.preventDefault(), void choose(o))}>
								<span class="size-3.5 shrink-0 text-stone-500 {o.kind === 'pdf' ? 'icon-[lucide--file-text]' : 'icon-[lucide--notebook-pen]'}"></span>
								<span class="min-w-0 flex-1 truncate">{o.paper.title}</span>
								<span class="shrink-0 text-[11px] text-muted">{o.kind === 'pdf' ? 'PDF' : 'notes'}</span>
							</button>
						{:else}
							<p class="px-2 py-1.5 text-xs text-muted">No paper matches.</p>
						{/each}
					</div>
				{/if}
				<div class="flex items-end gap-2 rounded-lg border border-edge bg-white px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-blue-500 dark:bg-stone-900 dark:focus-within:ring-blue-400">
					<textarea
						bind:this={input}
						bind:value={question}
						{onkeydown}
						oninput={findMention}
						onclick={findMention}
						onblur={() => (mention = null)}
						rows="2"
						aria-label="Ask Claude about this notebook"
						placeholder="Ask about this idea… @ adds a paper  (↵ to send)"
						class="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent py-1 text-[13px] outline-none [field-sizing:content] placeholder:text-muted"
					></textarea>
					{#if busy}
						<button class={button('secondary', 'h-7 shrink-0 px-2.5 text-xs')} onclick={() => session?.stop()}><span class="icon-[lucide--square] size-3"></span>Stop</button>
					{:else}
						<button class={button('primary', 'h-7 shrink-0 px-2.5 text-xs')} disabled={!question.trim()} onclick={ask}><span class="icon-[lucide--arrow-up] size-3.5"></span>Ask</button>
					{/if}
				</div>
			</div>
		{/if}
	</div>
{/if}
