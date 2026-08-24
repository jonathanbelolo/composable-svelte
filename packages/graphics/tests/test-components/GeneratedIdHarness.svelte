<script lang="ts">
	import Light from '../../src/components/Light.svelte';
	import type { Store } from '@composable-svelte/core';
	import type { GraphicsState, GraphicsAction } from '../../src/core/types.js';

	/**
	 * `LightPropsHarness` with no `id`, so the test drives the generated one.
	 * Separate rather than a prop, because the point is the *absent* attribute.
	 */
	let { store }: { store: Store<GraphicsState, GraphicsAction> } = $props();

	let intensity = $state(0.4);
</script>

<button type="button" data-testid="brighten" onclick={() => (intensity = 0.9)}>brighten</button>

<Light {store} type="point" position={[0, 1, 0]} {intensity} />
