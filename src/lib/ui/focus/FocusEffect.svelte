<!--
	Focus effect recipes on top of the headless `Viewer.Focus` part.
	Built-in effects (pulse / outline / spotlight) are plain CSS on `[data-highlight]`
	(see the library's styles.css). These recipes render their own markup through the
	`child` snippet: the primitive gives position + timing, the recipe decides the look.

	Pass the same name to `viewer.focus(target, { highlight: 'glow' })`; recipes only
	draw for the names they know and fall back to the default element otherwise.
-->
<script lang="ts">
	import { Viewer } from 'svelte-pdf-mini';

	let { color = '#2563eb' }: { color?: string } = $props();
</script>

<Viewer.Focus>
	{#snippet child({ props, highlight, duration })}
		<div {...props} data-recipe={highlight} style="{props.style}--focus-color:{color};--focus-duration:{duration}ms">
			{#if highlight === 'glow'}
				<span class="fx-glow"></span>
			{:else if highlight === 'brackets'}
				{#each ['tl', 'tr', 'bl', 'br'] as c (c)}<span class="fx-bracket fx-{c}"></span>{/each}
			{:else if highlight === 'marker'}
				<span class="fx-marker"></span>
			{:else if highlight === 'ink'}
				<svg class="fx-ink" viewBox="0 0 100 100" preserveAspectRatio="none"><rect x="1" y="1" width="98" height="98" rx="6" pathLength="100" /></svg>
			{/if}
		</div>
	{/snippet}
</Viewer.Focus>

<style>
	[data-recipe] {
		pointer-events: none;
	}
	.fx-glow {
		position: absolute;
		inset: -4px;
		border-radius: 10px;
		background: color-mix(in srgb, var(--focus-color) 14%, transparent);
		box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--focus-color) 55%, transparent), 0 0 28px 6px color-mix(in srgb, var(--focus-color) 30%, transparent);
		animation: fx-fade var(--focus-duration) ease-out forwards;
	}
	.fx-bracket {
		position: absolute;
		width: 14px;
		height: 14px;
		border: 2.5px solid var(--focus-color);
		animation: fx-in 0.25s ease-out, fx-fade var(--focus-duration) ease-in forwards;
	}
	.fx-tl { left: -6px; top: -6px; border-right: 0; border-bottom: 0; border-top-left-radius: 4px; }
	.fx-tr { right: -6px; top: -6px; border-left: 0; border-bottom: 0; border-top-right-radius: 4px; }
	.fx-bl { left: -6px; bottom: -6px; border-right: 0; border-top: 0; border-bottom-left-radius: 4px; }
	.fx-br { right: -6px; bottom: -6px; border-left: 0; border-top: 0; border-bottom-right-radius: 4px; }
	.fx-marker {
		position: absolute;
		left: -2px;
		right: -2px;
		bottom: -5px;
		height: 6px;
		border-radius: 999px;
		background: var(--color-amber-500);
		transform-origin: left;
		animation: fx-draw var(--focus-duration) ease-out forwards;
	}
	.fx-ink {
		position: absolute;
		inset: -6px;
		width: calc(100% + 12px);
		height: calc(100% + 12px);
		overflow: visible;
	}
	.fx-ink rect {
		fill: none;
		stroke: var(--focus-color);
		stroke-width: 2.5px;
		vector-effect: non-scaling-stroke;
		stroke-dasharray: 100;
		stroke-linecap: round;
		animation: fx-stroke var(--focus-duration) ease-out forwards;
	}
	@keyframes fx-fade { 70% { opacity: 1; } 100% { opacity: 0; } }
	@keyframes fx-in { from { transform: scale(1.6); opacity: 0; } }
	@keyframes fx-draw { 0% { transform: scaleX(0); } 15% { transform: scaleX(1); } 75% { opacity: 1; } 100% { transform: scaleX(1); opacity: 0; } }
	@keyframes fx-stroke { 0% { stroke-dashoffset: 100; } 25% { stroke-dashoffset: 0; } 75% { opacity: 1; } 100% { stroke-dashoffset: 0; opacity: 0; } }
	@media (prefers-reduced-motion: reduce) {
		[data-recipe] * { animation-duration: 0.01s !important; }
	}
</style>
