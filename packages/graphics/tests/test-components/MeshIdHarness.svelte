<script lang="ts">
	import Mesh from '../../src/components/Mesh.svelte';
	import type { Store } from '@composable-svelte/core';
	import type { GraphicsState, GraphicsAction } from '../../src/core/types.js';

	/** Drives a change of `<Mesh id>` after mount. */
	let { store }: { store: Store<GraphicsState, GraphicsAction> } = $props();

	let id = $state('first');
</script>

<button type="button" data-testid="rename" onclick={() => (id = 'second')}>rename</button>

<Mesh
	{store}
	{id}
	geometry={{ type: 'box', size: 1 }}
	material={{ color: '#ff0000' }}
	position={[0, 0, 0]}
/>
