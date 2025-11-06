<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import type { NodeProps } from '@xyflow/svelte';

	interface OutputNodeData {
		displayValue: string;
	}

	type Props = NodeProps<OutputNodeData>;
	const { data }: Props = $props();
</script>

<div class="bg-white dark:bg-gray-800 border-2 border-green-500 rounded-lg p-4 min-w-[180px] shadow-lg">
	<div class="font-bold text-green-600 dark:text-green-400 mb-2">Output</div>
	<div class="px-2 py-1 text-sm bg-gray-100 dark:bg-gray-900 rounded font-mono">
		{data.displayValue || '(empty)'}
	</div>
	<Handle type="target" position={Position.Left} id="input" />
</div>
