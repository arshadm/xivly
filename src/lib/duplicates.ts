// Papers already in the library: the same file, arXiv id or DOI.
import type { Paper, PaperPatch } from './types';

/** Hex SHA-256 of a PDF as imported (kept in paper.json: saving annotations later doesn't change it). */
export async function sha256(bytes: BufferSource) {
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
	return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The paper this one would duplicate, if any. */
export function findDuplicate(papers: Paper[], meta: Pick<PaperPatch, 'sha256' | 'arxiv' | 'doi'>): Paper | undefined {
	const doi = meta.doi?.toLowerCase();
	return papers.find((p) => (meta.sha256 && p.sha256 === meta.sha256) || (meta.arxiv && p.arxiv === meta.arxiv) || (doi && p.doi?.toLowerCase() === doi));
}
