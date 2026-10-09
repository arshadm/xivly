<!--
	The reader's Chat tab: ask Claude about the paper. Answers stream in (plain
	text, then rendered: Markdown and maths); [p. N] citations jump to the page.
	Conversations are kept next to the paper and continue where they stopped.
-->
<script lang="ts" module>
	import { platform } from '#lib/platform/index.js';
	import { settings } from '#lib/settings.svelte.js';

	// Where claude is: found once per window (again after a failure, or when the path setting changes).
	let found: { setting: string; path: Promise<string> } | null = null;
	function locateClaude(): Promise<string> {
		const setting = settings.values.claudePath;
		if (!found || found.setting !== setting) {
			const path = platform.claude!.locate(setting).then((r) => r.path);
			found = { setting, path };
			path.catch(() => (found = null));
		}
		return found.path;
	}
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import { Annotations } from 'svelte-pdf-mini';
	import { settingsDialog } from '#lib/components/SettingsDialog.svelte';
	import { library } from '#lib/library.svelte.js';
	import { button, iconButton, mutedIcon } from '#lib/ui/button.js';
	import { contextMenuState, type MenuItem } from '#lib/ui/context-menu.svelte.js';
	import Tip from '#lib/ui/Tip.svelte';
	import { ChatSession, linkPages } from './session.svelte';
	import { ChatStore, type Chat } from './store';

	let { id, title, onpage }: { id: string; title: string; onpage: (page: number) => void } = $props();

	const store = $derived(library.repo ? new ChatStore(library.repo.fs) : null);
	let chats = $state.raw<Chat[]>([]);
	let session = $state<ChatSession | null>(null);
	let question = $state('');
	let input = $state<HTMLTextAreaElement>();
	let scroller = $state<HTMLElement>();

	function open(chat?: Chat) {
		if (!platform.claude || !store) return;
		session = new ChatSession(id, title, { claude: platform.claude, store, locate: locateClaude, model: () => settings.values.claudeModel }, chat);
	}

	// The paper's conversations; the latest one continues.
	$effect(() => {
		const s = store;
		if (!s) return;
		void s.list(id).then((list) => {
			chats = list;
			if (!session) open(list[0]);
		});
	});

	/** Ask (Enter); the conversation list follows. */
	export async function ask(text = question) {
		if (!session || !text.trim() || session.running) return;
		if (text === question) question = '';
		const sending = session.send(text);
		await tick();
		scrollDown(true);
		await sending;
		chats = (await store?.list(id)) ?? chats;
	}

	/** Focus the question box (⌘⇧E), once the conversations are loaded and it's there. */
	export async function focus() {
		for (let i = 0; i < 120 && !input; i++) await new Promise(requestAnimationFrame);
		input?.focus();
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			void ask();
		}
	}

	// Keep the newest text in view while it streams, unless scrolled up to read.
	let pinned = true;
	const onscroll = () => scroller && (pinned = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 40);
	function scrollDown(force = false) {
		if (scroller && (force || pinned)) scroller.scrollTop = scroller.scrollHeight;
	}
	$effect(() => {
		void session?.answer?.text;
		void session?.chat.messages.length;
		void tick().then(() => scrollDown());
	});

	/** Links in answers: [p. N] jumps to the page, others open in the browser. */
	function onclick(e: MouseEvent) {
		const a = (e.target as Element | null)?.closest?.('a[href]');
		if (!a) return;
		e.preventDefault();
		const href = a.getAttribute('href')!;
		const page = /^#xivly-page-(\d+)$/.exec(href);
		if (page) onpage(Number(page[1]));
		else if (/^https?:/i.test(href)) void platform.openUrl(href);
	}

	const history = (): MenuItem[] => [
		{ label: 'New chat', icon: 'icon-[lucide--plus]', onSelect: () => open() },
		...chats.map((c, i) => ({
			label: c.title,
			separatorBefore: i === 0,
			checked: c.id === session?.chat.id,
			onSelect: () => open(c)
		}))
	];

	const suggestions = ['Summarise this paper in a few bullet points.', 'What are the main contributions, and how are they evaluated?', 'Explain the method step by step.', 'What are the limitations, and what would you try next?'];
	const cost = (c?: number) => (c ? `≈ $${c.toFixed(c < 0.1 ? 3 : 2)} of subscription usage (API-price equivalent)` : '');
</script>

