<script lang="ts">
	import Light from '../../src/components/Light.svelte';
	import type { Store } from '@composable-svelte/core';
	import type { GraphicsState, GraphicsAction } from '../../src/core/types.js';

	/**
	 * Exists so a test can change a `<Light>` prop AFTER mount. `graphics` has no
	 * `vitest-browser-svelte`, so there is no `rerender`, and `$state` is
	 * unavailable inside a `.ts` test file — a wrapper driven by a DOM click is
	 * how a prop change is expressed here.
	 */
	let { store }: { store: Store<GraphicsState, GraphicsAction> } = $props();

	let intensity = $state(0.4);
</script>

<button type="button" data-testid="brighten" onclick={() => (intensity = 0.9)}>brighten</button>

<Light {store} id="key" type="point" position={[0, 1, 0]} {intensity} />
