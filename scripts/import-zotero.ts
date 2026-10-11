// Import a Zotero library into a Xivly library, once (or again: papers already
// there are skipped):
//
//   bun scripts/import-zotero.ts [--zotero ~/Zotero] [--library <dir>] [--write] [--force]
//
// Without --write it only says what it would do. Zotero is never written to (its
// database is read from a copy, so it can stay open). Xivly should be closed while
// it writes (--force: write anyway). The library defaults to the app's (config.json).
//
// Each Zotero item with a PDF becomes a paper folder: its details in paper.json,
// its highlights and comments (kept by Zotero in its database, not in the PDF)
// written into the PDF as Xivly annotations, your own notes in notes.json.
// Collections: the top level ("03 - Mlsys") is the category, sub-collections are
// tags; "Reading" → Reading now, "To Read" → Up next (in the collection's order),
// "Done" (at any level) → read. A paper already in the library (same arXiv id, DOI,
// PDF or title) is skipped, so is a Zotero item imported before.
import { Database } from 'bun:sqlite';
import { plugin } from 'bun';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// The app's modules import each other as `#lib/….js`.
plugin({
	name: 'lib',
	setup(b) {
		b.onResolve({ filter: /^#lib\// }, (a) => ({
			path: resolve(import.meta.dir, '../src/lib', a.path.slice(5).replace(/\.js$/, '.ts'))
		}));
	}
});
const { notesToMarkdown } = await import('../src/lib/notes/markdown.ts');
const { exportPdf, importAnnotations } = await import('svelte-pdf-mini/pdf-codec');

// ── Options ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opt = (name: string) => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : undefined;
};
const write = args.includes('--write');
const zoteroDir = resolve((opt('--zotero') ?? join(homedir(), 'Zotero')).replace(/^~/, homedir()));
const configured = (() => {
	try {
		return JSON.parse(readFileSync(join(homedir(), 'Library/Application Support/io.github.arshadm.xivly/config.json'), 'utf8')).library as string;
	} catch {
		return undefined;
	}
})();
const libraryDir = resolve((opt('--library') ?? configured ?? '').replace(/^~/, homedir()));
if (!existsSync(join(libraryDir, '.xivly/library.json'))) throw new Error(`Not a Xivly library: ${libraryDir} (pass --library)`);
if (write && !args.includes('--force')) {
	// The app's process, if it's open (exit 0: found).
	const running = Bun.spawnSync(['pgrep', '-x', 'Xivly']).exitCode === 0;
	if (running) throw new Error('Xivly is open: quit it first (or pass --force)');
}

// ── Zotero, read from a copy ───────────────────────────────────────────
const copy = join(tmpdir(), `xivly-zotero-${process.pid}.sqlite`);
copyFileSync(join(zoteroDir, 'zotero.sqlite'), copy);
const db = new Database(copy, { readonly: true });
const all = <T>(sql: string) => db.query(sql).all() as T[];

type Row = {
	itemID: number;
	key: string;
	type: string;
	dateAdded: string;
	dateModified: string;
};
const items = all<Row>(
	`select i.itemID, i.key, t.typeName as type, i.dateAdded, i.dateModified from items i join itemTypes t using(itemTypeID) where i.itemID not in (select itemID from deletedItems)`
);
const byId = new Map(items.map((i) => [i.itemID, i]));
const fields = new Map<number, Record<string, string>>();
for (const r of all<{ itemID: number; field: string; value: string }>(
	`select d.itemID, f.fieldName as field, v.value from itemData d join fields f using(fieldID) join itemDataValues v using(valueID)`
)) {
	const f = fields.get(r.itemID) ?? {};
	f[r.field] = String(r.value);
	fields.set(r.itemID, f);
}
const creators = new Map<number, string[]>();
for (const r of all<{
	itemID: number;
	first: string;
	last: string;
	type: string;
}>(
	`select ic.itemID, c.firstName as first, c.lastName as last, ct.creatorType as type from itemCreators ic join creators c using(creatorID) join creatorTypes ct using(creatorTypeID) where ct.creatorType in ('author', 'bookAuthor') order by ic.itemID, ic.orderIndex`
)) {
	creators.set(r.itemID, [...(creators.get(r.itemID) ?? []), [r.first, r.last].filter(Boolean).join(' ')]);
}
type Attachment = {
	itemID: number;
	parentItemID: number | null;
	key: string;
	path: string;
	dateAdded: string;
};
const pdfs = all<Attachment>(
	`select a.itemID, a.parentItemID, i.key, a.path, i.dateAdded from itemAttachments a join items i using(itemID) where a.contentType = 'application/pdf' and a.linkMode in (0, 1) and a.itemID not in (select itemID from deletedItems)`
);
type ZAnnotation = {
	parentItemID: number;
	type: number;
	text: string | null;
	comment: string | null;
	color: string | null;
	position: string;
	dateAdded: string;
	dateModified: string;
};
const annotations = new Map<number, ZAnnotation[]>();
for (const a of all<ZAnnotation>(
	`select n.parentItemID, n.type, n.text, n.comment, n.color, n.position, i.dateAdded, i.dateModified from itemAnnotations n join items i using(itemID) where n.itemID not in (select itemID from deletedItems) order by n.sortIndex`
))
	annotations.set(a.parentItemID, [...(annotations.get(a.parentItemID) ?? []), a]);
