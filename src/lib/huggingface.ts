// Hugging Face paper page for an arXiv paper: upvotes, project page, GitHub,
// and the models / datasets / Spaces that cite it. One request (CORS-enabled).
import type { HfLinks } from './types';

/** How many example repos to keep per kind (the rest are on the HF page). */
const TOP = 5;

/** Author-controlled links: https only. */
const httpsOnly = (url: string | undefined) => (url && URL.parse(url)?.protocol === 'https:' ? url : undefined);

type Repo = { id: string };
interface HfPaperResponse {
	title?: string;
	authors?: { name?: string }[];
	upvotes?: number;
	projectPage?: string;
	githubRepo?: string;
	githubStars?: number;
	linkedModels?: Repo[];
	linkedDatasets?: Repo[];
	linkedSpaces?: Repo[];
	numTotalModels?: number;
	numTotalDatasets?: number;
	numTotalSpaces?: number;
}

/** null: Hugging Face has no page for this paper (checked now). */
export async function fetchHfPaper(arxiv: string, signal?: AbortSignal): Promise<HfLinks | null> {
	const res = await fetch(`https://huggingface.co/api/papers/${arxiv}`, { signal });
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`Hugging Face: HTTP ${res.status}`);
	const d = (await res.json()) as HfPaperResponse;
	const repos = (list: Repo[] | undefined, total: number | undefined) =>
		total ? { total, top: (list ?? []).slice(0, TOP).map((r) => r.id) } : undefined;
	return {
		page: `https://huggingface.co/papers/${arxiv}`,
		title: d.title?.replace(/\s+/g, ' ').trim() || undefined,
		authors: d.authors?.map((a) => a.name?.trim()).filter((n): n is string => !!n),
		upvotes: d.upvotes,
		project: httpsOnly(d.projectPage),
		github: httpsOnly(d.githubRepo),
		githubStars: d.githubStars,
		models: repos(d.linkedModels, d.numTotalModels),
		datasets: repos(d.linkedDatasets, d.numTotalDatasets),
		spaces: repos(d.linkedSpaces, d.numTotalSpaces)
	};
}

/** Hugging Face listing of every repo of a kind citing the paper. */
export const hfListUrl = (kind: 'models' | 'datasets' | 'spaces', arxiv: string) => `https://huggingface.co/${kind}?other=arxiv:${arxiv}`;
