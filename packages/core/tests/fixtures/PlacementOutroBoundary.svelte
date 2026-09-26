<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import Relocation from './PlacementOutroRelocation.svelte';

	let {
		onBoundaryError = () => {},
		...props
	}: ComponentProps<typeof Relocation> & {
		onBoundaryError?: ((error: unknown) => void) | undefined;
	} = $props();
</script>

<svelte:boundary onerror={(error) => onBoundaryError(error)}>
	<Relocation {...props} />
	{#snippet failed(error)}
		<p data-error>{String(error)}</p>
	{/snippet}
</svelte:boundary>
