<script lang="ts">
 import { onMount } from 'svelte';
 import { viewEvents, type Panel } from './RenderModel.js';
 let { store }: { store: { readonly state: Panel | undefined }; views: unknown; surface: unknown } = $props();
 onMount(() => { viewEvents.push('panel:mount'); return () => viewEvents.push('panel:unmount'); });
</script>
<span data-panel>{store.state?.n}</span>
