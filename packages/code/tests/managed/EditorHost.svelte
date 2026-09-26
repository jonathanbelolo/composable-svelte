<script lang="ts">
	/**
	 * The real `CodeEditor` as a managed feature view: `render: CodeEditor`, no
	 * adapter, no facade, no inverse action map. Rows render in key order, then
	 * the panel. `visibility.show` unmounts the rows' outlet without retiring
	 * their owners.
	 */
	import type { Store } from '@composable-svelte/core';
	import { FeatureOutlet, FeatureViews, defineViews } from '@composable-svelte/core/application';
	import CodeEditor from '../../src/lib/code-editor/CodeEditor.svelte';
	import { editorComposition, type EditorRoot, type EditorRootAction } from './editor-model';

	let {
		store,
		visibility
	}: { store: Store<EditorRoot, EditorRootAction>; visibility: { readonly show: boolean } } = $props();

	const definition = defineViews(editorComposition, {
		editors: { render: CodeEditor },
		panel: { render: CodeEditor }
	});
</script>

<FeatureViews {store} {definition}>
	{#snippet children(views)}
		<div data-outlet="editors">
			{#if visibility.show}<FeatureOutlet view={views.editors} />{/if}
		</div>
		<div data-outlet="panel"><FeatureOutlet view={views.panel} /></div>
	{/snippet}
</FeatureViews>