{#if !platform.claude}
	<div class="grid flex-1 place-items-center px-6 text-center text-[13px] text-muted">Chatting with Claude about a paper runs in the desktop app (it uses Claude Code with your own login).</div>
{:else if session}
	<div class="flex min-h-0 flex-1 flex-col border-t border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
		<div class="flex shrink-0 items-center gap-1 border-b border-stone-200 py-1 pr-2 pl-4 dark:border-stone-800">
			<p class="min-w-0 flex-1 truncate text-xs text-muted" title={session.chat.title}>{session.chat.title || 'New chat'}</p>
			<Tip label="New chat">{#snippet child({ props })}<button {...props} class={iconButton(7, mutedIcon)} aria-label="New chat" disabled={session?.running} onclick={() => open()}><span class="icon-[lucide--square-pen] size-4"></span></button>{/snippet}</Tip>
			<Tip label="Earlier chats">{#snippet child({ props })}<button {...props} class={iconButton(7, mutedIcon)} aria-label="Earlier chats" disabled={!chats.length || session?.running} onclick={(e) => contextMenuState.showAt(e.currentTarget, history())}><span class="icon-[lucide--history] size-4"></span></button>{/snippet}</Tip>
		</div>

		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div bind:this={scroller} {onscroll} {onclick} class="chat min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 text-[13.5px] leading-relaxed" aria-live="polite">
			{#if !session.chat.messages.length && !session.running}
				<div class="space-y-2 pt-4">
					<p class="text-xs text-muted">Ask Claude about this paper. It reads the PDF (and your notes) and cites pages you can click.</p>
					{#each suggestions as s (s)}
						<button class="block w-full rounded-lg border border-stone-200 px-3 py-2 text-left text-[13px] hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800" onclick={() => ask(s)}>{s}</button>
					{/each}
				</div>
			{/if}
			{#each session.chat.messages as m, i (i)}
				{#if m.role === 'user'}
					<div class="ml-8 rounded-lg bg-stone-100 px-3 py-2 whitespace-pre-wrap dark:bg-stone-800">{m.text}</div>
				{:else}
					<div class="answer">
						{#if m.text}<Annotations.Markdown source={linkPages(m.text)} />{/if}
						{#if m.error}
							<p class="mt-1 rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300">
								{m.error}
								{#if /claude|logged in|install/i.test(m.error)}<button class="ml-1 underline" onclick={() => Object.assign(settingsDialog, { open: true, section: 'claude' })}>Settings › Claude</button>{/if}
							</p>
						{/if}
						{#if m.tools?.length || m.cost}<p class="mt-1 text-[11px] text-muted" title={cost(m.cost)}>{m.tools?.join(' · ') ?? ''}</p>{/if}
					</div>
				{/if}
			{/each}
			{#if session.answer}
				<div class="answer">
					{#if session.answer.text}<p class="whitespace-pre-wrap">{session.answer.text}</p>{/if}
					<p class="mt-1 flex items-center gap-1.5 text-xs text-muted"><span class="icon-[lucide--loader-circle] size-3.5 animate-spin"></span>{session.answer.activity ?? (session.answer.text ? 'Writing…' : 'Thinking…')}</p>
				</div>
			{/if}
		</div>

		<div class="shrink-0 border-t border-stone-200 p-3 dark:border-stone-800">
			<div class="flex items-end gap-2 rounded-lg border border-edge bg-white px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-blue-500 dark:bg-stone-900 dark:focus-within:ring-blue-400">
				<textarea bind:this={input} bind:value={question} {onkeydown} rows="2" aria-label="Ask Claude about this paper" placeholder="Ask about this paper…  (↵ to send, ⇧↵ new line)" class="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent py-1 text-[13px] outline-none [field-sizing:content] placeholder:text-muted"></textarea>
				{#if session.running}
					<button class={button('secondary', 'h-7 shrink-0 px-2.5 text-xs')} onclick={() => session?.stop()}><span class="icon-[lucide--square] size-3"></span>Stop</button>
				{:else}
					<button class={button('primary', 'h-7 shrink-0 px-2.5 text-xs')} disabled={!question.trim()} onclick={() => ask()}><span class="icon-[lucide--arrow-up] size-3.5"></span>Ask</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	/* Rendered answers: compact Markdown. */
	.chat :global([data-pdf-markdown] > * + *) {
		margin-top: 0.55em;
	}
	.chat :global([data-pdf-markdown] ul) {
		list-style: disc;
		padding-left: 1.3em;
	}
	.chat :global([data-pdf-markdown] ol) {
		list-style: decimal;
		padding-left: 1.3em;
	}
	.chat :global([data-pdf-markdown] h1),
	.chat :global([data-pdf-markdown] h2),
	.chat :global([data-pdf-markdown] h3) {
		font-family: var(--font-serif);
		font-size: 1.05em;
		font-weight: 600;
	}
	.chat :global([data-pdf-markdown] code) {
		font-family: var(--font-mono);
		font-size: 0.88em;
		background: rgb(0 0 0 / 0.06);
		border-radius: 4px;
		padding: 0.1em 0.3em;
	}
	.chat :global([data-pdf-markdown] pre) {
		background: rgb(0 0 0 / 0.05);
		border-radius: 6px;
		padding: 0.6em 0.8em;
		overflow-x: auto;
	}
	.chat :global([data-pdf-markdown] a) {
		color: var(--color-sky-700, #0369a1);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	/* Page citations: a chip, like the notes'. */
	.chat :global([data-pdf-markdown] a[href^='#xivly-page-']) {
		text-decoration: none;
		border-radius: 999px;
		padding: 0 0.45em;
		font-size: 0.85em;
		background: rgb(14 165 233 / 0.12);
		white-space: nowrap;
	}
	:global(.dark) .chat :global([data-pdf-markdown] a) {
		color: var(--color-sky-300, #7dd3fc);
	}
	:global(.dark) .chat :global([data-pdf-markdown] code),
	:global(.dark) .chat :global([data-pdf-markdown] pre) {
		background: rgb(255 255 255 / 0.08);
	}
</style>
