<script lang="ts" module>
	// Module scope so the array identity is stable across rerenders and the
	// items-sync effect does not re-fire.
	const ITEMS = [{ id: 'a', label: 'Alpha' }];
</script>

<script lang="ts">
	import DropdownMenu from '../../src/lib/components/ui/dropdown-menu/DropdownMenu.svelte';

	let { onSelect }: { onSelect: (item: unknown) => void } = $props();
</script>

<DropdownMenu items={ITEMS} {onSelect}>
	{#snippet children()}
		<button type="button">Open</button>
	{/snippet}
</DropdownMenu>
