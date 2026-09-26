<script lang="ts">
 import NodeCanvas from '../../src/lib/node-canvas/NodeCanvas.svelte';
 import GraphIdentityProbe from './GraphIdentityProbe.svelte';
 import type{Store}from '@composable-svelte/core';
 import type{NodeCanvasState,NodeCanvasAction}from '../../src/lib/node-canvas/types';
 let{store}:{store:Store<NodeCanvasState,NodeCanvasAction>}=$props();
</script>
<div style="width:700px;height:500px"><NodeCanvas {store} liftAction={a=>a} nodeTypes={{operation:GraphIdentityProbe}} fitView={false}/></div>
