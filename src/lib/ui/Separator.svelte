<script lang="ts">
	import { Separator } from 'bits-ui';
	import { cn } from './cn';

	let { orientation = 'vertical', class: className }: { orientation?: 'vertical' | 'horizontal'; class?: string } = $props();
</script>

<Separator.Root {orientation} class={cn('shrink-0 bg-stone-300 dark:bg-stone-700', orientation === 'vertical' ? 'mx-1.5 h-5 w-px' : 'my-1 h-px w-full', className)} />
