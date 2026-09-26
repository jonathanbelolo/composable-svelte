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
	 * An action listener rather than an `$effect`, for the same reason as
	 * there: Svelte coalesces effect runs, so two commands dispatched in one tick
	 * would collapse into one. The listener is a managed owner's observed
	 * actions, or a standalone store's `subscribeToActions` (`bindViewSource`).
	 */
	import { useSvelteFlow } from '@xyflow/svelte';
	import { onMount } from 'svelte';
	import { isManagedChildView } from '@composable-svelte/core/application';
	import type { NodeCanvasState, NodeCanvasAction } from './types.js';
	import { bindViewSource, type ViewSource } from '../internal/view-source.js';

	const props: {
		store: ViewSource<NodeCanvasState<NodeData, EdgeData>, Action>;
		/**
		 * Recognises this canvas's commands among a standalone store's actions.
		 * Not consulted for a managed view: its observed actions are already the
		 * canvas's own.
		 */
		unliftAction: (action: Action) => NodeCanvasAction<NodeData, EdgeData> | null;
		/** The canvas's zoom bounds, so commands cannot exceed them. */
		minZoom: number;
		maxZoom: number;
	} = $props();

	const clampZoom = (zoom: number) => Math.min(Math.max(zoom, props.minZoom), props.maxZoom);

	const { setViewport, zoomIn, zoomOut, fitView, setCenter, getNodesBounds, getNodes, getViewport } =
		useSvelteFlow();

	onMount(() => {
		// A managed view delivers only this owner's actions, already unwrapped to
		// `NodeCanvasAction`. Passing them through a caller's `unliftAction`
		// could only lose them: a non-identity `liftAction` (even `{ ...a }`)
		// defeats the default identity probe, and every command would be dropped.
		const managed = isManagedChildView(props.store);
		return bindViewSource(
			props.store,
			{
				component: 'NodeCanvas',
				loses: 'setViewport / zoomIn / zoomOut / fitView / centerView cannot reach the canvas'
			},
			{
				onAction: (action) =>
					runCommand(managed ? (action as NodeCanvasAction<NodeData, EdgeData>) : props.unliftAction(action))
			}
		);
	});

	function runCommand(canvasAction: NodeCanvasAction<NodeData, EdgeData> | null): void {
		if (!canvasAction) return;

		switch (canvasAction.type) {
			case 'setViewport':
				// `duration: 0` so the echo through `onmoveend` is synchronous and
				// the value guard there settles it in one pass.
				//
				// Clamped: `setViewport` does no bounds checking of its own, and
				// while this action was dead it could not violate anything. Now
				// that it drives the canvas, ignoring `minZoom`/`maxZoom` would
				// make those props advisory for one command and binding for the
				// other two.
				setViewport(
					{ ...canvasAction.viewport, zoom: clampZoom(canvasAction.viewport.zoom) },
					{ duration: 0 }
				);
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
				// The explicit zoom is required, not optional: `setCenter` defaults
				// its zoom to `store.maxZoom`
				// (`@xyflow/svelte/dist/lib/store/index.js:78-79`), so omitting it
				// slams the canvas to maximum. Centring is a pan.
				setCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, {
					zoom: getViewport().zoom
				});
				return;
			}
		}
	}
</script>
