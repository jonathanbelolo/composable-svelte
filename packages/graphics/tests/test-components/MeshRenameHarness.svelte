<script lang="ts">
	import Mesh from '../../src/components/Mesh.svelte';
	import type { Store } from '@composable-svelte/core';
	import type { GeometryConfig, GraphicsState, GraphicsAction } from '../../src/core/types.js';

	/**
	 * Exists so a test can change a `<Mesh>`'s **id** after mount.
	 *
	 * `MeshGeometryHarness` hard-codes `id="custom"`, so it can vary geometry and
	 * nothing else — which is why the rename path had no coverage at all. A
	 * prop change is a DOM click here for the same reason as there: no
	 * `rerender`, and `$state` is unavailable inside a `.ts` test file.
	 */
	let { store }: { store: Store<GraphicsState, GraphicsAction> } = $props();

	// The same shapes MeshGeometryHarness uses: an index out of range is what
	// `customGeometryProblem` rejects. (`positions` is not the field — it is
	// `vertices` — and getting that wrong makes the checker throw rather than
	// report, which is how the first version of this harness failed.)
	const VALID: GeometryConfig = {
		type: 'custom',
		vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
		indices: [0, 1, 2]
	};
	const BROKEN: GeometryConfig = { ...VALID, indices: [0, 1, 9] };

	let id = $state('first');
	let geometry = $state<GeometryConfig>(VALID);
</script>

<button type="button" data-testid="rename" onclick={() => (id = 'second')}>rename</button>
<button type="button" data-testid="rename-broken" onclick={() => { id = 'second'; geometry = BROKEN; }}>
	rename and break
</button>
<button type="button" data-testid="repair" onclick={() => (geometry = VALID)}>repair</button>
<button type="button" data-testid="break" onclick={() => (geometry = BROKEN)}>break</button>

<Mesh {store} {id} {geometry} material={{ color: '#ff0000' }} position={[0, 0, 0]} />
