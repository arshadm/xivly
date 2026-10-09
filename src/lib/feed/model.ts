// The arXiv feed's files, as the app needs them: hand-edited or older files are
// normalized (a wrong type reads as absent), and a check's papers are merged into
// what's stored without losing scores, dismissals or the library link.
import type { FeedConfig, FeedPaper, FeedRun, FeedState } from '#lib/types.js';

type Json = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : []);
const isObject = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

export const FEED_VERSION = 1;
/** Runs kept in state.json. */
const MAX_RUNS = 50;

const DEFAULT_RUBRIC: Record<string, string> = {
	'1': 'Read this week: directly on my work.',
	'2': 'Strongly relevant: a real contribution in an adjacent area.',
	'3': 'Worth a skim: touches my areas, but the contribution is elsewhere.',
	'4': 'Marginal: mentions my keywords, contribution elsewhere.',
	'5': 'Not relevant: keyword collision only.'
};

export function normalizeFeedConfig(raw: Json | null): FeedConfig {
	const r = raw ?? {};
	const topics: Record<string, string[]> = {};
	if (isObject(r.topics)) for (const [name, terms] of Object.entries(r.topics)) if (name.trim()) topics[name.trim()] = strs(terms);
	const rubric: Record<string, string> = { ...DEFAULT_RUBRIC };
	if (isObject(r.rubric)) for (const k of ['1', '2', '3', '4', '5']) if (str(r.rubric[k])?.trim()) rubric[k] = str(r.rubric[k])!.trim();
	const field = r.searchField;
	const batch = Number(r.batchSize);
	return {
		...r,
		version: FEED_VERSION,
		categories: strs(r.categories),
		topics,
		searchField: field === 'title' || field === 'all' ? field : 'abs',
		profile: str(r.profile) ?? '',
		rubric,
		model: str(r.model)?.trim() || 'sonnet',
		batchSize: Number.isInteger(batch) && batch >= 1 && batch <= 100 ? batch : 20
	};
}

const ARXIV_ID = /^(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A feed paper from a file, or null when it isn't one (no valid id, title or day). */
export function normalizeFeedPaper(raw: unknown): FeedPaper | null {
	if (!isObject(raw)) return null;
	const id = str(raw.id)?.trim();
	const title = str(raw.title)?.trim();
	const published = str(raw.published)?.slice(0, 10);
	if (!id || !ARXIV_ID.test(id) || !title || !published || !DAY.test(published)) return null;
	const priority = Number(raw.priority);
	return {
		...raw,
		id,
		version: str(raw.version),
		title,
		authors: strs(raw.authors),
		abstract: str(raw.abstract) ?? '',
		categories: strs(raw.categories),
		topics: strs(raw.topics),
		published,
		priority: Number.isInteger(priority) && priority >= 1 && priority <= 5 ? priority : undefined,
		rationale: str(raw.rationale),
		scoredAt: str(raw.scoredAt),
		scorer: str(raw.scorer),
		firstSeen: str(raw.firstSeen) ?? '',
		dismissed: str(raw.dismissed),
		added: str(raw.added)
	};
}

export function normalizeFeedState(raw: Json | null): FeedState {
	const r = raw ?? {};
	const runs = (Array.isArray(r.runs) ? r.runs : []).filter(isObject).map(
		(x): FeedRun => ({
			started: str(x.started) ?? '',
			finished: str(x.finished),
			from: str(x.from) ?? '',
			to: str(x.to) ?? '',
			found: Number(x.found) || 0,
			new: Number(x.new) || 0,
			scored: Number(x.scored) || 0,
			status: x.status === 'ok' || x.status === 'failed' || x.status === 'cancelled' ? x.status : 'running',
			error: str(x.error)
		})
	);
	return { ...r, version: FEED_VERSION, lastTo: str(r.lastTo), runs: runs.slice(-MAX_RUNS) };
}

/** The state with a run added or replaced (by start time), the oldest dropped past the limit. */
export function withRun(state: FeedState, run: FeedRun): FeedState {
	const runs = [...state.runs.filter((r) => r.started !== run.started), run].slice(-MAX_RUNS);
	return { ...state, runs, lastTo: run.status === 'ok' && (!state.lastTo || run.to > state.lastTo) ? run.to : state.lastTo };
}

/** The month file a paper lives in. */
export const monthOf = (p: Pick<FeedPaper, 'published'>) => p.published.slice(0, 7);

/**
 * A paper found again merged into the stored one: newer metadata and version, topics
 * from both; what the user or the scorer decided (priority, reason, dismissal, library
 * link, first seen) is kept.
 */
export function mergeFeedPaper(stored: FeedPaper | undefined, found: FeedPaper): FeedPaper {
	if (!stored) return found;
	return {
		...stored,
		...found,
		topics: [...new Set([...stored.topics, ...found.topics])].sort(),
		priority: stored.priority ?? found.priority,
		rationale: stored.rationale ?? found.rationale,
		scoredAt: stored.scoredAt ?? found.scoredAt,
		scorer: stored.scorer ?? found.scorer,
		firstSeen: stored.firstSeen || found.firstSeen,
		dismissed: stored.dismissed ?? found.dismissed,
		added: stored.added ?? found.added
	};
}
