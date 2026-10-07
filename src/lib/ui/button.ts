// The app's buttons (dialogs, settings, forms): one shape, a few intents.
// A class string rather than a component, so bits-ui parts (AlertDialog.Action…) can use it too.
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'destructive-soft';

const base =
	'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3.5 text-[13px] font-medium whitespace-nowrap outline-none transition-colors select-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400 disabled:pointer-events-none disabled:opacity-50';

const variants: Record<ButtonVariant, string> = {
	primary: 'bg-stone-800 text-stone-50 shadow-sm hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white',
	secondary: 'bg-stone-100 text-stone-700 hover:bg-stone-200/80 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700',
	ghost: 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800',
	destructive: 'bg-red-600 text-white shadow-sm hover:bg-red-500 focus-visible:ring-red-500/50',
	'destructive-soft': 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/70'
};

export const button = (variant: ButtonVariant = 'secondary', className?: string) => cn(base, variants[variant], className);

const iconSizes = { 6: 'size-6', 7: 'size-7', 8: 'size-8' } as const;

/**
 * Square icon buttons (toolbars, headers, dialog close). `data-active` (toggled
 * on) and `data-state=open` (its popover or menu is open) look pressed.
 * Pass extra classes to tint (e.g. muted text) or to change the active look.
 */
export const iconButton = (size: keyof typeof iconSizes = 7, className?: string) =>
	cn(
		'grid shrink-0 place-items-center rounded-md text-stone-600 outline-none transition-colors hover:bg-stone-200/70 focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400 disabled:pointer-events-none disabled:opacity-35 data-[active]:bg-stone-200 data-[state=open]:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800 dark:data-[active]:bg-stone-800 dark:data-[state=open]:bg-stone-800',
		iconSizes[size],
		className
	);

/** Muted icon buttons (secondary actions: sidebars, dialog close). */
export const mutedIcon = 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200';
