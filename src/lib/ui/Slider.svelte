<!-- Slider recipe (bits-ui Slider), single value. -->
<script lang="ts">
	import { Slider } from 'bits-ui';
	import { cn } from './cn';

	let { value, min = 0, max = 1, step = 0.05, label, disabled = false, onValueChange, class: className }: { value: number; min?: number; max?: number; step?: number; label: string; disabled?: boolean; onValueChange: (v: number) => void; class?: string } = $props();
</script>

<Slider.Root type="single" {value} {onValueChange} {min} {max} {step} {disabled} aria-label={label} class={cn('relative flex h-5 w-40 touch-none items-center select-none data-[disabled]:opacity-40', className)}>
	<span class="relative h-1 w-full grow overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700"><Slider.Range class="absolute h-full bg-stone-500 dark:bg-stone-400" /></span>
	<Slider.Thumb index={0} class="block size-4 rounded-full border border-edge bg-white shadow transition-transform outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400" />
</Slider.Root>
