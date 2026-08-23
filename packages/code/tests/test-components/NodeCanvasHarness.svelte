<script lang="ts">
	import NodeCanvas from '../../src/lib/node-canvas/NodeCanvas.svelte';
	import { createStore } from '@composable-svelte/core';
	import { nodeCanvasReducer } from '../../src/lib/node-canvas/reducer.js';
	import { createInitialNodeCanvasState } from '../../src/lib/node-canvas/types.js';
	import { harness } from './harness-stores.js';

	/**
	 * Two spread-out nodes so `fitView` and `centerView` have something to act on,
	 * and so selection is observable in the rendered DOM.
	 */
	const store = createStore({
		initialState: createInitialNodeCanvasState({
			nodes: {
				a: { id: 'a', type: 'default', position: { x: 0, y: 0 }, data: { label: 'A' } },
				b: { id: 'b', type: 'default', position: { x: 400, y: 300 }, data: { label: 'B' } }
			}
		}),
		reducer: nodeCanvasReducer,
		dependencies: {}
	});

	harness.store = store;
</script>

<div style="width: 600px; height: 400px;">
	<NodeCanvas {store} liftAction={(a) => a} />
</div>
