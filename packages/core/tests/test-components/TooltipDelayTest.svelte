<script lang="ts">
	import Tooltip from '../../src/lib/components/ui/tooltip/Tooltip.svelte';

	let { delay }: { delay: number } = $props();
</script>

<Tooltip content="Hint" {delay}>
	{#snippet children()}
		<button type="button">Trigger</button>
	{/snippet}
</Tooltip>
