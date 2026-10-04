<!--
	Annotation colour picker: the ColorPicker recipe bound to the store's active colour.
	Picking a colour also recolours the selection (or the just-created annotation).
	A custom colour is added to the store's palette (store.addColor), so it shows up
	in the swatches, the filters and every picker (bind:palette on Annotations.Root to persist it).
-->
<script lang="ts">
	import { AnnotationsContext } from 'svelte-pdf-mini';
	import ColorPicker from '../ui/ColorPicker.svelte';

	const store = AnnotationsContext.get();
	const swatches = $derived(store.palette.map((c) => ({ value: c.key, color: c.light, label: c.label })));

	function pick(v: string) {
		const key = v.startsWith('#') ? store.addColor(v) : v;
		store.color = key;
		// Recolour the selection, or else the annotation being created.
		const pending = store.pendingId ? [store.pendingId] : [];
		const ids = store.selectedIds.length ? store.selectedIds : pending;
		if (ids.length) store.recolor(ids, key);
	}
</script>

<ColorPicker label="Annotation colour" size="sm" value={store.color} {swatches} onValueChange={pick} />
