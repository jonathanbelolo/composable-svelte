<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import type { NodeProps } from '@xyflow/svelte';

	interface InputNodeData {
		value: string;
		outputType: 'string' | 'number';
	}

	type Props = NodeProps<InputNodeData>;
	const { data }: Props = $props();
</script>

<div class="bg-white dark:bg-gray-800 border-2 border-blue-500 rounded-lg p-4 min-w-[200px] shadow-lg">
	<div class="font-bold text-blue-600 dark:text-blue-400 mb-2">Input</div>
	<input
		type="text"
		bind:value={data.value}
		placeholder="Enter text..."
		class="w-full px-2 py-1 text-sm border rounded bg-gray-50 dark:bg-gray-900"
	/>
	<Handle type="source" position={Position.Right} id="output" />
</div>
