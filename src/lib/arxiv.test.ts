import { describe, expect, it } from 'vitest';
import { parseArxiv } from './arxiv';

describe('parseArxiv', () => {
	it.each([
		['2609.38426', { id: '2609.38426', version: undefined }],
		['arXiv:2609.38426v2', { id: '2609.38426', version: 'v2' }],
		['https://arxiv.org/abs/2609.38426v3', { id: '2609.38426', version: 'v3' }],
		['https://arxiv.org/pdf/2609.38426.pdf', { id: '2609.38426', version: undefined }],
		['https://huggingface.co/papers/2609.38426', { id: '2609.38426', version: undefined }],
		['https://www.alphaxiv.org/abs/2609.38426', { id: '2609.38426', version: undefined }],
		['hep-th/9901001', { id: 'hep-th/9901001', version: undefined }]
	])('%s', (input, ref) => expect(parseArxiv(input)).toEqual(ref));
	it('rejects anything else', () => {
		expect(parseArxiv('https://example.com/2609.38426')).toBeNull();
		expect(parseArxiv('not an id')).toBeNull();
	});
});
