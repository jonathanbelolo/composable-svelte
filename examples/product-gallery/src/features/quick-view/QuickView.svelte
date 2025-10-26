<script lang="ts">
  import type { Store } from '@composable-svelte/core';
  import type { QuickViewState, QuickViewAction } from './quick-view.types.js';
  import type { Product } from '../../models/product.js';
  import { formatPrice } from '../../models/product.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface QuickViewProps {
    store: Store<QuickViewState, QuickViewAction>;
    product: Product;
  }

  let { store, product }: QuickViewProps = $props();
</script>

<!-- ============================================================================ -->
<!-- QuickView Modal Content -->
<!-- ============================================================================ -->

<div class="w-full max-w-2xl mx-auto bg-background rounded-lg shadow-xl">
  <!-- Header -->
  <div class="flex items-center justify-between p-6 border-b">
    <h2 class="text-2xl font-bold">Quick View</h2>
    <button
      onclick={() => store.send({ type: 'closeButtonTapped' })}
      class="w-10 h-10 rounded-full hover:bg-accent flex items-center justify-center text-2xl text-muted-foreground hover:text-foreground"
      aria-label="Close"
    >
      ×
    </button>
  </div>

  <!-- Content -->
  <div class="p-6">
    <!-- Large Product Image -->
    <div class="text-center mb-6">
      <div class="text-9xl">{product.image}</div>
    </div>

    <!-- Product Details -->
    <div class="text-center space-y-4">
      <h3 class="text-3xl font-bold">{product.name}</h3>
      <p class="text-4xl font-bold text-primary">{formatPrice(product.price)}</p>
      <p class="text-muted-foreground max-w-lg mx-auto">{product.description}</p>

      <!-- Specs -->
      <div class="mt-6 grid grid-cols-2 gap-4 max-w-md mx-auto">
        {#each Object.entries(product.specs) as [key, value]}
          <div class="text-left">
            <dt class="text-sm font-medium text-muted-foreground">{key}</dt>
            <dd class="text-sm font-semibold">{value}</dd>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="p-6 border-t bg-accent/50">
    <button
      onclick={() => store.send({ type: 'closeButtonTapped' })}
      class="w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg font-semibold hover:opacity-90"
    >
      Close
    </button>
  </div>
</div>
