<script lang="ts">
	import DropdownMenu from '../../src/lib/components/ui/dropdown-menu/DropdownMenu.svelte';
</script>

<DropdownMenu items={[{ id: 'a', label: 'Alpha' }]}>
	{#snippet children()}
		<button type="button">Open</button>
	{/snippet}
</DropdownMenu>
