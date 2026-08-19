<script lang="ts">
	import Tooltip from '../../src/lib/components/ui/tooltip/Tooltip.svelte';
</script>

<Tooltip content="Hint">
	{#snippet children()}
		<button type="button">Trigger</button>
	{/snippet}
</Tooltip>
