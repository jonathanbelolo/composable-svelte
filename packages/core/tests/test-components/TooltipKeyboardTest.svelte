<script lang="ts">
	import Tooltip from '../../src/lib/components/ui/tooltip/Tooltip.svelte';

	let { content }: { content: string } = $props();
</script>

<Tooltip {content} delay={0}>
	{#snippet children()}
		<button type="button">Trigger</button>
	{/snippet}
</Tooltip>
