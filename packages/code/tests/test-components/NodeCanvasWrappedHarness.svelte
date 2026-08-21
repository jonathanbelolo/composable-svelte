<script lang="ts" module>
	import type { Store } from '@composable-svelte/core';
	import type { NodeCanvasState, NodeCanvasAction } from '../../src/lib/node-canvas/types.js';

	/** A parent that WRAPS canvas actions and owns same-named actions of its own. */
	export type ParentAction =
		| { type: 'canvas'; action: NodeCanvasAction }
		| { type: 'zoomIn' }
		| { type: 'setViewport'; to: string };

	export let wrappedStore: Store<NodeCanvasState, ParentAction> | null = null;
</script>

<script lang="ts">
	import NodeCanvas from '../../src/lib/node-canvas/NodeCanvas.svelte';
	import { createStore } from '@composable-svelte/core';
	import { nodeCanvasReducer } from '../../src/lib/node-canvas/reducer.js';
	import { createInitialNodeCanvasState } from '../../src/lib/node-canvas/types.js';

	const store = createStore<NodeCanvasState, ParentAction>({
		// TWO spread-out nodes deliberately. With a single node the mount-time
		// auto-fit lands on `maxZoom`, so a hijacked `zoomIn` would be a no-op and
		// the test below would pass without testing anything — measured at
		// `scale(2)` before this was fixed.
		initialState: createInitialNodeCanvasState({
			nodes: {
				a: { id: 'a', type: 'default', position: { x: 0, y: 0 }, data: {} },
				b: { id: 'b', type: 'default', position: { x: 400, y: 300 }, data: {} }
			}
		}),
		reducer: (state, action, deps) =>
			action.type === 'canvas'
				? nodeCanvasReducer(state, action.action, deps)
				: [state, { _tag: 'None' as const }],
		dependencies: {}
	});

	wrappedStore = store;
</script>

<div style="width: 600px; height: 400px;">
	<!-- No `unliftAction` supplied: the default must refuse to act. -->
	<NodeCanvas {store} liftAction={(action) => ({ type: 'canvas', action })} />
</div>
