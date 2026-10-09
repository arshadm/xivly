// Import from the arxiv_fetch.py tool (its arxiv.db and config.json, read by
// Rust: feed_import.rs): papers with their scores and dismissals, the run
// windows (the next check carries on from the last one), and its settings.
import type { FeedConfig, FeedPaper, FeedRun } from '#lib/types.js';
import { normalizeFeedPaper } from './model';
import type { FeedStore } from './store';
import { withRun } from './model';

/** As Rust returns them: the tool's rows. */
export interface ArxivFetchExport {
	config: unknown;
	papers: {
		arxivId: string;
		version: string | null;
		title: string;
		authors: string | null;
		abstract: string | null;
		categories: string | null;
		topics: string | null;
		published: string | null;
		priority: number | null;
		rationale: string | null;
		scoredAt: string | null;
		scorerModel: string | null;
		firstSeen: string | null;
		dismissed: boolean;
		dismissedAt: string | null;
	}[];
	runs: { startedAt: string | null; finishedAt: string | null; windowFrom: string | null; windowTo: string | null; nFound: number; nNew: number; nScored: number; status: string | null }[];
}

const list = (s: string | null) =>
	(s ?? '')
		.split(',')
		.map((x) => x.trim())
		.filter(Boolean);
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The tool's config.json as feed settings (only the fields it has). */
export function configFromArxivFetch(raw: unknown): Partial<FeedConfig> | null {
	if (!isObject(raw)) return null;
	const out: Partial<FeedConfig> = {};
	if (Array.isArray(raw.categories)) out.categories = raw.categories.filter((c): c is string => typeof c === 'string');
	if (isObject(raw.topics)) out.topics = Object.fromEntries(Object.entries(raw.topics).map(([k, v]) => [k, Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : []]));
	if (raw.search_field === 'abs' || raw.search_field === 'title' || raw.search_field === 'all') out.searchField = raw.search_field;
	if (typeof raw.profile === 'string') out.profile = raw.profile;
	if (isObject(raw.priority_rubric)) out.rubric = Object.fromEntries(Object.entries(raw.priority_rubric).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
	if (isObject(raw.scorer)) {
		if (typeof raw.scorer.model === 'string') out.model = raw.scorer.model;
		if (typeof raw.scorer.batch_size === 'number') out.batchSize = raw.scorer.batch_size;
	}
	return Object.keys(out).length ? out : null;
}

/** The tool's papers as feed papers (rows that aren't valid papers are left out). */
export function papersFromArxivFetch(data: ArxivFetchExport, now = new Date().toISOString()): FeedPaper[] {
	return data.papers
		.map((r) =>
			normalizeFeedPaper({
				id: r.arxivId.replace(/v\d+$/, ''),
				version: r.version ?? undefined,
				title: r.title,
				authors: list(r.authors),
				abstract: r.abstract ?? '',
				categories: list(r.categories),
				topics: list(r.topics).sort(),
				published: r.published ?? undefined,
				priority: r.priority ?? undefined,
				rationale: r.rationale ?? undefined,
				scoredAt: r.scoredAt ?? undefined,
				scorer: r.scorerModel ?? undefined,
				firstSeen: r.firstSeen ?? now,
				dismissed: r.dismissed ? (r.dismissedAt ?? now) : undefined
			})
		)
		.filter((p): p is FeedPaper => !!p);
}

function runsFromArxivFetch(data: ArxivFetchExport): FeedRun[] {
	return data.runs
		.filter((r) => r.startedAt && r.windowFrom && r.windowTo)
		.map((r) => ({
			started: r.startedAt!,
			finished: r.finishedAt ?? undefined,
			from: r.windowFrom!,
			to: r.windowTo!,
			found: r.nFound,
			new: r.nNew,
			scored: r.nScored,
			status: r.status === 'ok' || r.status === 'failed' ? r.status : 'cancelled'
		}));
}

export interface ImportResult {
	papers: number;
	added: number;
	scored: number;
	dismissed: number;
	config: boolean;
}

/**
 * Into the feed: papers merged (decisions already made in Xivly win), runs added (the
 * next check starts where the tool's last one stopped), and the settings when `withConfig`.
 */
export async function importArxivFetch(store: FeedStore, data: ArxivFetchExport, withConfig: boolean): Promise<ImportResult> {
	const papers = papersFromArxivFetch(data);
	const { added } = await store.upsert(papers);
	const runs = runsFromArxivFetch(data);
	if (runs.length) await store.updateState((s) => runs.reduce(withRun, s));
	const config = withConfig ? configFromArxivFetch(data.config) : null;
	if (config) await store.writeConfig({ ...(await store.readConfig()), ...config });
	await store.updateState((s) => ({ ...s, refreshed: { at: new Date().toISOString(), added } }));
	return { papers: papers.length, added, scored: papers.filter((p) => p.priority).length, dismissed: papers.filter((p) => p.dismissed).length, config: !!config };
}
