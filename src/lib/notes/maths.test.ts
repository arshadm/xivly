import { describe, expect, it } from 'vitest';
import { BLOCK_MATH, INLINE_MATH } from './maths';

/** The formula the inline rule takes when this was just typed (null: none). */
const inline = (typed: string) => INLINE_MATH.exec(typed)?.[1] ?? null;

describe('typing maths', () => {
	it('$x$ is inline maths', () => {
		expect(inline('Energy $E = mc^2$')).toBe('E = mc^2');
		expect(inline('$x$')).toBe('x');
		expect(inline('a sum $\\sum_i x_i$')).toBe('\\sum_i x_i');
	});

	it('prices and loose dollar signs stay text', () => {
		expect(inline('it costs $5 and $')).toBeNull();
		expect(inline('$ x$')).toBeNull();
		expect(inline('word$x$')).toBeNull();
		expect(inline('an escaped \\$x$')).toBeNull();
		expect(inline('$$')).toBeNull();
	});

	it('$$x$$ is not inline maths, but a block when alone on its line', () => {
		expect(inline('$$E = mc^2$$')).toBeNull();
		expect(BLOCK_MATH.exec('$$\\int_0^1 f$$')?.[1]).toBe('\\int_0^1 f');
		expect(BLOCK_MATH.test('see $$x$$')).toBe(false);
	});
});
