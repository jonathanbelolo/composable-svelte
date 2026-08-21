<script lang="ts" module>
	import type { Store } from '@composable-svelte/core';
	import type { NodeCanvasState, NodeCanvasAction } from '../../src/lib/node-canvas/types.js';

	/** Handed out so a `.ts` test can dispatch without owning the store. */
	export let harnessStore: Store<NodeCanvasState, NodeCanvasAction> | null = null;
</script>

<script lang="ts">
	import NodeCanvas from '../../src/lib/node-canvas/NodeCanvas.svelte';
	import { createStore } from '@composable-svelte/core';
	import { nodeCanvasReducer } from '../../src/lib/node-canvas/reducer.js';
	import { createInitialNodeCanvasState } from '../../src/lib/node-canvas/types.js';

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

	harnessStore = store;
</script>

<div style="width: 600px; height: 400px;">
	<NodeCanvas {store} liftAction={(a) => a} />
</div>
