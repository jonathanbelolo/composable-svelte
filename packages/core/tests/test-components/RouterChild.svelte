<script lang="ts">
	/** A child for DestinationRouter to route to, identifiable in the DOM. */
	let { store, label = 'routed' }: { store?: unknown; label?: string } = $props();
	void store;
</script>

<div data-routed={label}>{label}</div>
