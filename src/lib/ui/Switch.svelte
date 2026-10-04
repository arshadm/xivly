<!-- Switch recipe (bits-ui Switch). -->
<script lang="ts">
	import { Switch } from 'bits-ui';

	let { checked = $bindable(false), label, onCheckedChange }: { checked?: boolean; label: string; onCheckedChange?: (v: boolean) => void } = $props();
</script>

<Switch.Root
	bind:checked
	{onCheckedChange}
	aria-label={label}
	class="inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-stone-300 p-0.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 data-[state=checked]:bg-stone-800 dark:bg-stone-700 dark:data-[state=checked]:bg-stone-200"
>
	<Switch.Thumb class="block size-4 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-4 dark:data-[state=checked]:bg-stone-900" />
</Switch.Root>
