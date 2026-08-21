<script lang="ts" generics="NodeData extends Record<string, unknown>, EdgeData extends Record<string, unknown>, Action">
	/**
	 * Bridges the store's viewport commands to the live SvelteFlow instance.
	 *
	 * Must be rendered *inside* `<SvelteFlow>`: `useSvelteFlow()` reads the flow
	 * from context. This replaces the old `ViewportSetter`, which could only push
	 * an out-of-band `externalViewport` prop and left every store-driven viewport
	 * action doing nothing.
	 *
	 * ARCHITECTURE. `setViewport`, `zoomIn`, `zoomOut`, `fitView` and
	 * `centerView` are *commands*: they have no meaningful state of their own, so
	 * the reducer stays pure and the view performs them here, on the action
	 * stream. The canvas reports the result back inward through `onmoveend` as a
	 * `setViewport`, so the store keeps the projection and the canvas keeps the
	 * pixels. Exactly the shape used for the code editor's command actions.
	 *
	 * `subscribeToActions` rather than an `$effect`, for the same reason as
	 * there: Svelte coalesces effect runs, so two commands dispatched in one tick
	 * would collapse into one.
	 */
	import { useSvelteFlow } from '@xyflow/svelte';
	import { onMount } from 'svelte';
	import type { Store } from '@composable-svelte/core';
	import type { NodeCanvasState, NodeCanvasAction } from './types.js';

	const props: {
		store: Store<NodeCanvasState<NodeData, EdgeData>, Action>;
		/** Recognises this canvas's commands in the parent's action stream. */
		unliftAction: (action: Action) => NodeCanvasAction<NodeData, EdgeData> | null;
	} = $props();

	const { setViewport, zoomIn, zoomOut, fitView, setCenter, getNodesBounds, getNodes } =
		useSvelteFlow();

	onMount(() => {
		const unsubscribe = props.store.subscribeToActions?.((action) => {
			const canvasAction = props.unliftAction(action);
			if (!canvasAction) return;

			switch (canvasAction.type) {
				case 'setViewport':
					// `duration: 0` so the echo through `onmoveend` is synchronous and
					// the value guard there settles it in one pass.
					setViewport(canvasAction.viewport, { duration: 0 });
					return;
				case 'zoomIn':
					// The flow owns the clamping, against the real minZoom/maxZoom.
					// The reducer used to duplicate it with hardcoded 2 / 0.1.
					zoomIn();
					return;
				case 'zoomOut':
					zoomOut();
					return;
				case 'fitView':
					fitView();
					return;
				case 'centerView': {
					const bounds = getNodesBounds(getNodes());
					setCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
					return;
				}
			}
		});

		if (!unsubscribe) {
			console.warn(
				'[NodeCanvas] this store does not implement subscribeToActions, so ' +
					'setViewport / zoomIn / zoomOut / fitView / centerView cannot reach the canvas.'
			);
		}

		return () => unsubscribe?.();
	});
</script>
