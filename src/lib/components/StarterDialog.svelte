<!--
	First start: offer the example library (annotated papers to learn the app).
	Shown once, when the library is empty; Settings › Library can add it later.
-->
<script lang="ts">
	import { button } from '$lib/ui/button';
	import { AlertDialog } from 'bits-ui';
	import { fade, scale } from 'svelte/transition';
	import { library } from '$lib/library.svelte';
	import { downloadStarter, starterManifest } from '$lib/onboarding/starter.svelte';
	import { settings } from '$lib/settings.svelte';

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

<AlertDialog.Root {open} onOpenChange={(o) => !o && decide(false)}>
	<AlertDialog.Portal>
		<AlertDialog.Overlay forceMount>
			{#snippet child({ props, open })}
				{#if open}<div {...props} transition:fade={{ duration: 150 }} class="fixed inset-0 z-(--z-alert) bg-stone-950/30 backdrop-blur-[2px]"></div>{/if}
			{/snippet}
		</AlertDialog.Overlay>
		<AlertDialog.Content forceMount>
			{#snippet child({ props, open })}
				{#if open}
					<div {...props} transition:scale={{ start: 0.97, duration: 150 }} class="fixed top-1/2 left-1/2 z-(--z-alert) w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 text-stone-800 shadow-2xl outline-none dark:bg-stone-900 dark:text-stone-100">
						<AlertDialog.Title class="font-serif text-lg">Start with a few papers?</AlertDialog.Title>
						<AlertDialog.Description class="mt-1 text-sm text-stone-500">
							An empty library is a little intimidating. Add {count ?? 'some'} example papers, already annotated{size ? ` (${size})` : ''}. They're easy to remove later.
						</AlertDialog.Description>
						<div class="mt-4 flex justify-end gap-2 text-sm">
							<AlertDialog.Cancel class={button('secondary')}>Start empty</AlertDialog.Cancel>
							<AlertDialog.Action class={button('primary')} onclick={() => decide(true)}>Add examples</AlertDialog.Action>
						</div>
					</div>
				{/if}
			{/snippet}
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>
