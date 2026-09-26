<script lang="ts">
	/** Option A's FlowCommands: drains the captured owner's viewport queue into useSvelteFlow(). */
	import { onMount } from 'svelte';
	import { useSvelteFlow } from '@xyflow/svelte';
	import type { ChildView } from '@composable-svelte/core/application';
	import { bindCommandQueue } from './command-queue';
	import type { ACanvasAction, ACanvasState } from './canvas-model';

	let { owner }: { owner: ChildView<ACanvasState, ACanvasAction> } = $props();
	const { zoomIn, zoomOut, fitView, setCenter, getNodesBounds, getNodes, getViewport } = useSvelteFlow();

	onMount(() => {
		// The flow already exists inside <SvelteFlow>, so the view attaches at once.
		const binding = bindCommandQueue(owner, (state) => state.viewportCommands);
		binding.attach((command) => {
			switch (command.type) {
				case 'zoomIn':
					return void zoomIn({ duration: 0 });
				case 'zoomOut':
					return void zoomOut({ duration: 0 });
				case 'fitView':
					return void fitView();
				case 'centerView': {
					const bounds = getNodesBounds(getNodes());
					return void setCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { zoom: getViewport().zoom });
				}
			}
		});
		return () => binding.dispose();
	});
</script>
