<script lang="ts">
	import type { Store } from '@composable-svelte/core';
	import { FeatureOutlet, FeatureViews, defineViews } from '@composable-svelte/core/application';
	import { CodeEditor, CodeHighlight, NodeCanvas } from '@composable-svelte/code';
	import { composition, type Root, type RootAction } from './model';

	let { store }: { store: Store<Root, RootAction> } = $props();
	const definition = defineViews(composition, {
		editors: { render: CodeEditor },
		snippets: { render: CodeHighlight },
		canvases: { render: NodeCanvas }
	});
</script>

<FeatureViews {store} {definition}>
	{#snippet children(views)}
		<div data-outlet="editors"><FeatureOutlet view={views.editors} /></div>
		<div data-outlet="snippets"><FeatureOutlet view={views.snippets} /></div>
		<div data-outlet="canvases" style="width: 600px; height: 400px;"><FeatureOutlet view={views.canvases} /></div>
	{/snippet}
</FeatureViews>
