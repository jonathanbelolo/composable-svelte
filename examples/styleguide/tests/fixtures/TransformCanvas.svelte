<script lang="ts">
  import { SvelteFlow } from '@xyflow/svelte';
  import TransformNode from '../../src/lib/components/demos/node-components/TransformNode.svelte';
  let nodes = $state([{ id: 'transform', type: 'transform', position: { x: 40, y: 40 }, data: { operation: 'uppercase' as const } }]);
</script>
<div style="width:600px;height:400px">
  <SvelteFlow {nodes} edges={[]} nodeTypes={{ transform: TransformNode }} />
</div>