const notes = new Map<number, string[]>();
for (const n of all<{ parentItemID: number; note: string }>(`select parentItemID, note from itemNotes where parentItemID is not null and itemID not in (select itemID from deletedItems)`))
	notes.set(n.parentItemID, [...(notes.get(n.parentItemID) ?? []), n.note]);
type Collection = { id: number; name: string; parent: number | null };
const collections = new Map(
	all<{
		collectionID: number;
		collectionName: string;
		parentCollectionID: number | null;
	}>(`select * from collections`).map((c) => [
		c.collectionID,
		{
			id: c.collectionID,
			name: c.collectionName,
			parent: c.parentCollectionID
		}
	])
);
const memberships = all<{
	collectionID: number;
	itemID: number;
	orderIndex: number;
}>(`select collectionID, itemID, orderIndex from collectionItems`);
db.close();

// ── Collections → category, tags, reading list ─────────────────────────
const bare = (name: string) => name.replace(/^\d+\s*-\s*/, '').trim();
const slug = (s: string, fallback = 'paper') =>
	s
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80)
		.replace(/-+$/, '') || fallback;
const special = (name: string) => ({ reading: 'reading', 'to read': 'queue', done: 'done' })[bare(name).toLowerCase()] as 'reading' | 'queue' | 'done' | undefined;
const pathOf = (c: Collection): Collection[] => (c.parent && collections.get(c.parent) ? [...pathOf(collections.get(c.parent)!), c] : [c]);

interface Placement {
	category?: string;
	tags: string[];
	reading: boolean;
	queue?: number;
	done: boolean;
}
function place(itemID: number): Placement {
	const mine = memberships.filter((m) => m.itemID === itemID).map((m) => ({ m, path: pathOf(collections.get(m.collectionID)!) }));
	// Topics in the collections' own order (their number prefixes).
	mine.sort((a, b) =>
		a.path
			.map((c) => c.name)
			.join('/')
			.localeCompare(b.path.map((c) => c.name).join('/'), undefined, {
				numeric: true
			})
	);
	const p: Placement = { tags: [], reading: false, done: false };
	for (const { m, path } of mine) {
		const kinds = path.map((c) => special(c.name));
		if (kinds.includes('done')) p.done = true;
		if (kinds[0] === 'reading') p.reading = true;
		if (kinds[0] === 'queue') p.queue = m.orderIndex;
		if (kinds[0]) continue;
		const [top, ...subs] = path.filter((c) => !special(c.name));
		if (!p.category) p.category = bare(top.name);
		else p.tags.push(slug(bare(top.name)));
		p.tags.push(...subs.map((c) => slug(bare(c.name))));
	}
	p.tags = [...new Set(p.tags)];
	return p;
}

// ── Details ────────────────────────────────────────────────────────────
const arxivOf = (f: Record<string, string>) => {
	const sources = [f.archiveID, f.url, f.DOI, f.extra].filter(Boolean).join(' ');
	const m = /(?:arxiv[:./]|abs\/|pdf\/)\s*(\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z]{2})?\/\d{7})/i.exec(sources);
	return m?.[1].replace(/v\d+$/, '');
};
const isoOf = (sqlDate: string) => new Date(`${sqlDate.replace(' ', 'T')}Z`).toISOString();
const dateOf = (raw: string | undefined) => {
	const d = raw?.split(' ')[0].replace(/(-00)+$/, '');
	return d && /^\d{4}(-\d{2}){0,2}$/.test(d) ? d : undefined;
};
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const normTitle = (t: string) =>
	t
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();

