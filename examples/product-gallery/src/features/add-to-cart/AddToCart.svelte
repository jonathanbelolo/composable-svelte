<script lang="ts">
  import type { Store } from '@composable-svelte/core';
  import type { AddToCartState, AddToCartAction } from './add-to-cart.types.js';
  import type { Product } from '../../models/product.js';
  import { formatPrice } from '../../models/product.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface AddToCartProps {
    store: Store<AddToCartState, AddToCartAction>;
    product: Product;
  }

  let { store, product }: AddToCartProps = $props();

  // ============================================================================
  // Derived State
  // ============================================================================

  const state = $derived(store.state);
</script>

<!-- ============================================================================ -->
<!-- AddToCart Sheet Content -->
<!-- ============================================================================ -->

<div class="flex flex-col h-full bg-background">
  <!-- Header -->
  <div class="flex items-center justify-between p-4 border-b">
    <button
      onclick={() => store.dispatch({ type: 'cancelButtonTapped' })}
      class="text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      Cancel
    </button>
    <h2 class="text-lg font-semibold">Add to Cart</h2>
    <button
      onclick={() => store.dispatch({ type: 'addButtonTapped' })}
      class="text-sm font-medium text-primary hover:opacity-80"
    >
      Add
    </button>
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto p-6">
    <!-- Product Info -->
    <div class="flex items-center gap-4 mb-8">
      <div class="text-6xl">{product.image}</div>
      <div>
        <h3 class="font-semibold text-lg">{product.name}</h3>
        <p class="text-muted-foreground">{formatPrice(product.price)}</p>
      </div>
    </div>

    <!-- Quantity Stepper -->
    <div class="space-y-2">
      <label class="text-sm font-medium">Quantity</label>
      <div class="flex items-center gap-4">
        <button
          onclick={() => store.dispatch({ type: 'decrementQuantity' })}
          disabled={(state?.quantity || 1) <= 1}
          class="w-12 h-12 rounded-lg border-2 border-border bg-background hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-xl"
        >
          −
        </button>
        <span class="text-3xl font-semibold w-16 text-center">{state?.quantity || 1}</span>
        <button
          onclick={() => store.dispatch({ type: 'incrementQuantity' })}
          class="w-12 h-12 rounded-lg border-2 border-border bg-background hover:bg-accent font-semibold text-xl"
        >
          +
        </button>
      </div>
    </div>

    <!-- Total -->
    <div class="mt-8 p-4 rounded-lg bg-accent">
      <div class="flex justify-between items-center">
        <span class="text-lg font-medium">Total</span>
        <span class="text-2xl font-bold">{formatPrice(product.price * (state?.quantity || 1))}</span>
      </div>
    </div>
  </div>
</div>
