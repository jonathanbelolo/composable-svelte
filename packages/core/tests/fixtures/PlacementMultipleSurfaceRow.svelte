<script lang="ts">
	import type { FeatureViewProps } from '../../src/lib/application/index.js';
	import type { Leaf, LA } from './FeatureViewsModel.js';

	let { store, surface }: FeatureViewProps<Leaf, LA> = $props();
</script>

<li use:surface data-row={store.state?.name} data-count={store.state?.count}>
	<span use:surface data-secondary-surface>{store.state?.name}</span>
</li>
