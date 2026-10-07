<!-- Settings › Annotations: the font of new text boxes, each choice shown in its own font. -->
<script lang="ts">
	import { RadioGroup } from 'bits-ui';
	import { FREETEXT_FONT_FAMILIES, freetextFontCss, type FreeTextFontFamily } from 'svelte-pdf-mini';
	import { settings } from '#lib/settings.svelte.js';

	const labels: Record<FreeTextFontFamily, string> = { Handwritten: 'Handwritten', Helvetica: 'Sans', Times: 'Serif', Courier: 'Mono' };
</script>

<div class="border-b border-stone-100 py-3 last:border-0 dark:border-stone-800">
	<p class="text-[13px] font-medium">Text box font</p>
	<p class="text-xs text-muted">For new text boxes. Right-click a text box › Font to change it</p>
	<RadioGroup.Root
		aria-label="Text box font"
		orientation="horizontal"
		value={settings.values.freetextFont}
		onValueChange={(v) => settings.set('freetextFont', v as FreeTextFontFamily)}
		class="mt-2.5 grid grid-cols-4 gap-1.5"
	>
		{#each FREETEXT_FONT_FAMILIES as family (family)}
			<RadioGroup.Item
				value={family}
				class="flex flex-col items-start gap-1 rounded-lg border border-stone-200 px-2.5 py-2 text-left outline-none hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-blue-500/60 data-[state=checked]:border-stone-800 data-[state=checked]:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800 dark:data-[state=checked]:border-stone-300 dark:data-[state=checked]:bg-stone-800"
			>
				<span class="text-[15px] leading-snug text-blue-800 dark:text-blue-300" style:font-family={freetextFontCss(family)}>Why does this work? → §3</span>
				<span class="text-[11px] text-muted">{labels[family]}</span>
			</RadioGroup.Item>
		{/each}
	</RadioGroup.Root>
</div>
