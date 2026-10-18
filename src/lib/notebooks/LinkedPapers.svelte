<!--
	A notebook's linked papers, on the left of its window: the ones its text mentions
	(chips, in order of first mention, with how often), then the ones linked by hand.
	Click to show one beside the text; right-click for the rest. A paper still mentioned
	in the text can't be unlinked here (remove its chips).
-->
<script lang="ts">
	import { toast } from '#lib/components/Toasts.svelte';
	import { library } from '#lib/library.svelte.js';
	import { refLabel } from '#lib/notes/paper-ref.js';
	import { theme } from '#lib/theme.svelte.js';
	import type { Paper } from '#lib/types.js';
	import { iconButton, mutedIcon } from '#lib/ui/button.js';
	import { contextMenu, type MenuItem } from '#lib/ui/context-menu.svelte.js';
	import Tip from '#lib/ui/Tip.svelte';
	import { paperInk } from 'svelte-pdf-mini';
	import { notebooks } from './notebooks.svelte';
	import PaperSearchDialog from './PaperSearchDialog.svelte';
	import type { NotebookNode } from './tree';

	let {
		notebook,
		mentions,
		shown,
		onshow,
		onreader,
		oninsert
	}: {
		notebook: NotebookNode;
		/** Chips in the text, per paper (in order of first mention). */
		mentions: ReadonlyMap<string, number>;
		/** The paper shown beside the text. */
		shown: string | null;
		onshow: (paperId: string) => void;
		onreader: (p: Paper) => void;
		/** Put a chip for it in the text, at the cursor. */
		oninsert: (p: Paper) => void;
	} = $props();

	const fail = (e: unknown) => toast(String(e), 'error');

	interface Row {
		id: string;
		paper: Paper | null;
		mentioned: number;
		byHand: boolean;
	}
	const rows = $derived.by((): Row[] => {
		const ids = [...mentions.keys(), ...notebook.papers.filter((p) => !mentions.has(p))];
		return ids.map((id) => ({ id, paper: library.get(id) ?? null, mentioned: mentions.get(id) ?? 0, byHand: notebook.papers.includes(id) }));
	});
	const linked = $derived(new Set(rows.map((r) => r.id)));

	let searching = $state(false);

	const byline = (p: Paper) => [p.authors?.length ? (p.authors.length > 2 ? `${p.authors[0]} et al.` : p.authors.join(', ')) : '', p.year].filter(Boolean).join(' · ');

	function unlink(r: Row) {
		if (r.mentioned) return toast(`Still mentioned ${r.mentioned}× in the text: remove its chips to unlink it`, 'info');
		void notebooks.link(notebook.id, r.id, false).catch(fail);
	}

	function menu(r: Row): MenuItem[] {
		const p = r.paper;
		return [
			...(p
				? [
						{ label: 'Show beside the text', icon: 'icon-[lucide--panel-right]', onSelect: () => onshow(r.id) },
						{ label: 'Open in the reader', icon: 'icon-[lucide--book-open]', onSelect: () => onreader(p) },
						{ label: 'Insert a link in the text', icon: 'icon-[lucide--at-sign]', separatorBefore: true, onSelect: () => oninsert(p) }
					]
				: []),
			{ label: r.mentioned ? `Mentioned ${r.mentioned}× in the text` : 'Unlink', icon: 'icon-[lucide--unlink]', disabled: !!r.mentioned, separatorBefore: true, onSelect: () => unlink(r) }
		];
	}

	const iconBtn = iconButton(6, mutedIcon);
</script>

<aside class="flex w-64 shrink-0 flex-col border-r border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-900" aria-label="Linked papers">
	<div class="h-11 shrink-0 lights:h-11" data-tauri-drag-region></div>
	<div class="flex items-center gap-2 px-3 pb-1 text-[11px] font-medium tracking-wide text-muted uppercase">
		<span class="flex-1">Linked papers <span class="tabular-nums">{rows.length || ''}</span></span>
		<Tip label="Link a paper…">
			{#snippet child({ props })}<button {...props} class={iconBtn} aria-label="Link a paper" onclick={() => (searching = true)}><span class="icon-[lucide--plus] size-3.5"></span></button>{/snippet}
		</Tip>
	</div>
	<ul class="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
		{#each rows as r (r.id)}
			<li class="group relative">
				{#if r.paper}
					{@const p = r.paper}
					<button
						class="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-stone-200/60 focus-visible:ring-2 focus-visible:ring-blue-500 data-[active]:bg-stone-200 dark:hover:bg-stone-800/60 dark:data-[active]:bg-stone-800"
						data-active={shown === r.id || undefined}
						aria-current={shown === r.id || undefined}
						onclick={() => onshow(r.id)}
						ondblclick={() => onreader(p)}
						{@attach contextMenu(() => menu(r))}
					>
						<span class="mt-0.5 h-8 w-1 shrink-0 rounded-full" style:background={paperInk(library.color(p), theme.dark)} aria-hidden="true"></span>
						<span class="min-w-0 flex-1">
							<span class="line-clamp-2 font-serif text-[13px] leading-snug text-stone-900 dark:text-stone-100">{p.title}</span>
							<span class="block truncate text-[11px] text-muted">{byline(p) || refLabel(p)}</span>
						</span>
						{#if r.mentioned}<span class="mt-0.5 shrink-0 text-[11px] text-muted tabular-nums" title="Mentioned {r.mentioned}× in the text">{r.mentioned}×</span>{/if}
					</button>
				{:else}
					<div class="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-muted" {@attach contextMenu(() => menu(r))}>
						<span class="icon-[lucide--file-x] size-4 shrink-0"></span>
						<span class="min-w-0 flex-1 truncate line-through" title="No longer in the library">{r.id}</span>
					</div>
				{/if}
				{#if !r.mentioned}
					<Tip label="Unlink">
						{#snippet child({ props })}<button {...props} class="{iconBtn} absolute top-1.5 right-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label="Unlink {r.paper?.title ?? r.id}" onclick={() => unlink(r)}><span class="icon-[lucide--x] size-3.5"></span></button>{/snippet}
					</Tip>
				{/if}
			</li>
		{:else}
			<li class="px-2 py-2 text-xs leading-relaxed text-muted">
				No papers yet. Type <kbd class="rounded border border-stone-300 px-1 dark:border-stone-700">@</kbd> in the text to mention one, or
				<button class="underline underline-offset-2 hover:text-stone-800 dark:hover:text-stone-200" onclick={() => (searching = true)}>link a paper</button>.
			</li>
		{/each}
	</ul>
</aside>

<PaperSearchDialog
	bind:open={searching}
	title="Link a paper to “{notebook.title}”"
	exclude={linked}
	onpick={(p) => {
		void notebooks.link(notebook.id, p.id).catch(fail);
		onshow(p.id);
	}}
/>
