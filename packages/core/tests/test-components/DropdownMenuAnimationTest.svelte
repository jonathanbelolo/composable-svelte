<script lang="ts">
	/**
	 * A DropdownMenu driven through its own trigger, which is the only way a
	 * consumer can open it — the component creates its store privately.
	 */
	import DropdownMenu from '../../src/lib/components/ui/dropdown-menu/DropdownMenu.svelte';

	let picked = $state('none');
</script>

<div data-testid="picked">{picked}</div>

<DropdownMenu
	items={[
		{ id: 'a', label: 'Alpha' },
		{ id: 'b', label: 'Beta' }
	]}
	onSelect={(item) => (picked = item.label)}
>
	{#snippet children()}
		<span data-testid="trigger-label">Open</span>
	{/snippet}
</DropdownMenu>
