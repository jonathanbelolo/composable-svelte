<script lang="ts">
  import { ApplicationRoot, ApplicationHost } from '@composable-svelte/core/application';
  import { inventoryApplication } from './application';
  import InventoryView from './InventoryView.svelte';
  let {url}: {url:string} = $props();
</script>

<ApplicationRoot definition={inventoryApplication} options={{dependencies:undefined,initial:{input:url,url}}}>
  {#snippet children(app)}
    <ApplicationHost {app}><InventoryView /></ApplicationHost>
  {/snippet}
</ApplicationRoot>
