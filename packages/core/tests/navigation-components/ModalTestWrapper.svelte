<script lang="ts">
  import Modal from '../../src/lib/navigation-components/Modal.svelte';
  import { scopeToDestination } from '../../src/lib/navigation/scope-to-destination.js';
  // `Store` is declared in types.ts; store.svelte.ts imports it without
  // re-exporting, so this path resolved to nothing.
  import type { Store } from '../../src/lib/types.js';

  interface Props {
    parentStore: Store<any, any>;
  }

  let { parentStore }: Props = $props();

  // Derive the scoped store directly from parentStore.state
  // This ensures reactivity is tied to the store's internal state
  const scopedStore = $derived(
    parentStore.state.destination
      ? scopeToDestination(
          parentStore,
          ['destination'],
          'test',
          'destination'
        )
      : null
  );
</script>

{#if scopedStore}
  <Modal store={scopedStore} />
{/if}
