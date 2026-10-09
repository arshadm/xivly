import { describe, expect, it } from 'vitest';
import { imageFiles, imageMime, isPaperPath } from './images';

describe('isPaperPath', () => {
	it('relative paths inside the paper’s folder only', () => {
		expect(isPaperPath('notes-assets/ab12.png')).toBe(true);
		for (const p of ['', '/etc/passwd', '../other/paper.pdf', 'notes-assets/../../x', './a.png', 'a//b.png', 'https://x.org/a.png', 'file:a.png', 'C:\\x.png'.replace('\\', ':/')]) expect(isPaperPath(p)).toBe(false);
	});
});

describe('images', () => {
	it('the MIME type from the extension', () => {
		expect(imageMime('notes-assets/a.JPG')).toBe('image/jpeg');
		expect(imageMime('notes-assets/a.svg')).toBe('image/svg+xml');
		expect(imageMime('notes-assets/a.bin')).toBe('application/octet-stream');
	});
	it('only image files are taken from a paste or drop', () => {
		const files = [new File(['x'], 'a.png', { type: 'image/png' }), new File(['x'], 'b.pdf', { type: 'application/pdf' })];
		expect(imageFiles(files as unknown as FileList).map((f) => f.name)).toEqual(['a.png']);
		expect(imageFiles(null)).toEqual([]);
	});
});
