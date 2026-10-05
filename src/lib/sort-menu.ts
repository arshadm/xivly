// Sort order and read filter of the library grid (header buttons, right-click, Settings).
import { settings, type SortKey } from './settings.svelte';
import type { MenuItem } from './ui/context-menu.svelte';

export const sortOptions: { value: SortKey; label: string; icon: string; desc: string; asc: string }[] = [
	{ value: 'added', label: 'Date added', icon: 'icon-[lucide--calendar-plus]', desc: 'Newest first', asc: 'Oldest first' },
	{ value: 'opened', label: 'Last opened', icon: 'icon-[lucide--clock]', desc: 'Most recent first', asc: 'Least recent first' },
	{ value: 'published', label: 'Date published', icon: 'icon-[lucide--calendar]', desc: 'Newest first', asc: 'Oldest first' },
	{ value: 'title', label: 'Title', icon: 'icon-[lucide--a-large-small]', desc: 'Reverse alphabetical', asc: 'Alphabetical' }
];

export const readOptions = [
	{ value: 'all', label: 'All papers' },
	{ value: 'unread', label: 'Unread' },
	{ value: 'read', label: 'Read' }
] as const;

export function sortMenu(): MenuItem[] {
	const s = settings.values;
	const current = sortOptions.find((o) => o.value === s.sortBy) ?? sortOptions[0];
	return [
		...sortOptions.map((o, i) => ({
			heading: i === 0 ? 'Sort by' : undefined,
			label: o.label,
			checked: s.sortBy === o.value,
			onSelect: () => settings.set('sortBy', o.value)
		})),
		{ heading: 'Order', label: current.desc, checked: s.sortDesc, separatorBefore: true, onSelect: () => settings.set('sortDesc', true) },
		{ label: current.asc, checked: !s.sortDesc, onSelect: () => settings.set('sortDesc', false) }
	];
}
