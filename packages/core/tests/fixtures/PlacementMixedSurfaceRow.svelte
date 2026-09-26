<script lang="ts">
	import type { FeatureViewProps } from '../../src/lib/application/index.js';
	import type { Leaf, LA } from './FeatureViewsModel.js';

	let { store, surface }: FeatureViewProps<Leaf, LA> = $props();
</script>

{#if store.state?.name === 'row1'}
	<li use:surface data-row={store.state?.name} data-count={store.state?.count}>
		<span>{store.state?.name}</span>
		<button type="button" data-increment onclick={() => store.dispatch({ type: 'increment' })}>
			Increment
		</button>
	</li>
{:else}
	<li data-row={store.state?.name} data-count={store.state?.count}>
		<span>{store.state?.name}</span>
		<button type="button" data-increment onclick={() => store.dispatch({ type: 'increment' })}>
			Increment
		</button>
	</li>
{/if}
