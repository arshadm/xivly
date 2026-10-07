<!--
	A drawn annotation in the notes list: the page region it covers (Annotations.Crop),
	with the drawing itself on top, in PDF space (flipped: PDF y goes up).
-->
<script lang="ts" module>
	import type { Annotation } from 'svelte-pdf-mini';

	/** Kinds shown as a picture (the others have text). */
	export const hasPreview = (a: Annotation) => ['ink', 'area', 'rect', 'ellipse', 'line', 'arrow', 'polygon', 'polyline', 'stamp'].includes(a.kind);
</script>

<script lang="ts">
	import { Annotations, freehandOutline, outlineToSvgPath, type PdfPoint } from 'svelte-pdf-mini';

	let { annotation: a, color, maxWidth = 264, maxHeight = 120 }: { annotation: Annotation; color: string; maxWidth?: number; maxHeight?: number } = $props();

	/** Same margin as the crop around the annotation's box, in points. */
	const PAD = 6;
	const box = $derived.by(() => {
		const [x1, y1, x2, y2] = a.rect;
		return { x: x1 - PAD, y: y1 - PAD, w: x2 - x1 + 2 * PAD, h: y2 - y1 + 2 * PAD };
	});
	const width = $derived(Math.round(Math.min(maxWidth, (maxHeight * box.w) / box.h)));
	const points = (pts: PdfPoint[]) => pts.map(([x, y]) => `${x},${y}`).join(' ');

	/** Arrow head at the last point, like the page draws it. */
	function head(from: PdfPoint, to: PdfPoint, size: number) {
		const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
		const wing = (d: number): PdfPoint => [to[0] - size * Math.cos(angle + d), to[1] - size * Math.sin(angle + d)];
		return points([wing(0.45), to, wing(-0.45)]);
	}
</script>

<div class="relative overflow-hidden rounded bg-white" style:width="{width}px" style:aspect-ratio="{box.w} / {box.h}">
	<Annotations.Crop annotation={a} {width} padding={PAD} class="absolute inset-0" />
	<svg class="absolute inset-0 size-full" viewBox="{box.x} {-(box.y + box.h)} {box.w} {box.h}" preserveAspectRatio="none" aria-hidden="true">
		<g transform="scale(1 -1)" fill="none" stroke={color} stroke-linecap="round" stroke-linejoin="round" opacity={a.opacity}>
			{#if a.kind === 'ink'}
				{#each a.paths as p, i (i)}
					{#if (a.style ?? 'line') === 'freehand'}
						<path d={outlineToSvgPath(freehandOutline(p, a.width, a.freehand))} fill={color} stroke="none" />
					{:else}
						<polyline points={points(p.points)} stroke-width={a.width} />
					{/if}
				{/each}
			{:else if a.kind === 'area' || a.kind === 'rect'}
				{@const [x1, y1, x2, y2] = a.rect}
				<rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} rx="2" fill={a.kind === 'area' ? color : 'none'} fill-opacity={a.kind === 'area' ? (a.fillOpacity ?? 0.12) : 0} stroke-width={a.width ?? 1.5} />
			{:else if a.kind === 'ellipse'}
				{@const [x1, y1, x2, y2] = a.rect}
				<ellipse cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} rx={(x2 - x1) / 2} ry={(y2 - y1) / 2} stroke-width={a.width} />
			{:else if 'points' in a && a.points}
				{#if a.kind === 'polygon'}<polygon points={points(a.points)} stroke-width={a.width} />{:else}<polyline points={points(a.points)} stroke-width={a.width} />{/if}
				{#if a.kind === 'arrow' && a.points.length > 1}<polyline points={head(a.points[a.points.length - 2], a.points[a.points.length - 1], 6 + a.width * 2)} stroke-width={a.width} />{/if}
			{/if}
		</g>
	</svg>
</div>
