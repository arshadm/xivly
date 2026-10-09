<!--
	Settings › Claude › Saved prompts: name and text of each (placeholders filled
	in when used), add, remove, back to the defaults. Saved as you type.
-->
<script lang="ts">
	import { library } from '#lib/library.svelte.js';
	import { button, iconButton, mutedIcon } from '#lib/ui/button.js';
	import { DEFAULT_PROMPTS, PLACEHOLDERS, readPrompts, writePrompts, type SavedPrompt } from './prompts';

	let list = $state<SavedPrompt[]>([]);
	$effect(() => {
		if (library.repo) void readPrompts(library.repo.fs).then((p) => (list = p.map((x) => ({ ...x }))));
	});

	let timer: ReturnType<typeof setTimeout> | undefined;
	/** Saved a moment after the last keystroke (prompts without a name aren't kept). */
	function save(now = false) {
		clearTimeout(timer);
		const write = () => library.repo && void writePrompts(library.repo.fs, $state.snapshot(list).filter((p) => p.name.trim()));
		if (now) write();
		else timer = setTimeout(write, 500);
	}

	function add() {
		list = [...list, { id: crypto.randomUUID(), name: 'New prompt', text: '' }];
		save(true);
	}
	function remove(id: string) {
		list = list.filter((p) => p.id !== id);
		save(true);
	}
	function defaults() {
		list = DEFAULT_PROMPTS.map((p) => ({ ...p }));
		save(true);
	}
	const field = 'w-full rounded-md border border-edge bg-transparent px-2 text-[13px] placeholder:text-muted';
</script>

<div class="mt-5">
	<div class="flex items-center justify-between">
		<h3 class="text-[13px] font-medium">Saved prompts</h3>
		<div class="flex gap-2">
			<button class={button('secondary', 'h-7 px-2.5 text-xs')} onclick={defaults}>Defaults</button>
			<button class={button('secondary', 'h-7 px-2.5 text-xs')} onclick={add}><span class="icon-[lucide--plus] size-3.5"></span>Add</button>
		</div>
	</div>
	<p class="mt-1 text-xs text-muted">In the Chat tab's ✨ menu. Placeholders: {PLACEHOLDERS.map((p) => `{{${p}}}`).join(', ')}.</p>
	<div class="mt-3 space-y-3">
		{#each list as p (p.id)}
			<div class="rounded-lg border border-stone-200 p-2.5 dark:border-stone-700">
				<div class="flex items-center gap-2">
					<input class="{field} h-7 font-medium" bind:value={p.name} oninput={() => save()} aria-label="Prompt name" placeholder="Name" />
					<button class={iconButton(7, mutedIcon)} aria-label="Remove {p.name}" onclick={() => remove(p.id)}><span class="icon-[lucide--trash-2] size-4"></span></button>
				</div>
				<textarea class="{field} mt-2 min-h-14 py-1.5 [field-sizing:content]" bind:value={p.text} oninput={() => save()} aria-label="Prompt text" placeholder="What to ask"></textarea>
			</div>
		{/each}
	</div>
</div>
