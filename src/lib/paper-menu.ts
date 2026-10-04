// The menu for a paper: card right-click in the library, "…" in the reader.
import { bibtex, paperLinks } from './cite';
import { toast } from './components/Toasts.svelte';
import { detailsDialog } from './components/DetailsDialog.svelte';
import { library } from './library.svelte';
import { platform } from './platform';
import { keys } from './shortcuts';
import type { Paper } from './types';
import { clipboard } from './ui/clipboard';
import type { MenuItem } from './ui/context-menu.svelte';
import { prompts } from './ui/prompt.svelte';
import { openPaper } from './windows';

const fail = (e: unknown) => toast(String(e), 'error');

export async function addTag(p: Paper) {
	const raw = await prompts.ask('New tag', { placeholder: 'e.g. transformers', confirmLabel: 'Add' });
	const tag = raw?.replace(/^#/, '').toLowerCase().replace(/\s+/g, '-');
	if (tag && !p.tags?.includes(tag)) await library.update(p.id, { tags: [...(p.tags ?? []), tag] }).catch(fail);
}

export async function trashPaper(p: Paper) {
	const ok = await prompts.confirm(`Move “${p.title}” to the Trash?`, {
		message: platform.kind === 'desktop' ? 'Its folder goes to the macOS Trash.' : 'Its folder goes to .xivly/trash in your library.',
		confirmLabel: 'Move to Trash',
		danger: true
	});
	if (ok) await library.remove(p.id).catch(fail);
	return ok;
}

export function paperMenu(p: Paper, { inReader = false } = {}): MenuItem[] {
	const links = paperLinks(p);
	const copy = (text: string, what: string) => clipboard.write(text).then(() => toast(`${what} copied`), fail);
	const items: MenuItem[] = [];
	if (!inReader) items.push({ label: 'Open', icon: 'icon-[lucide--book-open]', shortcut: '↵', onSelect: () => openPaper(p.id, p.title) });
	items.push(
		{
			label: 'Category',
			icon: 'icon-[lucide--folder]',
			separatorBefore: !inReader,
			items: [
				...library.categories.map((c) => ({
					label: c.name,
					color: library.color({ category: c.id }).accent,
					checked: p.category === c.id,
					onSelect: () => library.update(p.id, { category: c.id }).catch(fail)
				})),
				{ label: 'None', icon: 'icon-[lucide--circle-off]', checked: !library.category(p.category), separatorBefore: true, onSelect: () => library.update(p.id, { category: null }).catch(fail) }
			]
		},
		{
			label: 'Tags',
			icon: 'icon-[lucide--tag]',
			items: [
				...library.allTags.map((t) => ({
					label: `#${t}`,
					checked: p.tags?.includes(t),
					onSelect: () => {
						const tags = p.tags?.includes(t) ? p.tags.filter((x) => x !== t) : [...(p.tags ?? []), t];
						return library.update(p.id, { tags: tags.length ? tags : null }).catch(fail);
					}
				})),
				{ label: 'New tag…', icon: 'icon-[lucide--plus]', separatorBefore: library.allTags.length > 0, onSelect: () => addTag(p) }
			]
		}
	);
	if (links.length)
		items.push({ label: 'Links', icon: 'icon-[lucide--link]', items: links.map((l) => ({ label: l.label, icon: l.icon, onSelect: () => platform.openUrl(l.url) })) });
	items.push(
		{
			label: 'Copy',
			icon: 'icon-[lucide--copy]',
			items: [
				{ label: 'Title', onSelect: () => copy(p.title, 'Title') },
				{ label: 'BibTeX', onSelect: () => copy(bibtex(p), 'BibTeX') },
				...(links[0] ? [{ label: 'Link', onSelect: () => copy(links[0].url, 'Link') }] : [])
			]
		},
		{ label: 'Edit details…', icon: 'icon-[lucide--pencil]', separatorBefore: true, onSelect: () => detailsDialog.show(p.id) }
	);
	if (platform.reveal) items.push({ label: 'Show in Finder', icon: 'icon-[lucide--folder-search]', onSelect: () => platform.reveal?.(`papers/${p.id}/paper.pdf`) });
	items.push(
		{ label: 'Re-extract metadata', icon: 'icon-[lucide--sparkles]', onSelect: () => library.refreshMetadata(p.id).then(() => toast('Metadata updated'), fail) },
		{ label: 'Move to Trash', icon: 'icon-[lucide--trash-2]', danger: true, separatorBefore: true, onSelect: () => trashPaper(p) }
	);
	return items;
}

