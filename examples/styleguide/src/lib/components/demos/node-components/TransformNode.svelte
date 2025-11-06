<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import type { NodeProps } from '@xyflow/svelte';

	interface TransformNodeData {
		operation: 'uppercase' | 'lowercase' | 'reverse';
	}

	type Props = NodeProps<TransformNodeData>;
	const { data }: Props = $props();
</script>

<div
	class="bg-white dark:bg-gray-800 border-2 border-purple-500 rounded-lg p-4 min-w-[180px] shadow-lg"
>
	<div class="font-bold text-purple-600 dark:text-purple-400 mb-2">Transform</div>
	<select
		bind:value={data.operation}
		class="w-full px-2 py-1 text-sm border rounded bg-gray-50 dark:bg-gray-900"
	>
		<option value="uppercase">UPPERCASE</option>
		<option value="lowercase">lowercase</option>
		<option value="reverse">Reverse</option>
	</select>
	<Handle type="target" position={Position.Left} id="input" />
	<Handle type="source" position={Position.Right} id="output" />
</div>
