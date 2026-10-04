<!-- Keyboard key hint. -->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from './cn';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLElement> = $props();
</script>

<kbd class={cn('inline-grid h-5 min-w-5 place-items-center rounded border border-stone-300 bg-stone-50 px-1 font-sans text-[10.5px] leading-none font-medium text-stone-500 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-400', className)} {...rest}>{@render children?.()}</kbd>
