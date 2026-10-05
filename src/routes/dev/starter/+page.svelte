<!--
	Starter library builder (dev only: `bun run dev`, then /dev/starter).

	Reads starter/papers.json (the annotation specs) and starter/pdfs/<arxiv>.pdf
	(compressed by scripts/starter-pdfs.sh), places every annotation, writes the
	papers through the app's own Repo (in memory), and downloads starter.zip:
	papers/<id>/{paper.pdf, paper.json} + manifest.json. Publish it as the
	`starter` GitHub release asset; the Pages deploy serves it to the app.
-->
<script lang="ts">
	import { assetUrls, exportPdf, getSharedWorker, loadPdfJs } from 'svelte-pdf-mini';
	import { extractMetadata } from '$lib/extract';
	import { fetchHfPaper } from '$lib/huggingface';
	import { betterAuthors, betterTitle } from '$lib/library.svelte';
	import { MemoryFs } from '$lib/onboarding/memory-fs';
	import { placeAnnotations, type PaperSpec } from '$lib/onboarding/place';
	import { STARTER_CATEGORIES, STARTER_TAG, type StarterManifest } from '$lib/onboarding/starter.svelte';
	import { platform } from '$lib/platform';
	import { Repo } from '$lib/repo';
	import { button } from '$lib/ui/button';

	// Fetched from the dev server (the repo's starter/ folder), never bundled: the
	// production build must not ship the starter PDFs.
	const fetchStarter = async (path: string) => {
		const res = await fetch(`/starter/${path}`);
		return res.ok ? res : null;
	};

	let log = $state<string[]>([]);
	let running = $state(false);
	const say = (line: string) => (log = [...log, line]);

	async function build() {
		running = true;
		log = [];
		try {
			const fs = new MemoryFs();
			const repo = new Repo(fs, { ...platform, runHook: undefined });
			const pdfjs = await loadPdfJs();
			const specs = (await (await fetchStarter('papers.json'))?.json()) as PaperSpec[] | undefined;
			if (!specs) throw new Error('starter/papers.json not found');
			// Older papers were "added" earlier, so "Date added" sorts like a real library.
			const start = Date.now() - specs.length * 86_400_000 * 3;
			for (const [i, s] of specs.entries()) {
				const res = await fetchStarter(`pdfs/${s.arxiv}.pdf`);
				if (!res) {
					say(`✗ ${s.arxiv}: no PDF in starter/pdfs (run scripts/starter-pdfs.sh)`);
					continue;
				}
				const bytes = new Uint8Array(await res.arrayBuffer());
				const task = pdfjs.getDocument({ ...assetUrls(pdfjs.version), data: bytes.slice(), worker: await getSharedWorker() });
				const doc = await task.promise;
				const { placed, missed } = await placeAnnotations(doc, s.annotations);
				await task.destroy();
				for (const m of missed) say(`  ! ${s.arxiv} p.${m.spec.page}: ${m.why}`);
				const annotated = await exportPdf(bytes, placed, { producer: 'Xivly' });
				const meta = await extractMetadata(annotated, { arxiv: s.arxiv, filename: `${s.arxiv}.pdf` });
				const hf = await fetchHfPaper(s.arxiv).catch(() => null);
				const { title, authors, ...hfRest } = hf ?? {};
				const links = { ...meta.links };
				if (hfRest.project && !links.project) links.project = hfRest.project;
				if (hfRest.github && !links.github?.includes(hfRest.github)) links.github = [hfRest.github, ...(links.github ?? [])];
				const paper = await repo.add(annotated, {
					...meta,
					title: betterTitle(String(meta.title ?? s.arxiv), title) ?? meta.title,
					authors: betterAuthors(meta.authors ?? undefined, authors) ?? meta.authors,
					links,
					category: s.category.toLowerCase(),
					tags: [...(s.tags ?? []), STARTER_TAG],
					read: s.read ? new Date(start + i * 3 * 86_400_000).toISOString() : undefined,
					added: new Date(start + i * 3 * 86_400_000).toISOString(),
					hf: { ...hfRest, checked: new Date().toISOString() }
				});
				say(`✓ ${paper.id}: ${placed.length}/${s.annotations.length} annotations`);
			}
			// Only the papers ship: the app merges categories into the user's own library.json.
			const files = [...fs.files].filter(([p]) => p.startsWith('papers/'));
			const manifest: StarterManifest = {
				version: 1,
				created: new Date().toISOString(),
				categories: STARTER_CATEGORIES,
				files: files.map(([path, data]) => ({ path, size: data.byteLength }))
			};
			const { zipSync, strToU8 } = await import('fflate');
			const zip = zipSync({
				'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
				// PDFs are already compressed: store them.
				...Object.fromEntries(files.map(([p, d]) => [p, [d, { level: p.endsWith('.pdf') ? 0 : 6 }]]))
			});
			const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([zip as Uint8Array<ArrayBuffer>])), download: 'starter.zip' });
			a.click();
			say(`Done: ${files.length} files, ${(zip.byteLength / 1e6).toFixed(1)} MB → starter.zip`);
		} catch (e) {
			say(`✗ ${e}`);
		} finally {
			running = false;
		}
	}
</script>

<main class="mx-auto max-w-2xl space-y-4 p-8 text-sm">
	<h1 class="font-serif text-2xl">Starter library builder</h1>
	<p class="text-stone-500">Papers from <code>starter/papers.json</code>, PDFs from <code>starter/pdfs/</code>.</p>
	<button class={button('primary')} disabled={running} onclick={build}>{running ? 'Building…' : 'Build starter.zip'}</button>
	<pre class="text-xs whitespace-pre-wrap" data-testid="log">{log.join('\n')}</pre>
</main>

