<script lang="ts">
  import Modal from '../../src/lib/navigation-components/Modal.svelte';
  import type { PresentationView } from '../../src/lib/navigation/managed-integration.js';

  interface Props {
    store: PresentationView<any, any> | undefined;
  }

  let { store }: Props = $props();
</script>

{#if store?.state !== undefined}
  <Modal {store} />
{/if}
