// What the feed view shows, and in what order. Pure, so it can be tested.
import type { FeedPaper } from '#lib/types.js';

export interface FeedFilter {
	/** Priorities shown; 0 = not scored yet. */
	priorities: ReadonlySet<number>;
	/** Topics: a paper with any of them (none chosen: all). */
	topics: ReadonlySet<string>;
	/** Words that must all appear in the title, abstract, authors or reason. */
	query: string;
	sort: 'date' | 'priority';
	/** The dismissed papers instead of the feed. */
	dismissed: boolean;
}

const rank = (p: FeedPaper) => p.priority ?? 9;

// Built once per paper object: typing a search doesn't rebuild 2,000 abstracts.
const haystacks = new WeakMap<FeedPaper, string>();
function haystack(p: FeedPaper) {
	let h = haystacks.get(p);
	if (h === undefined) {
		h = [p.title, p.abstract, p.authors.join(' '), p.rationale ?? '', p.id].join(' ').toLowerCase();
		haystacks.set(p, h);
	}
	return h;
}

export function filterFeed(papers: readonly FeedPaper[], f: FeedFilter): FeedPaper[] {
	const words = f.query.toLowerCase().split(/\s+/).filter(Boolean);
	const list = papers.filter((p) => {
		if (!!p.dismissed !== f.dismissed) return false;
		// The dismissed list shows them all: what was dismissed is what's being looked for.
		if (!f.dismissed && !f.priorities.has(p.priority ?? 0)) return false;
		if (f.topics.size && !p.topics.some((t) => f.topics.has(t))) return false;
		return words.every((w) => haystack(p).includes(w));
	});
	return list.sort((a, b) =>
		f.sort === 'priority' ? rank(a) - rank(b) || b.published.localeCompare(a.published) || a.id.localeCompare(b.id) : b.published.localeCompare(a.published) || rank(a) - rank(b) || a.id.localeCompare(b.id)
	);
}

/** Consecutive papers of the same day, as the view groups them (newest-first sort). */
export function byDay(papers: readonly FeedPaper[]): { day: string; papers: FeedPaper[] }[] {
	const out: { day: string; papers: FeedPaper[] }[] = [];
	for (const p of papers) {
		const last = out.at(-1);
		if (last?.day === p.published) last.papers.push(p);
		else out.push({ day: p.published, papers: [p] });
	}
	return out;
}

/** Papers in the feed (not dismissed) per priority (0: not scored). */
export function priorityCounts(papers: readonly FeedPaper[]): Record<number, number> {
	const out: Record<number, number> = {};
	for (const p of papers) if (!p.dismissed) out[p.priority ?? 0] = (out[p.priority ?? 0] ?? 0) + 1;
	return out;
}

/** Every topic papers have, sorted. */
export const feedTopics = (papers: readonly FeedPaper[]) => [...new Set(papers.flatMap((p) => p.topics))].sort();

/** Still to look at: in the feed, P1–P3, not added to the library. */
export const toTriage = (papers: readonly FeedPaper[]) => papers.filter((p) => !p.dismissed && !p.added && !!p.priority && p.priority <= 3).length;
