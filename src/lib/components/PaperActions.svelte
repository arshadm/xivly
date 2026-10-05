<!-- A paper's actions as one row of icons (tooltips say what they do): the Info panel's
     and the Edit details dialog's footer. -->
<script lang="ts">
	import { bibtex } from '$lib/cite';
	import { library } from '$lib/library.svelte';
	import { fileManager, trashName } from '$lib/os';
	import { trashPaper } from '$lib/paper-menu';
	import { platform } from '$lib/platform';
	import type { Paper } from '$lib/types';
	import { iconButton, mutedIcon } from '$lib/ui/button';
	import { clipboard } from '$lib/ui/clipboard';
	import { cn } from '$lib/ui/cn';
	import Tip from '$lib/ui/Tip.svelte';
	import type { Snippet } from 'svelte';
	import { toast } from './Toasts.svelte';

	/** `actions`: extra buttons (the reader adds its exports). */
	let { paper, actions, class: className = '' }: { paper: Paper; actions?: Snippet<[{ btn: string }]>; class?: string } = $props();

	const fail = (e: unknown) => toast(String(e), 'error');
	const copy = (text: string, what: string) => clipboard.write(text).then(() => toast(`${what} copied`), fail);
	const btn = iconButton(7, mutedIcon);
</script>

<div class={cn('flex flex-wrap items-center gap-0.5', className)}>
	{#snippet action(label: string, icon: string, run: () => unknown, danger = false)}
		<Tip {label}>
			{#snippet child({ props })}<button {...props} class="{btn} {danger ? 'text-red-500! hover:bg-red-50! hover:text-red-600! dark:text-red-400! dark:hover:bg-red-950/50!' : ''}" aria-label={label} onclick={run}><span class="{icon} size-4"></span></button>{/snippet}
		</Tip>
	{/snippet}
	{@render action('Copy BibTeX', 'icon-[lucide--quote]', () => copy(bibtex(paper), 'BibTeX'))}
	{@render actions?.({ btn })}
	{#if platform.reveal}{@render action(`Show in ${fileManager}`, 'icon-[lucide--folder-search]', () => platform.reveal?.(`papers/${paper.id}/paper.pdf`))}{/if}
	{@render action('Refresh metadata (PDF and Hugging Face)', 'icon-[lucide--refresh-cw]', () => library.refreshMetadata(paper.id).then(() => toast('Metadata updated'), fail))}
	<span class="flex-1" aria-hidden="true"></span>
	{@render action(`Move to ${trashName}`, 'icon-[lucide--trash-2]', () => trashPaper(paper), true)}
</div>
