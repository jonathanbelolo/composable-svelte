<script lang="ts">
	import Mesh from '../../src/components/Mesh.svelte';
	import type { Store } from '@composable-svelte/core';
	import type { GeometryConfig, GraphicsState, GraphicsAction } from '../../src/core/types.js';

	/**
	 * Exists so a test can repair a `<Mesh>`'s geometry AFTER mount.
	 *
	 * Same reason as `LightPropsHarness`: no `rerender` here, and `$state` is
	 * unavailable inside a `.ts` test file, so a prop change is expressed as a
	 * DOM click. The first geometry is deliberately invalid — the reducer
	 * refuses it — and the click supplies one it accepts.
	 */
	let { store }: { store: Store<GraphicsState, GraphicsAction> } = $props();

	const VALID: GeometryConfig = {
		type: 'custom',
		vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
		indices: [0, 1, 2]
	};
	const BROKEN: GeometryConfig = { ...VALID, indices: [0, 1, 9] };

	let geometry = $state(BROKEN);
</script>

<button type="button" data-testid="repair" onclick={() => (geometry = VALID)}>repair</button>

<Mesh {store} id="custom" {geometry} material={{ color: '#ff0000' }} position={[0, 0, 0]} />