// ── Notes: your own (Zotero's arXiv "Comment:" / "Other" notes are left out) ──
const decode = (s: string) =>
	s
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();
const isMetadataNote = (html: string) => /^<div[^>]*>\s*(Comment:|<h2>Other<\/h2>)/i.test(html.trim());
const text = (s: string) => (s ? [{ type: 'text', text: s }] : undefined);
function noteToBlocks(html: string): unknown[] {
	const blocks: unknown[] = [];
	const re = /<(h[1-6]|p|blockquote|ul|ol|pre)\b[^>]*>([\s\S]*?)<\/\1>/gi;
	for (const [, tag, inner] of html.matchAll(re)) {
		const t = tag.toLowerCase();
		if (t === 'ul' || t === 'ol') {
			const items = [...inner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(([, li]) => ({
				type: 'listItem',
				content: [{ type: 'paragraph', content: text(decode(li)) }]
			}));
			if (items.length)
				blocks.push({
					type: t === 'ul' ? 'bulletList' : 'orderedList',
					content: items
				});
		} else if (t.startsWith('h'))
			blocks.push({
				type: 'heading',
				attrs: { level: Math.min(3, Math.max(1, Number(t[1]) - 1)) },
				content: text(decode(inner))
			});
		else if (t === 'pre')
			blocks.push({
				type: 'codeBlock',
				content: text(inner.replace(/<[^>]+>/g, ''))
			});
		else if (decode(inner)) blocks.push({ type: 'paragraph', content: text(decode(inner)) });
	}
	if (!blocks.length && decode(html)) blocks.push({ type: 'paragraph', content: text(decode(html)) });
	return blocks;
}

// ── Highlights → Xivly annotations ─────────────────────────────────────
// Zotero's palette, as the nearest of Xivly's (so themes recolor them).
const palette: Record<string, [string, [number, number, number]]> = {
	yellow: ['yellow', [1, 0.835, 0.29]],
	green: ['green', [0.494, 0.878, 0.69]],
	blue: ['blue', [0.561, 0.722, 0.961]],
	pink: ['pink', [0.961, 0.608, 0.69]],
	purple: ['purple', [0.765, 0.627, 0.941]],
	orange: ['orange', [1, 0.69, 0.439]],
	red: ['red', [0.941, 0.42, 0.42]],
	gray: ['gray', [0.659, 0.635, 0.62]]
};
const zoteroColors: Record<string, string> = {
	'#ffd400': 'yellow',
	'#fefbce': 'yellow',
	'#ff6666': 'red',
	'#5fb236': 'green',
	'#2ea8e5': 'blue',
	'#a28ae5': 'purple',
	'#e56eee': 'pink',
	'#f19837': 'orange',
	'#aaaaaa': 'gray'
};
const colorOf = (hex: string | null) => palette[zoteroColors[(hex ?? '').toLowerCase()] ?? 'yellow'];

function toAnnotation(z: ZAnnotation): Record<string, unknown> | null {
	let pos: { pageIndex: number; rects?: number[][] };
	try {
		pos = JSON.parse(z.position);
	} catch {
		return null;
	}
	const rects = (pos.rects ?? []).filter((r) => r.length === 4);
	if (!rects.length || typeof pos.pageIndex !== 'number') return null;
	const [paletteKey, color] = colorOf(z.color);
	const bounds = [Math.min(...rects.map((r) => r[0])), Math.min(...rects.map((r) => r[1])), Math.max(...rects.map((r) => r[2])), Math.max(...rects.map((r) => r[3]))];
	const base = {
		id: randomUUID(),
		page: pos.pageIndex + 1,
		color,
		paletteKey,
		opacity: 1,
		origin: 'local',
		createdAt: isoOf(z.dateAdded),
		modifiedAt: isoOf(z.dateModified),
		...(z.comment?.trim() && { contents: z.comment.trim() })
	};
	// 1 highlight, 2 note, 3 image (a box), 5 underline; ink (4) and text (6) are left out.
	if (z.type === 1 || z.type === 5)
		return {
			...base,
			kind: z.type === 1 ? 'highlight' : 'underline',
			// Quad points in Z order: top-left, top-right, bottom-left, bottom-right.
			quads: rects.map(([x1, y1, x2, y2]) => [x1, y2, x2, y2, x1, y1, x2, y1]),
			rect: [bounds[0] - 1, bounds[1] - 1, bounds[2] + 1, bounds[3] + 1],
			...(z.text && { quote: { exact: z.text } })
		};
	if (z.type === 2) return { ...base, kind: 'note', icon: 'Comment', rect: bounds };
	if (z.type === 3) return { ...base, kind: 'area', rect: bounds };
	return null;
}

// ── The library as it is ───────────────────────────────────────────────
const papersDir = join(libraryDir, 'papers');
const existing = readdirSync(papersDir, { withFileTypes: true })
	.filter((e) => e.isDirectory() && !e.name.startsWith('.'))
	.map((e) => {
		try {
			return {
				id: e.name,
				...JSON.parse(readFileSync(join(papersDir, e.name, 'paper.json'), 'utf8'))
			};
		} catch {
			return { id: e.name };
		}
	});
const seen = {
	arxiv: new Set(existing.map((p) => p.arxiv).filter(Boolean)),
	doi: new Set(existing.map((p) => p.doi?.toLowerCase()).filter(Boolean)),
	sha: new Set(existing.map((p) => p.sha256).filter(Boolean)),
	title: new Set(existing.map((p) => p.title && normTitle(p.title)).filter(Boolean)),
	zotero: new Set(existing.map((p) => p.zotero?.key).filter(Boolean)),
	ids: new Set(existing.map((p) => p.id))
};
let lastRank = Math.max(-1, ...existing.map((p) => (typeof p.queue === 'number' ? p.queue : -1)));
const libraryFile = JSON.parse(readFileSync(join(libraryDir, '.xivly/library.json'), 'utf8'));
const categories: { id: string; name: string; color: string }[] = libraryFile.categories ?? [];

// ── The plan ───────────────────────────────────────────────────────────
interface Planned {
	id: string;
	meta: Record<string, unknown>;
	pdf: string;
	annotations: Record<string, unknown>[];
	notes: unknown[];
	queueOrder?: number;
}
const planned: Planned[] = [];
const skipped: { title: string; why: string }[] = [];
const missing: string[] = [];

// One PDF per item: the one with the most highlights, else the first added.
const pdfFor = new Map<number, Attachment>();
for (const a of pdfs.toSorted((x, y) => x.dateAdded.localeCompare(y.dateAdded))) {
	if (a.parentItemID === null) continue;
	const cur = pdfFor.get(a.parentItemID);
	if (!cur || (annotations.get(a.itemID)?.length ?? 0) > (annotations.get(cur.itemID)?.length ?? 0)) pdfFor.set(a.parentItemID, a);
}
const sources: { item: Row; pdf: Attachment; f: Record<string, string> }[] = [
	...[...pdfFor]
		.map(([parent, pdf]) => ({
			item: byId.get(parent)!,
			pdf,
			f: fields.get(parent) ?? {}
		}))
		.filter((s) => s.item),
	// PDFs on their own (no Zotero entry): their attachment's title, or the file name.
	...pdfs
		.filter((a) => a.parentItemID === null)
		.map((pdf) => ({
			item: byId.get(pdf.itemID)!,
			pdf,
			f: fields.get(pdf.itemID) ?? {}
		}))
];

for (const { item, pdf, f } of sources) {
	const file = join(zoteroDir, 'storage', pdf.key, pdf.path.replace(/^storage:/, ''));
	const title = (f.title || pdf.path.replace(/^storage:/, '').replace(/\.pdf$/i, '')).trim();
	if (!existsSync(file)) {
		missing.push(title);
		continue;
	}
	const bytes = readFileSync(file);
	const arxiv = arxivOf(f);
	const doi = f.DOI?.toLowerCase();
	const hash = sha(bytes);
	const why = seen.zotero.has(item.key)
		? 'imported before'
		: arxiv && seen.arxiv.has(arxiv)
			? `arXiv ${arxiv} is in the library (or imported just now)`
			: doi && seen.doi.has(doi)
				? `DOI ${doi} is in the library (or imported just now)`
				: seen.sha.has(hash)
					? 'the same PDF is in the library'
					: seen.title.has(normTitle(title))
						? 'a paper with this title is in the library'
						: null;
	if (why) {
		skipped.push({ title, why });
		continue;
	}
	for (const [set, v] of [
		[seen.arxiv, arxiv],
		[seen.doi, doi],
		[seen.sha, hash],
		[seen.title, normTitle(title)],
		[seen.zotero, item.key]
	] as const)
		if (v) set.add(v);

	const date = dateOf(f.date);
	const year = date ? Number(date.slice(0, 4)) : undefined;
	let id = slug(year ? `${year} ${title}` : title);
	for (let n = 2; seen.ids.has(id); n++) id = `${slug(year ? `${year} ${title}` : title).slice(0, 76)}-${n}`;
	seen.ids.add(id);

	const where = place(item.itemID);
	const links = f.url && !/arxiv\.org|doi\.org/.test(f.url) ? { other: [f.url] } : undefined;
	const meta: Record<string, unknown> = {
		title,
		added: isoOf(item.dateAdded),
		sha256: hash,
		...(creators.get(item.itemID)?.length && {
			authors: creators.get(item.itemID)
		}),
		...(year && { year }),
		...(date && { date }),
		...(f.abstractNote && { abstract: f.abstractNote }),
		...(f.DOI && { doi: f.DOI }),
		...(arxiv && { arxiv }),
		...((f.publicationTitle || f.proceedingsTitle || f.conferenceName) && {
			venue: f.publicationTitle || f.proceedingsTitle || f.conferenceName
		}),
		...(links && { links }),
		...(where.tags.length && { tags: where.tags }),
		...(where.done && { read: isoOf(item.dateModified) }),
		...(!where.done && where.reading && { reading: new Date().toISOString() }),
		zotero: { key: item.key }
	};
	if (where.category) {
		let cat = categories.find((c) => c.name.toLowerCase() === where.category!.toLowerCase());
		if (!cat) {
			const used = new Set(categories.map((c) => c.color));
			const colors = ['sage', 'lavender', 'sand', 'sky', 'clay', 'rose', 'mint', 'stone'];
			let cid = slug(where.category, 'category');
			for (let n = 2; categories.some((c) => c.id === cid); n++) cid = `${slug(where.category, 'category')}-${n}`;
			cat = {
				id: cid,
				name: where.category,
				color: colors.find((c) => !used.has(c)) ?? colors[categories.length % colors.length]
			};
			categories.push(cat);
		}
		meta.category = cat.id;
	}
	const ownNotes = (notes.get(item.itemID) ?? []).filter((n) => !isMetadataNote(n));
	planned.push({
		id,
		meta,
		pdf: file,
		annotations: (annotations.get(pdf.itemID) ?? []).map(toAnnotation).filter((a): a is Record<string, unknown> => !!a),
		notes: ownNotes.flatMap((n, i) => [...(i ? [{ type: 'horizontalRule' }] : []), ...noteToBlocks(n)]),
		queueOrder: !where.done && !where.reading ? where.queue : undefined
	});
}
// Up next: in the "To Read" collection's order, after what's queued already.
for (const p of planned.filter((p) => p.queueOrder !== undefined).sort((a, b) => a.queueOrder! - b.queueOrder!)) p.meta.queue = ++lastRank;

// ── Report ─────────────────────────────────────────────────────────────
const count = (fn: (p: Planned) => unknown) => planned.filter(fn).length;
const byCategory = new Map<string, number>();
for (const p of planned)
	byCategory.set(String(categories.find((c) => c.id === p.meta.category)?.name ?? '(none)'), (byCategory.get(String(categories.find((c) => c.id === p.meta.category)?.name ?? '(none)')) ?? 0) + 1);
console.log(`Zotero: ${zoteroDir}\nLibrary: ${libraryDir}\n`);
console.log(`To import: ${planned.length} papers`);
console.log(`  reading now ${count((p) => p.meta.reading)}, up next ${count((p) => p.meta.queue !== undefined)}, read ${count((p) => p.meta.read)}`);
console.log(`  with highlights ${count((p) => p.annotations.length)} (${planned.reduce((n, p) => n + p.annotations.length, 0)} annotations), with notes ${count((p) => p.notes.length)}`);
console.log(
	`  categories: ${[...byCategory]
		.sort((a, b) => b[1] - a[1])
		.map(([k, v]) => `${k} ${v}`)
		.join(', ')}`
);
console.log(
	`  new categories: ${
		categories
			.filter((c) => !(libraryFile.categories ?? []).some((o: { id: string }) => o.id === c.id))
			.map((c) => c.name)
			.join(', ') || 'none'
	}`
);
console.log(`Skipped: ${skipped.length}`);
for (const s of skipped) console.log(`  ${s.title} — ${s.why}`);
if (missing.length) console.log(`PDF file missing: ${missing.length}\n${missing.map((m) => `  ${m}`).join('\n')}`);

if (!write) {
	console.log('\nNothing written (dry run): add --write to import.');
	process.exit(0);
}

// ── Write ──────────────────────────────────────────────────────────────
const writeAtomic = (path: string, data: string | Uint8Array) => {
	const tmp = join(path, `../.${path.split('/').pop()}.${process.pid}.xivly-tmp`);
	writeFileSync(tmp, data);
	renameSync(tmp, path);
};
const NOTES_MD_HEADER = '<!-- Written by Xivly from notes.json each time the notes are saved: edit the notes in Xivly (changes here are replaced). -->';
let done = 0;
let dupes = 0;
const failed: string[] = [];
/** Two boxes covering mostly the same place (intersection over union). */
function sameSpot([a1, b1, a2, b2]: number[], [c1, d1, c2, d2]: number[]) {
	const w = Math.min(a2, c2) - Math.max(a1, c1);
	const h = Math.min(b2, d2) - Math.max(b1, d1);
	if (w <= 0 || h <= 0) return false;
	const both = w * h;
	return both / ((a2 - a1) * (b2 - b1) + (c2 - c1) * (d2 - d1) - both) > 0.6;
}
for (const p of planned) {
	const dir = join(papersDir, p.id);
	try {
		mkdirSync(dir, { recursive: true });
		let pdf: Uint8Array = readFileSync(p.pdf);
		if (p.annotations.length) {
			try {
				// Highlights the PDF has already (exported from Zotero before?) aren't added twice.
				const inside = (await importAnnotations(pdf)).annotations as {
					page: number;
					rect: number[];
				}[];
				const fresh = p.annotations.filter((a) => !inside.some((b) => b.page === a.page && sameSpot(b.rect, a.rect as number[])));
				dupes += p.annotations.length - fresh.length;
				if (fresh.length) pdf = await exportPdf(pdf, fresh as never, { producer: 'Xivly' });
			} catch (e) {
				failed.push(`${p.meta.title}: highlights not written (${e instanceof Error ? e.message : e})`);
			}
		}
		writeAtomic(join(dir, 'paper.pdf'), pdf);
		if (p.notes.length) {
			const doc = { type: 'doc', content: p.notes };
			writeAtomic(join(dir, 'notes.json'), JSON.stringify({ version: 1, updated: new Date().toISOString(), doc }, null, 2) + '\n');
			const md = notesToMarkdown(doc as never);
			writeAtomic(join(dir, 'notes.md'), `${NOTES_MD_HEADER}\n\n${md}${md ? '\n' : ''}`);
		}
		// Last: a folder without paper.json isn't a finished import.
		writeAtomic(join(dir, 'paper.json'), JSON.stringify(p.meta, null, 2) + '\n');
		done++;
		if (done % 25 === 0) console.log(`  ${done}/${planned.length}…`);
	} catch (e) {
		failed.push(`${p.meta.title}: ${e instanceof Error ? e.message : e}`);
	}
}
writeAtomic(join(libraryDir, '.xivly/library.json'), JSON.stringify({ ...libraryFile, categories }, null, 2) + '\n');
console.log(`\nImported ${done} of ${planned.length}.${dupes ? ` ${dupes} highlights were in the PDFs already (not added again).` : ''}`);
if (failed.length) console.log(`Problems:\n${failed.map((f) => `  ${f}`).join('\n')}`);
