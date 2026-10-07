<!--
	First start: offer the example library (annotated papers to learn the app).
	Shown once, when the library is empty; Settings › Library can add it later.
-->
<script lang="ts">
	import { button } from '#lib/ui/button.js';
	import { AlertDialog } from 'bits-ui';
	import Dialog from '#lib/ui/Dialog.svelte';
	import { library } from '#lib/library.svelte.js';
	import { downloadStarter, starterManifest } from '#lib/onboarding/starter.svelte.js';
	import { settings } from '#lib/settings.svelte.js';

	const open = $derived(settings.ready && library.status === 'ready' && !settings.values.starterOffered && library.papers.length === 0);
	let size = $state<string | null>(null);
	let count = $state<number | null>(null);
	$effect(() => {
		if (!open) return;
		starterManifest().then((m) => {
			if (!m) return;
			count = m.files.filter((f) => f.path.endsWith('.pdf')).length;
			size = `${Math.round(m.files.reduce((n, f) => n + f.size, 0) / 1e6)} MB`;
		});
	});

	const decide = (download: boolean) => {
		settings.set('starterOffered', true);
		if (download) void downloadStarter();
	};
</script>

<Dialog {open} onOpenChange={(o) => !o && decide(false)} alert bare class="w-[min(420px,92vw)] p-5">
	<AlertDialog.Title class="font-serif text-lg">Start with a few papers?</AlertDialog.Title>
	<AlertDialog.Description class="mt-1 text-sm text-muted">
		An empty library is a little intimidating. Add {count ?? 'some'} example papers, already annotated{size ? ` (${size})` : ''}. They're easy to remove later.
	</AlertDialog.Description>
	<div class="mt-4 flex justify-end gap-2 text-sm">
		<AlertDialog.Cancel class={button('secondary')}>Start empty</AlertDialog.Cancel>
		<AlertDialog.Action class={button('primary')} onclick={() => decide(true)}>Add examples</AlertDialog.Action>
	</div>
</Dialog>
