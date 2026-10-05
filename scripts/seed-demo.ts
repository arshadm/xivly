// Build a demo library for testing: `bun run seed [dir]` (default ./demo-library),
// then `bun run tauri:demo` opens the app on it.
//
// Real arXiv papers (metadata from the arXiv API, PDFs cached in
// ~/.cache/xivly-seed), spread over categories and tags, plus edge cases:
// an old-style arXiv id, an unknown category, a paper with no paper.json,
// an enabled hook, and an inbox of PDFs to drag in (tests extraction).
import { existsSync, mkdirSync, rmSync, writeFileSync, chmodSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import agentsMd from '../src/lib/templates/AGENTS.md' with { type: 'text' };
import sampleHook from '../src/lib/templates/paper-added.sample' with { type: 'text' };

const root = resolve(process.argv[2] ?? 'demo-library');
const inbox = `${root}-inbox`;
const cache = join(homedir(), '.cache/xivly-seed');

const categories = [
	{ id: 'vision', name: 'Vision', color: 'sage' },
	{ id: 'language', name: 'Language', color: 'sky' },
	{ id: 'generative', name: 'Generative', color: 'rose' },
	{ id: 'rl', name: 'Reinforcement learning', color: 'mint' },
	{ id: 'systems', name: 'Systems', color: 'clay' },
	{ id: 'theory', name: 'Theory', color: 'lavender' }
];

type Seed = {
	arxiv: string;
	category?: string;
	tags?: string[];
	links?: { project?: string; github?: string[]; huggingface?: string[] };
	/** Days ago it was last opened (shows in Recent). */
	opened?: number;
};

const papers: Seed[] = [
	{ arxiv: '2010.11929', category: 'vision', tags: ['transformers', 'classification'], opened: 1,
		links: { github: ['https://github.com/google-research/vision_transformer'], huggingface: ['https://huggingface.co/google/vit-base-patch16-224'] } },
	{ arxiv: '2304.07193', category: 'vision', tags: ['self-supervised', 'foundation-model'],
		links: { github: ['https://github.com/facebookresearch/dinov2'], huggingface: ['https://huggingface.co/facebook/dinov2-base'] } },
	{ arxiv: '2304.02643', category: 'vision', tags: ['segmentation', 'foundation-model'], opened: 3,
		links: { project: 'https://segment-anything.com', github: ['https://github.com/facebookresearch/segment-anything'], huggingface: ['https://huggingface.co/facebook/sam-vit-base'] } },
	{ arxiv: '1706.03762', category: 'language', tags: ['transformers', 'classic'], opened: 0 },
	{ arxiv: '1810.04805', category: 'language', tags: ['transformers', 'pretraining', 'classic'],
		links: { github: ['https://github.com/google-research/bert'], huggingface: ['https://huggingface.co/google-bert/bert-base-uncased'] } },
	{ arxiv: '2005.14165', category: 'language', tags: ['llm', 'scaling'] },
	{ arxiv: '2307.09288', category: 'language', tags: ['llm', 'open-weights'],
		links: { github: ['https://github.com/meta-llama/llama'], huggingface: ['https://huggingface.co/meta-llama/Llama-2-7b-hf'] } },
	{ arxiv: '2006.11239', category: 'generative', tags: ['diffusion', 'classic'],
		links: { project: 'https://hojonathanho.github.io/diffusion', github: ['https://github.com/hojonathanho/diffusion'] } },
	{ arxiv: '2112.10752', category: 'generative', tags: ['diffusion', 'image-generation'], opened: 2,
		links: { github: ['https://github.com/CompVis/latent-diffusion'], huggingface: ['https://huggingface.co/CompVis/stable-diffusion-v1-4'] } },
	{ arxiv: '2601.05637', category: 'generative', tags: ['controllability'],
		links: { github: ['https://github.com/apple/ml-genctrl'] } },
	{ arxiv: '1312.5602', category: 'rl', tags: ['deep-rl', 'classic'] },
	{ arxiv: '1707.06347', category: 'rl', tags: ['deep-rl', 'policy-gradient'],
		links: { github: ['https://github.com/openai/baselines'] } },
	{ arxiv: '2205.14135', category: 'systems', tags: ['attention', 'gpu'], opened: 5,
		links: { github: ['https://github.com/Dao-AILab/flash-attention'] } },
	{ arxiv: '2309.06180', category: 'systems', tags: ['llm', 'inference'],
		links: { project: 'https://vllm.ai', github: ['https://github.com/vllm-project/vllm'] } },
	{ arxiv: 'hep-th/9711200', category: 'theory', tags: ['ads-cft', 'classic'] }, // old-style id
	{ arxiv: '2106.09685', category: 'language', tags: ['llm', 'fine-tuning'],
		links: { github: ['https://github.com/microsoft/LoRA'] } },
	{ arxiv: '1512.03385', tags: ['classification', 'classic'] }, // uncategorized
	// Edge case: category id not in library.json (e.g. set by an agent) -> Uncategorized.
	{ arxiv: '2212.06817', category: 'robotics', tags: ['robotics', 'transformers'],
		links: { project: 'https://robotics-transformer1.github.io', github: ['https://github.com/google-research/robotics_transformer'] } }
];

/** Not imported: drag these into the app to test import + metadata extraction. */
const inboxPapers = ['2103.00020', '1406.2661', '2302.13971'];

// ── arXiv ─────────────────────────────────────────────────────────────────

type Meta = { title: string; authors: string[]; abstract: string; published: string; doi?: string };

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const unescape = (s: string) =>
	s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

async function arxivMeta(ids: string[]): Promise<Map<string, Meta>> {
	const url = `https://export.arxiv.org/api/query?id_list=${ids.join(',')}&max_results=${ids.length}`;
	const xml = await (await fetch(url)).text();
	const out = new Map<string, Meta>();
	for (const entry of xml.split('<entry>').slice(1)) {
		const tag = (name: string) => entry.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? '';
		const id = tag('id').replace(/^https?:\/\/arxiv\.org\/abs\//, '').replace(/v\d+$/, '');
		out.set(id, {
			// arXiv titles are LaTeX-ish: `--` dashes.
			title: unescape(clean(tag('title'))).replace(/ -- /g, ' – ').replace(/---/g, '—'),
			authors: [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => unescape(clean(m[1]))),
			abstract: unescape(clean(tag('summary'))),
			published: tag('published').slice(0, 10),
			doi: tag('arxiv:doi') || undefined
		});
	}
	return out;
}

async function pdf(id: string): Promise<string> {
	mkdirSync(cache, { recursive: true });
	const file = join(cache, `${id.replace('/', '_')}.pdf`);
	if (!existsSync(file)) {
		process.stdout.write(`  downloading ${id}… `);
		const res = await fetch(`https://arxiv.org/pdf/${id}`);
		if (!res.ok) throw new Error(`arXiv ${id}: HTTP ${res.status}`);
		writeFileSync(file, new Uint8Array(await res.arrayBuffer()));
		console.log('ok');
		await new Promise((r) => setTimeout(r, 1000)); // be polite to arXiv
	}
	return file;
}

const slugify = (s: string) =>
	s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '') || 'paper';

const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';

// ── Build ─────────────────────────────────────────────────────────────────

console.log(`Seeding ${root}`);
rmSync(root, { recursive: true, force: true });
rmSync(inbox, { recursive: true, force: true });
mkdirSync(join(root, '.xivly/hooks'), { recursive: true });
mkdirSync(join(root, 'papers'), { recursive: true });
mkdirSync(inbox, { recursive: true });

writeFileSync(join(root, '.xivly/library.json'), json({ version: 1, categories, tags: ['to-implement'] }));
writeFileSync(join(root, 'AGENTS.md'), agentsMd);
writeFileSync(join(root, 'CLAUDE.md'), '@AGENTS.md\n');
writeFileSync(join(root, '.xivly/hooks/paper-added.sample'), sampleHook);
// An enabled hook: every annotation save leaves a trace (and a toast in the app).
const hook = join(root, '.xivly/hooks/paper-saved.sh');
writeFileSync(
	hook,
	`#!/bin/sh\n# Demo hook: runs after annotations are saved into paper.pdf.\ndate "+%Y-%m-%d %H:%M:%S saved $XIVLY_PAPER_ID" >> "$XIVLY_LIBRARY/.xivly/logs/saved.log"\necho "saved $XIVLY_PAPER_ID"\n`
);
chmodSync(hook, 0o755);

const metas = await arxivMeta(papers.map((p) => p.arxiv));
const day = 86_400_000;
const now = Date.now();

for (const [i, seed] of papers.entries()) {
	const meta = metas.get(seed.arxiv);
	if (!meta) throw new Error(`No arXiv metadata for ${seed.arxiv}`);
	const year = Number(meta.published.slice(0, 4));
	const id = slugify(`${year} ${meta.title}`);
	const dir = join(root, 'papers', id);
	mkdirSync(dir, { recursive: true });
	copyFileSync(await pdf(seed.arxiv), join(dir, 'paper.pdf'));
	writeFileSync(
		join(dir, 'paper.json'),
		json({
			title: meta.title,
			authors: meta.authors,
			year,
			date: meta.published.slice(0, 7),
			abstract: meta.abstract,
			doi: meta.doi ?? `10.48550/arXiv.${seed.arxiv}`,
			arxiv: seed.arxiv,
			links: seed.links,
			category: seed.category,
			tags: seed.tags,
			// Staggered so "added" ordering is visible.
			added: new Date(now - (papers.length - i) * day).toISOString(),
			opened: seed.opened === undefined ? undefined : new Date(now - seed.opened * day).toISOString()
		})
	);
	console.log(`  ${id}`);
}

// Edge case: a PDF dropped into papers/ by hand, without paper.json.
const loose = join(root, 'papers', 'dropped-by-hand');
mkdirSync(loose, { recursive: true });
copyFileSync(await pdf('1505.04597'), join(loose, 'paper.pdf')); // U-Net
console.log('  dropped-by-hand (no paper.json)');

for (const id of inboxPapers) copyFileSync(await pdf(id), join(inbox, `${id}.pdf`));
console.log(`\nInbox (drag into the app to test extraction): ${inbox}`);
console.log(`Done: ${papers.length + 1} papers. Run: bun run tauri:demo`);
