<script lang="ts">
	import '../app.css';
	import '$lib/pdf';
	import { invoke } from '@tauri-apps/api/core';
	import { listen } from '@tauri-apps/api/event';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { Tooltip } from 'bits-ui';
	import { onMount, type Snippet } from 'svelte';
	import { flushAll, hasUnsaved } from '$lib/flush';
	import { library } from '$lib/library.svelte';
	import { platform } from '$lib/platform';
	import { settings } from '$lib/settings.svelte';
	import { keys, matches } from '$lib/shortcuts';
	import { theme } from '$lib/theme.svelte';
	import { showLibrary } from '$lib/windows';
	import SettingsDialog, { settingsDialog } from '$lib/components/SettingsDialog.svelte';
	import Welcome from '$lib/components/Welcome.svelte';
	import Toasts, { toast } from '$lib/components/Toasts.svelte';
	import GlobalContextMenu from '$lib/ui/GlobalContextMenu.svelte';
	import TitleTooltips from '$lib/ui/TitleTooltips.svelte';
	import PromptHost from '$lib/ui/PromptHost.svelte';
	import DetailsDialog from '$lib/components/DetailsDialog.svelte';
	import { isEditable, onWindowContextMenu } from '$lib/ui/context-menu.svelte';
	import ShortcutsHelp, { shortcutsHelp } from '$lib/components/ShortcutsHelp.svelte';

	let { children }: { children: Snippet } = $props();

	// pdf.js 6 ships for current engines only (no polyfills): bail out clearly
	// instead of half-rendering on an old browser.
	const modern =
		typeof (Math as { sumPrecise?: unknown }).sumPrecise === 'function' &&
		typeof (Map.prototype as { getOrInsertComputed?: unknown }).getOrInsertComputed === 'function';
	let dragDepth = $state(0);

	$effect(() => {
		document.documentElement.classList.toggle('dark', theme.dark);
	});

	onMount(() => {
		if (!modern) return;
		settings.init().then(() => library.init());
		if (platform.kind !== 'desktop') return;
		const win = getCurrentWindow();
		const unlisten = [
			listen<{ hook: string; success: boolean; output: string }>('hook-finished', ({ payload: r }) => {
				const mode = settings.values.hookToasts;
				if (mode === 'all' || (mode === 'errors' && !r.success))
					toast(r.success ? `Hook ${r.hook} ran` : `Hook ${r.hook} failed: ${r.output.slice(-200)}`, r.success ? 'info' : 'error');
			}),
			// Closing this window: unsaved work is saved, discarded or the close cancelled.
			win.onCloseRequested(async (e) => {
				if (!hasUnsaved()) return;
				e.preventDefault();
				if (await flushAll()) await win.destroy();
			}),
			// ⌘Q: every window answers (Rust quits once all agree).
			listen('quit-requested', async () => {
				const ok = !hasUnsaved() || (await flushAll());
				await invoke('quit_response', { ok });
			})
		];
		return () => unlisten.forEach((p) => p.then((f) => f()));
	});

	// Web: the browser asks before leaving with unsaved annotations.
	function onbeforeunload(e: BeforeUnloadEvent) {
		if (hasUnsaved()) e.preventDefault();
	}

	function onkeydown(e: KeyboardEvent) {
		if (matches(e, keys.settings)) {
			e.preventDefault();
			settingsDialog.open = !settingsDialog.open;
		} else if (matches(e, keys.toggleTheme)) {
			e.preventDefault();
			theme.toggle();
		} else if (matches(e, keys.library)) {
			e.preventDefault();
			showLibrary();
		} else if (e.key === '?' && !isEditable(e.target)) {
			e.preventDefault();
			shortcutsHelp.open = !shortcutsHelp.open;
		}
	}

	// Pick up changes made outside the app (Finder, iCloud, agents, hooks, other windows).
	const onfocus = () => library.status === 'ready' && library.reload();

	// HTML5 drag & drop: same code path in Tauri (dragDropEnabled: false) and browsers.
	const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files');
	function ondrop(e: DragEvent) {
		e.preventDefault();
		dragDepth = 0;
		if (library.status === 'ready' && e.dataTransfer) library.import([...e.dataTransfer.files]);
	}
</script>

<svelte:window
	{onfocus}
	{onbeforeunload}
	{onkeydown}
	oncontextmenu={onWindowContextMenu}
	ondragenter={(e) => hasFiles(e) && dragDepth++}
	ondragleave={(e) => hasFiles(e) && (dragDepth = Math.max(0, dragDepth - 1))}
	ondragover={(e) => e.preventDefault()}
	{ondrop}
/>

<Tooltip.Provider delayDuration={400} skipDelayDuration={200}>
	<div class="h-full bg-stone-50 text-stone-800 dark:bg-stone-950 dark:text-stone-200">
		{#if !modern}
			<div class="grid h-full place-items-center px-6 text-center" data-tauri-drag-region>
				<div>
					<h1 class="font-serif text-4xl"><span class="italic">χ</span>ivly</h1>
					<p class="mt-4 text-sm text-stone-600 dark:text-stone-400">Xivly needs an up-to-date browser (Chrome, Edge, Arc or Safari 26).</p>
				</div>
			</div>
		{:else if library.status === 'loading' || !settings.ready}
			<div class="h-full" data-tauri-drag-region></div>
		{:else if library.status !== 'ready'}
			<Welcome />
		{:else}
			{@render children()}
		{/if}

		{#if dragDepth > 0 && library.status === 'ready'}
			<div class="pointer-events-none fixed inset-3 z-50 grid place-items-center rounded-2xl border-2 border-dashed border-stone-400 bg-stone-100/70 backdrop-blur-sm dark:bg-stone-900/70">
				<p class="text-lg text-stone-600 dark:text-stone-300">Drop PDFs to add them</p>
			</div>
		{/if}
		<Toasts />
		<GlobalContextMenu />
		<ShortcutsHelp />
		<TitleTooltips />
		<PromptHost />
		{#if library.status === 'ready'}<DetailsDialog />{/if}
		{#if settings.ready}<SettingsDialog />{/if}
	</div>
</Tooltip.Provider>
