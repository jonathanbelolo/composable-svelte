<script lang="ts">
	import NodeCanvas from '../../src/lib/node-canvas/NodeCanvas.svelte';
	import { createStore, Effect } from '@composable-svelte/core';
	import { nodeCanvasReducer } from '../../src/lib/node-canvas/reducer.js';
	import { createInitialNodeCanvasState } from '../../src/lib/node-canvas/types.js';
	import type { NodeCanvasState } from '../../src/lib/node-canvas/types.js';
	import { wrappedHarness, type ParentAction } from './harness-stores.js';

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
		// The canvas's effects have to be lifted, not passed through: they carry
		// `NodeCanvasAction`, and this store dispatches `ParentAction`. Returning
		// them unmapped would send a raw canvas action to a reducer that only
		// understands the wrapped form — invisible until the tests were checked,
		// because nothing type-checks a `.svelte` file under `tests/`.
		reducer: (state, action, deps) => {
			if (action.type !== 'canvas') return [state, Effect.none()];
			const [next, effect] = nodeCanvasReducer(state, action.action, deps);
			return [next, Effect.map(effect, (a) => ({ type: 'canvas' as const, action: a }))];
		},
		dependencies: {}
	});

	wrappedHarness.store = store;
</script>

<div style="width: 600px; height: 400px;">
	<!-- No `unliftAction` supplied: the default must refuse to act. -->
	<NodeCanvas {store} liftAction={(action) => ({ type: 'canvas' as const, action })} />
</div>
