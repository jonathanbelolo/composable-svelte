<script lang="ts">
  import type { Store } from '@composable-svelte/core';
  import type { DeleteAlertState, DeleteAlertAction } from './delete-alert.types.js';
  import type { Product } from '../../models/product.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface DeleteAlertProps {
    store: Store<DeleteAlertState, DeleteAlertAction>;
    product: Product;
  }

  let { store, product }: DeleteAlertProps = $props();
  const state = $derived(store.state);
</script>

<!-- ============================================================================ -->
<!-- DeleteAlert View -->
<!-- ============================================================================ -->

<div class="space-y-4">
  <!-- Title -->
  <h2 class="text-xl font-semibold">Delete Product</h2>

  <!-- Message -->
  <p class="text-muted-foreground">
    Are you sure you want to delete '{product.name}'? This action cannot be undone.
  </p>

  <!-- Buttons -->
  <div class="flex gap-3 justify-end">
    <button
      onclick={() => store.dispatch({ type: 'cancelButtonTapped' })}
      class="px-4 py-2 border-2 border-border rounded-md hover:bg-accent"
    >
      Cancel
    </button>
    <button
      onclick={() => store.dispatch({ type: 'confirmButtonTapped' })}
      class="px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:opacity-90"
    >
      Delete
    </button>
  </div>
</div>
