<script lang="ts">
  import Modal from '../../src/navigation-components/Modal.svelte';
  import { scopeToDestination } from '../../src/navigation/scope-to-destination.js';
  import type { Store } from '../../src/store.svelte.js';

  interface Props {
    parentStore: Store<any, any>;
  }

  let { parentStore }: Props = $props();

  // Track parent store state reactively
  let parentState = $state(parentStore.state);

  // Subscribe to parent store updates
  $effect(() => {
    const unsubscribe = parentStore.subscribe((newState) => {
      parentState = newState;
    });
    return unsubscribe;
  });

  // Reactively compute the scoped store based on parent state
  const scopedStore = $derived(
    parentState.destination
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
