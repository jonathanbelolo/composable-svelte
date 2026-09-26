<script lang="ts">
	/** The real `CodeEditor` rendering the rows of `veto-model`: `render: CodeEditor`. */
	import type { Store } from '@composable-svelte/core';
	import { FeatureOutlet, FeatureViews, defineViews } from '@composable-svelte/core/application';
	import CodeEditor from '../../src/lib/code-editor/CodeEditor.svelte';
	import { vetoComposition, type VetoRoot, type VetoRootAction } from './veto-model';

	let { store }: { store: Store<VetoRoot, VetoRootAction> } = $props();

	const definition = defineViews(vetoComposition, { editors: { render: CodeEditor } });
</script>

<FeatureViews {store} {definition}>
	{#snippet children(views)}
		<div data-outlet="editors"><FeatureOutlet view={views.editors} /></div>
	{/snippet}
</FeatureViews>
