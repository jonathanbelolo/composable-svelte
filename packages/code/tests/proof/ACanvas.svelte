<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteFlow } from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import type { FeatureViewProps } from '@composable-svelte/core/application';
	import { nodesToArray } from '../../src/lib/node-canvas/types';
	import AFlowCommands from './AFlowCommands.svelte';
	import type { ACanvasAction, ACanvasState } from './canvas-model';

	let { store, surface }: FeatureViewProps<ACanvasState, ACanvasAction> = $props();
	const owner = untrack(() => store);
	const label = untrack(() => store.state?.label ?? 'retired');
	const nodes = $derived(nodesToArray(owner.state?.nodes ?? {}));
</script>

<section use:surface data-canvas={label} style="width: 600px; height: 300px;">
	<SvelteFlow {nodes} edges={[]} fitView>
		<AFlowCommands {owner} />
	</SvelteFlow>
</section>
