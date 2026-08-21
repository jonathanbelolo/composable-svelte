<script lang="ts">
	import NodeCanvas from '../../src/lib/node-canvas/NodeCanvas.svelte';
	import { createStore } from '@composable-svelte/core';
	import { nodeCanvasReducer } from '../../src/lib/node-canvas/reducer.js';
	import { createInitialNodeCanvasState } from '../../src/lib/node-canvas/types.js';

	/**
	 * Exists so a test can change a NodeCanvas prop AFTER mount. `packages/code`
	 * has no `vitest-browser-svelte`, so there is no `rerender`, and `$state`
	 * is unavailable inside a `.ts` test file — a wrapper driven by a DOM click
	 * is how a prop change is expressed here.
	 */
	let canvasClass = $state('first');
	let minZoom = $state(0.1);

	const store = createStore({
		initialState: createInitialNodeCanvasState(),
		reducer: nodeCanvasReducer,
		dependencies: {}
	});
</script>

<button
	type="button"
	data-testid="change-props"
	onclick={() => {
		canvasClass = 'second';
		minZoom = 0.5;
	}}>change</button
>

<div style="width: 400px; height: 300px;">
	<NodeCanvas {store} liftAction={(a) => a} class={canvasClass} {minZoom} />
</div>
