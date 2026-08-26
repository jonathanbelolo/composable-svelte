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

	// A prop that changes without touching the geometry, so a test can count how
	// often a *refused* mesh is re-dispatched.
	let x = $state(0);
</script>

<button type="button" data-testid="repair" onclick={() => (geometry = VALID)}>repair</button>
<button type="button" data-testid="nudge" onclick={() => (x += 1)}>nudge</button>

<Mesh {store} id="custom" {geometry} material={{ color: '#ff0000' }} position={[x, 0, 0]} />
