<script lang="ts">
	import { FeatureOutlet, FeatureViews, defineViews } from '@composable-svelte/core/application';
	import type { Store } from '@composable-svelte/core';
	import ACanvas from './ACanvas.svelte';
	import { aCanvasComposition, type CanvasRoot, type CanvasRootAction } from './canvas-model';

	let { store }: { store: Store<CanvasRoot, CanvasRootAction> } = $props();
	const definition = defineViews(aCanvasComposition, { canvases: { render: ACanvas } });
</script>

<FeatureViews {store} {definition}>
	{#snippet children(views)}
		<FeatureOutlet view={views.canvases} />
	{/snippet}
</FeatureViews>
