<!--
	Every dialog of the app: one overlay, one panel, the same transitions (none with
	reduced motion). `alert` uses bits-ui AlertDialog (Cancel / Action parts, no outside
	click); `layer` puts it above other dialogs (a confirm over Settings). `bare` drops
	the header: the content brings its own title (Dialog.Title / AlertDialog.Title).
-->
<script lang="ts">
	import { AlertDialog, Dialog } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { fade, scale } from 'svelte/transition';
	import { iconButton, mutedIcon } from './button';
	import { cn } from './cn';

	let {
		open = $bindable(false),
		onOpenChange,
		title = '',
		description,
		alert = false,
		layer = alert ? 'alert' : 'dialog',
		bare = false,
		form = false,
		onsubmit,
		onOpenAutoFocus,
		ref = $bindable(),
		children,
		class: className
	}: {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		/** Header title (unless `bare`). */
		title?: string;
		description?: string;
		/** AlertDialog semantics (role="alertdialog", Cancel / Action parts). */
		alert?: boolean;
		/** Stacking: over the page ('dialog') or over other dialogs ('alert'). */
		layer?: 'dialog' | 'alert';
		bare?: boolean;
		/** Render the panel as a <form> (with `onsubmit`). */
		form?: boolean;
		onsubmit?: (e: SubmitEvent) => void;
		onOpenAutoFocus?: (e: Event) => void;
		ref?: HTMLElement;
		children: Snippet;
		class?: string;
	} = $props();

	const P = $derived(alert ? AlertDialog : Dialog);
	const z = $derived(layer === 'alert' ? 'z-(--z-alert)' : 'z-(--z-dialog)');
	const ms = $derived(prefersReducedMotion.current ? 0 : 150);
</script>

<P.Root bind:open {onOpenChange}>
	<P.Portal>
		<P.Overlay forceMount>
			{#snippet child({ props, open })}
				{#if open}<div {...props} transition:fade={{ duration: ms }} class="fixed inset-0 {z} bg-stone-950/30 backdrop-blur-[2px]"></div>{/if}
			{/snippet}
		</P.Overlay>
		<P.Content forceMount {onOpenAutoFocus}>
			{#snippet child({ props, open })}
				{#if open}
					<svelte:element
						this={form ? 'form' : 'div'}
						{...props}
						bind:this={ref}
						tabindex={-1}
						{onsubmit}
						transition:scale={{ start: 0.97, duration: ms }}
						class={cn(
							'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white text-stone-800 shadow-2xl outline-none dark:bg-stone-900 dark:text-stone-100',
							z,
							!bare && 'flex max-h-[90vh] w-[min(92vw,960px)] flex-col overflow-hidden',
							className
						)}
					>
						{#if !bare}
							<div class="flex items-start gap-3 border-b border-stone-200 px-4 py-3 dark:border-stone-800">
								<div class="min-w-0 flex-1">
									<P.Title class="truncate font-serif text-lg">{title}</P.Title>
									{#if description}<P.Description class="text-xs text-stone-500">{description}</P.Description>{/if}
								</div>
								<Dialog.Close class={iconButton(8, mutedIcon)} aria-label="Close"><span class="icon-[lucide--x] size-4"></span></Dialog.Close>
							</div>
						{/if}
						{@render children()}
					</svelte:element>
				{/if}
			{/snippet}
		</P.Content>
	</P.Portal>
</P.Root>
