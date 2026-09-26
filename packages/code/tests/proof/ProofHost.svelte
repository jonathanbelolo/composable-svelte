<script lang="ts">
	import { FeatureOutlet, FeatureViews } from '@composable-svelte/core/application';
	import type { Store } from '@composable-svelte/core';
	import type { ProofRoot, ProofRootAction } from './proof-model';
	import type { ProofViews } from './proof-plans';

	let {
		store,
		definition,
		visibility
	}: {
		store: Store<ProofRoot, ProofRootAction>;
		definition: ProofViews;
		visibility: { readonly show: boolean };
	} = $props();
</script>

<FeatureViews {store} {definition}>
	{#snippet children(views)}
		{#if visibility.show}<FeatureOutlet view={views.editors} />{/if}
		<FeatureOutlet view={views.panel} />
	{/snippet}
</FeatureViews>
