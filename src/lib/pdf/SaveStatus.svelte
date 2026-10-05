<!--
	Save state as one animated icon: an amber dot while there are unsaved
	changes, a spinning arc while saving, then a check that draws itself in.
	Click saves (⌘S).
-->
<script lang="ts">
	import { keys } from '$lib/shortcuts';
	import Tip from '$lib/ui/Tip.svelte';

	let { dirty, saving, onsave, class: className = '' }: { dirty: boolean; saving: boolean; onsave: () => void; class?: string } = $props();
	const state = $derived(saving ? 'saving' : dirty ? 'dirty' : 'saved');
	const label = $derived({ saving: 'Saving…', dirty: 'Unsaved changes: save now', saved: 'Annotations are saved in the PDF' }[state]);
</script>

<Tip {label} shortcut={keys.save}>
	{#snippet child({ props })}
		<button {...props} class="save {className}" data-state={state} aria-label={label} onclick={onsave}>
			<svg viewBox="0 0 20 20" aria-hidden="true">
				<circle class="ring" cx="10" cy="10" r="7.25" />
				<circle class="arc" cx="10" cy="10" r="7.25" />
				<circle class="dot" cx="10" cy="10" r="3" />
				{#key state === 'saved'}<path class="check" d="M6.6 10.3l2.2 2.2 4.6-4.8" />{/key}
			</svg>
		</button>
	{/snippet}
</Tip>

<style>
	.save {
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		flex-shrink: 0;
		border-radius: 0.375rem;
		color: var(--color-stone-500);
	}
	.save:hover {
		background: color-mix(in oklab, var(--color-stone-200) 70%, transparent);
	}
	:global(.dark) .save {
		color: var(--color-stone-400);
	}
	:global(.dark) .save:hover {
		background: var(--color-stone-800);
	}
	svg {
		width: 1rem;
		height: 1rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.ring {
		opacity: 0.35;
		transition: opacity 0.2s;
	}
	.arc {
		stroke-dasharray: 12 34;
		opacity: 0;
		transform-origin: center;
		transition: opacity 0.2s;
	}
	.dot {
		fill: var(--color-amber-500);
		stroke: none;
		transform-origin: center;
		transform: scale(0);
		transition: transform 0.25s cubic-bezier(0.3, 1.5, 0.5, 1);
	}
	.check {
		stroke-dasharray: 12;
		stroke-dashoffset: 12;
		opacity: 0;
	}

	[data-state='dirty'] .dot {
		transform: scale(1);
		animation: breathe 2.4s ease-in-out infinite;
	}
	[data-state='saving'] .ring {
		opacity: 0.2;
	}
	[data-state='saving'] .arc {
		opacity: 1;
		animation: spin 0.8s linear infinite;
	}
	[data-state='saved'] .check {
		opacity: 1;
		animation: draw 0.4s 0.05s ease-out forwards;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes breathe {
		50% {
			transform: scale(0.75);
		}
	}
	@keyframes draw {
		to {
			stroke-dashoffset: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.arc,
		.dot,
		.check {
			animation: none !important;
		}
		[data-state='saved'] .check {
			stroke-dashoffset: 0;
		}
	}
</style>
