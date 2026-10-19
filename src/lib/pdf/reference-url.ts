// Where a cited paper is on the web (shift-click a citation or a reference):
// its arXiv page, its DOI, the URL written in the reference, else a search for
// its title and authors.
import type { PdfPoint, Reference } from 'svelte-pdf-mini';

/** The page for a reference: arXiv, then DOI, then its own URL, else a Google search for it. */
export function referenceUrl(r: Pick<Reference, 'raw' | 'parsed'>): string {
	const p = r.parsed;
	if (p.arxivId) return `https://arxiv.org/abs/${encodeURIComponent(p.arxivId).replace(/%2F/gi, '/')}`;
	if (p.doi) return `https://doi.org/${p.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')}`;
	if (p.url && /^https?:\/\//i.test(p.url)) return p.url;
	const title = p.title?.trim();
	const who = (p.surnames.length ? p.surnames : p.authors).slice(0, 3).join(' ');
	const q = title ? [`"${title}"`, who].filter(Boolean).join(' ') : r.raw.replace(/\s+/g, ' ').trim().slice(0, 200);
	return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

const inside = (rect: readonly number[], [x, y]: PdfPoint, pad = 1) =>
	x >= Math.min(rect[0], rect[2]) - pad && x <= Math.max(rect[0], rect[2]) + pad && y >= Math.min(rect[1], rect[3]) - pad && y <= Math.max(rect[1], rect[3]) + pad;

/** The entry of the reference list under a point of a page. */
export function referenceAt(refs: readonly Reference[], page: number, point: PdfPoint): Reference | undefined {
	return refs.find((r) => r.page === page && (r.quads.length ? r.quads.some((q) => inside([Math.min(q[0], q[4]), Math.min(q[5], q[7]), Math.max(q[2], q[6]), Math.max(q[1], q[3])], point)) : inside(r.rect, point)));
}
