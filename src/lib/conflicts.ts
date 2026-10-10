// Conflict copies: two devices changed a file before either change synced, and the
// sync client kept both: the other one next to it under a changed name
// (`paper (1).json`, `notes 2.json`, `paper (conflicted copy …).json`, `[Conflict]`…).
// Found by name, beside the file they're a copy of; resolved by merging the two
// (what each kept is kept), using the copy instead, or discarding it.

type Json = Record<string, unknown>;

export interface Conflict {
	/** The copy (relative to the library). */
	path: string;
	/** The file it's a copy of. */
	original: string;
	/** The paper it belongs to (the folder under papers/), if any. */
	paperId?: string;
}

const isObject = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

/** Whether `name` is a sync client's conflict copy of `original` (both plain names, in one folder). */
export function isConflictCopy(name: string, original: string): boolean {
	const dot = original.lastIndexOf('.');
	const [stem, ext] = dot > 0 ? [original.slice(0, dot), original.slice(dot)] : [original, ''];
	if (name === original || !name.startsWith(stem) || !name.toLowerCase().endsWith(ext.toLowerCase())) return false;
	const middle = name.slice(stem.length, name.length - ext.length);
	// " (1)", " 2", "_conflict-…", " (conflicted copy …)", " [Conflict]"…
	return /^[\s_([-]/.test(middle) && /^[\s_-]*(\(\d+\)|\d+|.*conflict.*)$/i.test(middle);
}

/** The conflict copies among a folder's files (`dir`: the folder, relative to the library). */
export function conflictsIn(dir: string, names: string[]): Conflict[] {
	const paperId = /^papers\/([^/]+)$/.exec(dir)?.[1];
	const out: Conflict[] = [];
	for (const name of names) {
		const original = names.find((o) => o !== name && isConflictCopy(name, o));
		if (original) out.push({ path: `${dir}/${name}`, original: `${dir}/${original}`, ...(paperId && { paperId }) });
	}
	return out;
}

/** Whether a changed path may be a conflict copy coming or going (worth looking again). */
export const mayBeConflictCopy = (path: string) => /([\s_-]\(?\d+\)?|conflict[^/]*)(\.[^./]+)?$/i.test(path.split('/').pop() ?? '');

/** What can be done with a copy: merged into the file (JSON the app knows), or only used or discarded. */
export function conflictKind(c: Conflict): 'notes' | 'json' | 'derived' | 'file' {
	if (c.original.endsWith('/notes.json')) return 'notes';
	if (c.original.endsWith('/notes.md')) return 'derived';
	if (/(^papers\/[^/]+\/paper\.json|^\.xivly\/(library|prompts)\.json|^\.xivly\/feed\/.*\.json)$/.test(c.original)) return 'json';
	return 'file';
}

/**
 * Two versions of a JSON file as one: everything either kept. Ours wins where both
 * have a value; lists are joined (objects by `id`, else by value), objects merged.
 * (Something removed on one side only comes back: nothing is lost.)
 */
export function mergeJson(ours: unknown, theirs: unknown): unknown {
	if (isObject(ours) && isObject(theirs)) {
		const out: Json = { ...theirs, ...ours };
		for (const k of Object.keys(ours)) if (k in theirs) out[k] = mergeJson(ours[k], theirs[k]);
		return out;
	}
	if (Array.isArray(ours) && Array.isArray(theirs)) {
		const key = (v: unknown) => (isObject(v) && typeof v.id === 'string' ? `id:${v.id}` : JSON.stringify(v));
		const out = [...ours];
		const index = new Map(ours.map((v, i) => [key(v), i]));
		for (const v of theirs) {
			const i = index.get(key(v));
			if (i === undefined) index.set(key(v), out.push(v) - 1);
			else out[i] = mergeJson(out[i], v);
		}
		return out;
	}
	return ours === undefined ? theirs : ours;
}

/** Two versions of the notes as one: ours, then what only the other has, under a heading. */
export function mergeNotesDocs<D extends { type: 'doc'; content?: unknown[] }>(ours: D, theirs: D, heading = 'From the other copy'): D {
	const have = new Set((ours.content ?? []).map((b) => JSON.stringify(b)));
	const extra = (theirs.content ?? []).filter((b) => !have.has(JSON.stringify(b)));
	if (!extra.length) return ours;
	return { ...ours, content: [...(ours.content ?? []), { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: heading }] }, ...extra] };
}
