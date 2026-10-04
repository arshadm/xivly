import type { Paper } from './types';

/** BibTeX entry for a paper (arXiv-style when it has an arXiv id). */
export function bibtex(p: Paper): string {
	const first = p.authors?.[0]?.split(' ').at(-1)?.toLowerCase().replace(/[^a-z]/g, '') ?? 'anon';
	const word = p.title.toLowerCase().split(/\W+/).find((w) => w.length > 3) ?? 'paper';
	const fields: [string, string | number | undefined][] = [
		['title', `{${p.title}}`],
		['author', p.authors?.join(' and ')],
		['year', p.year],
		['eprint', p.arxiv],
		['archivePrefix', p.arxiv ? 'arXiv' : undefined],
		['doi', p.doi],
		['url', p.arxiv ? `https://arxiv.org/abs/${p.arxiv}` : p.doi ? `https://doi.org/${p.doi}` : undefined]
	];
	const body = fields.filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `  ${k} = {${v}}`);
	return `@${p.arxiv ? 'misc' : 'article'}{${first}${p.year ?? ''}${word},\n${body.join(',\n')}\n}`;
}

/** Links for a paper, in display order. */
export function paperLinks(p: Paper) {
	return [
		p.arxiv && { label: `arXiv ${p.arxiv}`, url: `https://arxiv.org/abs/${p.arxiv}`, icon: 'icon-[lucide--file-text]' },
		p.doi && !p.arxiv && { label: 'DOI', url: `https://doi.org/${p.doi}`, icon: 'icon-[lucide--link]' },
		p.links?.project && { label: 'Project page', url: p.links.project, icon: 'icon-[lucide--globe]' },
		...(p.links?.github ?? []).map((url) => ({ label: url.replace('https://github.com/', ''), url, icon: 'icon-[lucide--github]' })),
		...(p.links?.huggingface ?? []).map((url) => ({ label: url.replace('https://huggingface.co/', ''), url, icon: 'icon-[lucide--smile]' }))
	].filter((l): l is { label: string; url: string; icon: string } => !!l);
}
