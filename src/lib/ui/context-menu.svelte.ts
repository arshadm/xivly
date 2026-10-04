// One app-wide context menu (the native one never shows):
// - `{@attach contextMenu(() => items)}` on any element gives it a menu;
// - `setFallbackMenu(() => items)` covers the rest of the window;
// - text fields get Cut / Copy / Paste / Select all.
// Rendered by GlobalContextMenu.svelte (a bits-ui DropdownMenu at the cursor).
import type { Attachment } from 'svelte/attachments';
import { clipboard } from './clipboard';

export interface MenuItem {
	label: string;
	icon?: string;
	/** Shortcut hint shown as <kbd> (e.g. "⌘O"). */
	shortcut?: string;
	onSelect?: () => unknown;
	checked?: boolean;
	disabled?: boolean;
	danger?: boolean;
	/** CSS colour dot (categories, highlight colours). */
	color?: string;
	/** Submenu. */
	items?: MenuItem[];
	separatorBefore?: boolean;
	heading?: string;
}

export type MenuSource = () => MenuItem[];

class ContextMenuState {
	open = $state(false);
	x = $state(0);
	y = $state(0);
	items = $state.raw<MenuItem[]>([]);
	fallback: MenuSource | null = null;

	/** Open under an element (a "…" button). */
	showAt(el: HTMLElement, items: MenuItem[]) {
		const r = el.getBoundingClientRect();
		this.x = r.left;
		this.y = r.bottom + 4;
		this.items = items;
		this.open = true;
	}

	show(e: MouseEvent, items: MenuItem[]) {
		e.preventDefault();
		e.stopPropagation();
		if (!items.length) return;
		this.x = e.clientX;
		this.y = e.clientY;
		this.items = items;
		this.open = true;
	}
}

export const contextMenuState = new ContextMenuState();

/** Give an element its own context menu. */
export function contextMenu(source: MenuSource): Attachment<HTMLElement> {
	return (node) => {
		const handler = (e: MouseEvent) => {
			if (isEditable(e.target)) return; // text fields keep their edit menu
			contextMenuState.show(e, source());
		};
		node.addEventListener('contextmenu', handler);
		return () => node.removeEventListener('contextmenu', handler);
	};
}

/** Menu for right-clicks that nothing else handles (per window / page). */
export function setFallbackMenu(source: MenuSource | null) {
	contextMenuState.fallback = source;
	return () => {
		if (contextMenuState.fallback === source) contextMenuState.fallback = null;
	};
}

export function isEditable(t: EventTarget | null): t is HTMLInputElement | HTMLTextAreaElement | HTMLElement {
	return t instanceof HTMLElement && (t.isContentEditable || t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && !['checkbox', 'radio', 'range', 'button', 'submit'].includes(t.type)));
}

const mod = /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+';

/** Window-level handler: text fields, then the fallback, never the native menu. */
export function onWindowContextMenu(e: MouseEvent) {
	// Dialogs (settings, details…) get no context menu at all.
	if ((e.target as Element | null)?.closest?.('[role=dialog], [role=alertdialog]')) return e.preventDefault();
	if (e.defaultPrevented) return; // a component (e.g. the PDF menu) handled it
	if (isEditable(e.target)) return contextMenuState.show(e, textMenu(e.target as HTMLInputElement));
	e.preventDefault();
	const items = contextMenuState.fallback?.() ?? [];
	if (items.length) contextMenuState.show(e, items);
}

function textMenu(el: HTMLInputElement | HTMLTextAreaElement): MenuItem[] {
	const selected = el.value?.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0) ?? getSelection()?.toString() ?? '';
	const readonly = el.readOnly || el.disabled;
	const insert = (text: string) => {
		el.focus();
		document.execCommand('insertText', false, text);
	};
	return [
		{ label: 'Cut', icon: 'icon-[lucide--scissors]', shortcut: `${mod}X`, disabled: !selected || readonly, onSelect: async () => (await clipboard.write(selected), insert('')) },
		{ label: 'Copy', icon: 'icon-[lucide--copy]', shortcut: `${mod}C`, disabled: !selected, onSelect: () => clipboard.write(selected) },
		{ label: 'Paste', icon: 'icon-[lucide--clipboard-paste]', shortcut: `${mod}V`, disabled: readonly, onSelect: async () => insert(await clipboard.read()) },
		{ label: 'Select all', icon: 'icon-[lucide--text-select]', shortcut: `${mod}A`, separatorBefore: true, onSelect: () => (el.focus(), el.select()) }
	];
}
