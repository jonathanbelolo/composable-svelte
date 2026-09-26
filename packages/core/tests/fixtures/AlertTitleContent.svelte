<script lang="ts">
 import { untrack } from 'svelte';
 let { onInit }: { onInit: () => void } = $props();
 untrack(() => onInit());
</script>
<span data-title-content>Confirm <strong>operation</strong></span>
