<script lang="ts">
	/**
	 * The real `NodeCanvas` as a managed feature view: `render: NodeCanvas`,
	 * with neither `liftAction` nor `unliftAction`.
	 */
	import type { Store } from '@composable-svelte/core';
	import { FeatureOutlet, FeatureViews, defineViews } from '@composable-svelte/core/application';
	import NodeCanvas from '../../src/lib/node-canvas/NodeCanvas.svelte';
	import { canvasComposition, type CanvasRoot, type CanvasRootAction } from './canvas-model';

	let { store }: { store: Store<CanvasRoot, CanvasRootAction> } = $props();
	const definition = defineViews(canvasComposition, { canvases: { render: NodeCanvas } });
</script>

<div style="display: grid; grid-template-rows: 300px 300px; width: 600px;">
	<FeatureViews {store} {definition}>
		{#snippet children(views)}
			<FeatureOutlet view={views.canvases} />
		{/snippet}
	</FeatureViews>
</div>
