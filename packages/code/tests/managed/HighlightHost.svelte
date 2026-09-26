<script lang="ts">
	/** The real `CodeHighlight` as a managed feature view: `render: CodeHighlight`. */
	import type { Store } from '@composable-svelte/core';
	import { FeatureOutlet, FeatureViews, defineViews } from '@composable-svelte/core/application';
	import CodeHighlight from '../../src/lib/code-highlight/CodeHighlight.svelte';
	import { highlightComposition, type HighlightRoot, type HighlightRootAction } from './highlight-model';

	let { store }: { store: Store<HighlightRoot, HighlightRootAction> } = $props();
	const definition = defineViews(highlightComposition, { snippets: { render: CodeHighlight } });
</script>

<FeatureViews {store} {definition}>
	{#snippet children(views)}
		<FeatureOutlet view={views.snippets} />
	{/snippet}
</FeatureViews>
