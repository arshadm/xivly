// The arXiv feed as the library window shows it: loaded from `.xivly/feed/`,
// filtered for the view. Writes (dismiss, add, checks) go through the store
// and update the list here.
import { library } from '#lib/library.svelte.js';
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
}

export const feed = new Feed();
