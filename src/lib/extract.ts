// Metadata extraction for a freshly imported PDF.
//
// svelte-pdf-mini's `analyzePaper` gives title/authors/abstract/arXiv/DOI;
// on top of that we look for code/model/project links and a year.
// TODO(svelte-pdf-mini): upstream link + year detection
// into `core/paper/meta.ts` so other apps get it too.
import {
	analyzePaper,
	assetUrls,
	getSharedWorker,
	loadPdfJs,
	pdfjsPaperSource,
	type Section
} from 'svelte-pdf-mini';
import { tidyTitle } from './library-utils';
import type { PaperLinks, PaperPatch } from './types';

/** Pages scanned for the paper's *own* links (later pages cite other work). */
const HEAD_PAGES = 2;

// ASCII only: a glued `§`, `¹` or curly quote ends the URL.
const URL_RE = /\bhttps?:\/\/[^\s<>"'()[\]{}\u0080-\uffff]+|\b(?:github\.com|huggingface\.co|hf\.co)\/[^\s<>"'()[\]{}\u0080-\uffff]+/gi;
// New-style id in a filename (`2401.12345v2.pdf`), not inside a longer number.
const ARXIV_FILE_RE = /(?<![\d.])(\d{2}(?:0[1-9]|1[0-2])\.\d{4,5})(?:v\d+)?(?![\d])/;

export interface ExtractHints {
	/** Original filename (arXiv downloads are named by id). */
	filename?: string;
	/** Known arXiv id (re-extraction). */
	arxiv?: string;
}

export async function extractMetadata(bytes: Uint8Array, hints: ExtractHints = {}): Promise<PaperPatch> {
	const pdfjs = await loadPdfJs();
	const task = pdfjs.getDocument({
		// pdf.js detaches the buffer it receives.
		data: bytes.slice(),
		worker: await getSharedWorker(),
		...assetUrls(pdfjs.version)
	});
	const doc = await task.promise;

	try {
		const source = pdfjsPaperSource(doc);
		const model = await analyzePaper(source, { imageBoxes: false });
		const { meta } = model;

		// The paper's own links: anything on the first pages, and links from
		// the rest of the body (before References) that name the paper, e.g. a
		// footnote `github.com/facebookresearch/dinov2`. Other body links are
		// cited work (`…/xformers`).
		const refs = findSection(model.sections, 'references')?.page ?? doc.numPages + 1;
		const lastBody = Math.min(doc.numPages, refs);
		const head: string[] = [];
		const body: string[] = [];
		const bucket = (page: number) => (page <= HEAD_PAGES ? head : body);
		for (const l of model.links) if (l.url && l.page <= lastBody) bucket(l.page).push(l.url);
		for (let n = 1; n <= lastBody; n++) {
			// PageText spaces words by glyph geometry (footnote markers stay
			// apart: `CLIP¹`), so URLs don't swallow the next word. Rejoin URLs
			// wrapped right after `/`, `-` or `_` (not `.`: that's a sentence end).
			const text = (await source.getPageText(n)).raw.replace(/([/\-_])\n(?=\S)/g, '$1');
			bucket(n).push(...(text.match(URL_RE) ?? []));
		}
		const words = titleWords(meta.title ?? '');
		const named = (url: string) => urlParts(url).some((part) => names(part, words));

		const arxiv = meta.arxivId ?? hints.arxiv ?? hints.filename?.match(ARXIV_FILE_RE)?.[1];
		const info = (await doc.getMetadata().catch(() => null))?.info as
			| Record<string, unknown>
			| undefined;
		const { year, date } = guessDate(arxiv, info);

		const patch: PaperPatch = {
			title: tidyTitle(clean(meta.title)) || undefined,
			authors: meta.authors.length ? meta.authors : undefined,
			abstract: clean(meta.abstract) || undefined,
			doi: meta.doi ?? (arxiv ? `10.48550/arXiv.${arxiv}` : undefined),
			arxiv,
			year,
			date,
			links: classifyLinks([...head, ...body.filter(named)], words)
		};
		// Drop empty fields so we don't overwrite with nothing.
		return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
	} finally {
		await task.destroy();
	}
}

function clean(s?: string) {
	return s?.replace(/\s+/g, ' ').trim() ?? '';
}

function guessDate(arxiv: string | undefined, info?: Record<string, unknown>) {
	// arXiv ids encode YYMM: `2401.12345` and old-style `hep-th/9711200`
	// (old ids ran 1991–2007).
	const m = arxiv?.match(/^(?:[a-z-]+(?:\.[A-Z]{2})?\/)?(\d{2})(\d{2})/);
	if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
		const year = (Number(m[1]) >= 91 && arxiv!.includes('/') ? 1900 : 2000) + Number(m[1]);
		return { year, date: `${year}-${m[2]}` };
	}
	const raw = String(info?.CreationDate ?? '');
	// PDF dates: `D:YYYYMMDD…` (the `D:` prefix is optional).
	const d = raw.match(/^(?:D:)?(\d{4})(\d{2})?(\d{2})?/);
	if (d) {
		const date = [d[1], d[2], d[3]].filter(Boolean).join('-');
		return { year: Number(d[1]), date };
	}
	return { year: undefined, date: undefined };
}

