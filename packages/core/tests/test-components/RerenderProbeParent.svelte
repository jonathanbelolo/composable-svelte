<script lang="ts">
	import RerenderProbe from './RerenderProbe.svelte';

	let { cb, marker }: { cb: () => string; marker: string } = $props();
</script>

<RerenderProbe {cb} {marker} />
