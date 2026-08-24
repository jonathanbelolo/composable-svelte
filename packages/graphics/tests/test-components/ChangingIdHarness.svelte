<script lang="ts">
	import Light from '../../src/components/Light.svelte';
	import type { Store } from '@composable-svelte/core';
	import type { GraphicsState, GraphicsAction } from '../../src/core/types.js';

	/** Drives a change of `<Light id>` after mount. */
	let { store }: { store: Store<GraphicsState, GraphicsAction> } = $props();

	let id = $state('first');
</script>

<button type="button" data-testid="rename" onclick={() => (id = 'second')}>rename</button>

<Light {store} {id} type="point" position={[0, 1, 0]} intensity={1} />
