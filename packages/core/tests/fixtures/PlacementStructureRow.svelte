<script lang="ts">
	import type { ChildView } from '../../src/lib/application/index.js';
	import type { Leaf, LA } from './FeatureViewsModel.js';

	let { store }: { store: ChildView<Leaf, LA> } = $props();
</script>

<li data-row={store.state?.name} data-count={store.state?.count}>
	<span>{store.state?.name}</span>
	<button type="button" data-increment onclick={() => store.dispatch({ type: 'increment' })}>
		Increment
	</button>
</li>
