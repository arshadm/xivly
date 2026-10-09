// The arXiv feed as the library window shows it: loaded from `.xivly/feed/`,
// filtered for the view. Writes (dismiss, add, checks) go through the store
// and update the list here.
import { toast } from '#lib/components/Toasts.svelte';
import { library } from '#lib/library.svelte.js';
import { openPaper } from '#lib/windows.js';
import type { FeedConfig, FeedPaper, FeedState } from '#lib/types.js';
import { feedTopics, filterFeed, priorityCounts, toTriage } from './filter';
import { FeedStore } from './store';

class Feed {
	papers = $state.raw<FeedPaper[]>([]);
	config = $state.raw<FeedConfig | null>(null);
	state = $state.raw<FeedState | null>(null);
	loaded = $state(false);
	error = $state<string | null>(null);

	// The view's filters (P1–P3 by default, as arxiv_fetch's browser).
	query = $state('');
	sort = $state<'date' | 'priority'>('date');
	priorities = $state.raw<ReadonlySet<number>>(new Set([1, 2, 3]));
	topics = $state.raw<ReadonlySet<string>>(new Set());
	dismissed = $state(false);

	visible = $derived(filterFeed(this.papers, { query: this.query, sort: this.sort, priorities: this.priorities, topics: this.topics, dismissed: this.dismissed }));
	counts = $derived(priorityCounts(this.papers));
	allTopics = $derived(feedTopics(this.papers));
	dismissedCount = $derived(this.papers.filter((p) => p.dismissed).length);
	triage = $derived(toTriage(this.papers));

	/** The store of the open library (null before one is open). */
	get store() {
		return library.repo ? new FeedStore(library.repo.fs) : null;
	}

	#loading: Promise<void> | null = null;

	/** (Re)read the feed from the library folder; one read at a time. */
	load() {
		const store = this.store;
		if (!store) return Promise.resolve();
		this.#loading ??= (async () => {
			try {
				const [papers, config, state] = await Promise.all([store.readAll(), store.readConfig(), store.readState()]);
				this.papers = papers;
				this.config = config;
				this.state = state;
				this.error = null;
			} catch (e) {
				this.error = e instanceof Error ? e.message : String(e);
			} finally {
				this.loaded = true;
				this.#loading = null;
			}
		})();
		return this.#loading;
	}

	togglePriority(n: number) {
		const next = new Set(this.priorities);
		if (!next.delete(n)) next.add(n);
		this.priorities = next;
	}

	toggleTopic(t: string) {
		const next = new Set(this.topics);
		if (!next.delete(t)) next.add(t);
		this.topics = next;
	}

	/** A paper changed on disk: show its new version. */
	replace(paper: FeedPaper) {
		this.papers = this.papers.map((p) => (p.id === paper.id ? paper : p));
	}

	/** Papers being added to the library (their PDF downloading). */
	adding = $state.raw<ReadonlySet<string>>(new Set());

	/** The library paper a feed paper was added as, while it's still in the library. */
	inLibrary = (p: FeedPaper) => (p.added ? library.get(p.added) : undefined) ?? library.papers.find((x) => x.arxiv === p.id);

	/**
	 * Into the library (the PDF from arXiv, metadata as for any arXiv link), its topics
	 * as tags; the feed remembers which paper it became. Already there: linked, not copied.
	 */
	async add(p: FeedPaper) {
		if (this.adding.has(p.id)) return;
		this.adding = new Set([...this.adding, p.id]);
		try {
			const { id, existed } = await library.importArxiv(p.id);
			if (p.topics.length) await library.update(id, (cur) => ({ tags: [...new Set([...(cur.tags ?? []), ...p.topics])] }));
			const updated = await this.store?.update(p, { added: id });
			if (updated) this.replace(updated);
			toast(existed ? 'Already in your library' : 'Added to your library', 'info', { label: 'Open', run: () => openPaper(id, p.title) });
		} catch (e) {
			toast(`Couldn’t add “${p.title}”: ${e instanceof Error ? e.message : e}`, 'error');
		} finally {
			const next = new Set(this.adding);
			next.delete(p.id);
			this.adding = next;
		}
	}

	/** Out of the feed (kept, so a later check never brings it back); undo in the toast. */
	async dismiss(p: FeedPaper) {
		try {
			const updated = await this.store?.update(p, { dismissed: new Date().toISOString() });
			if (updated) this.replace(updated);
			toast('Dismissed', 'info', { label: 'Undo', run: () => void this.restore(p) });
		} catch (e) {
			toast(`Couldn’t dismiss: ${e instanceof Error ? e.message : e}`, 'error');
		}
	}

	async restore(p: FeedPaper) {
		try {
			const updated = await this.store?.update(p, { dismissed: undefined });
			if (updated) this.replace(updated);
		} catch (e) {
			toast(`Couldn’t restore: ${e instanceof Error ? e.message : e}`, 'error');
		}
	}
}

export const feed = new Feed();