/** The first section of a kind. */
function findSection(sections: Section[], kind: Section['kind']): Section | undefined {
	for (const s of sections) {
		if (s.kind === kind) return s;
		const child = findSection(s.children, kind);
		if (child) return child;
	}
}

const STOPWORDS = new Set(
	'with from without towards toward through using learning model models network networks large deep neural efficient based via their into what when where which over under paper study'.split(' ')
);

/** Distinctive title words (`DINOv2: Learning Robust…` → dinov2, robust, …), alphanumeric only. */
function titleWords(title: string) {
	return title
		.toLowerCase()
		.split(/[^a-z0-9-]+/)
		.map((w) => w.replace(/-/g, ''))
		.filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

/** Alphanumeric host labels and path segments of a URL. */
function urlParts(url: string) {
	const u = url.toLowerCase().replace(/^https?:\/\//, '');
	return u.split(/[/.?#=&]+/).map((p) => p.replace(/[^a-z0-9]/g, '')).filter(Boolean);
}

/** A URL part names the paper: `dinov2` = `dinov2`, `mlgenctrl` ⊃ `genctrl`. */
function names(part: string, words: string[]) {
	return words.some((w) => part === w || (w.length >= 5 && part.includes(w)));
}

/** A site is the paper's own: its name is a title word, or contains two of them. */
function namesSite(site: string, words: string[]) {
	return words.includes(site) || words.filter((w) => site.includes(w)).length >= 2;
}

/** Normalize, dedupe and bucket URLs. */
function classifyLinks(raw: string[], titleWords: string[] = []): PaperLinks | undefined {
	const github = new Set<string>();
	const huggingface = new Set<string>();
	const other = new Set<string>();
	let project: string | undefined;

	for (let url of raw) {
		url = url.replace(/[.,;:]+$/, '');
		if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
		let u: URL;
		try {
			u = new URL(url);
		} catch {
			continue;
		}
		const host = u.hostname.replace(/^www\./, '');
		const parts = u.pathname.split('/').filter(Boolean);

		if (host === 'github.com' && parts.length >= 2) {
			github.add(`https://github.com/${parts[0]}/${parts[1].replace(/\.git$/, '')}`);
		} else if (host === 'huggingface.co' || host === 'hf.co') {
			// /org/model, /datasets|spaces|collections/org/name, /papers/<arxiv id>
			const n = parts[0] === 'papers' ? 2 : ['datasets', 'spaces', 'collections'].includes(parts[0]) ? 3 : 2;
			if (parts.length >= n) huggingface.add(`https://huggingface.co/${parts.slice(0, n).join('/')}`);
		} else if (
			/(^|\.)github\.io$/.test(host) ||
			/project/i.test(host + u.pathname) ||
			// A site named after the paper: segment-anything.com, vllm.ai (not image-net.org)
			namesSite(host.split('.').slice(0, -1).join(''), titleWords)
		) {
			project ??= u.origin + u.pathname.replace(/\/$/, '');
		} else if (!/arxiv\.org|doi\.org|creativecommons|mailto/i.test(host)) {
			other.add(u.href);
		}
	}

	const links: PaperLinks = {
		project,
		github: github.size ? [...github] : undefined,
		huggingface: huggingface.size ? [...huggingface] : undefined,
		other: other.size ? [...other].slice(0, 10) : undefined
	};
	return Object.values(links).some(Boolean) ? links : undefined;
}
