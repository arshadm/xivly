import { describe, expect, it } from 'vitest';
import { checkManifest, manifestIds } from './manifest';

const files = (...paths: string[]) => ({ files: paths.map((path) => ({ path, size: 1 })) });

describe('example library manifest', () => {
	it('accepts paper files and lists their papers', () => {
		const m = files('papers/a-1/paper.pdf', 'papers/a-1/paper.json', 'papers/b/paper.pdf');
		expect(() => checkManifest(m)).not.toThrow();
		expect(manifestIds(m)).toEqual(['a-1', 'b']);
	});
	it.each(['.xivly/hooks/paper-added', 'papers/a/../../x', 'papers/a/notes.md', 'papers/A/paper.pdf', 'AGENTS.md'])('refuses %s', (path) => {
		expect(() => checkManifest(files('papers/ok/paper.pdf', path))).toThrow(/Unexpected file/);
	});
});
