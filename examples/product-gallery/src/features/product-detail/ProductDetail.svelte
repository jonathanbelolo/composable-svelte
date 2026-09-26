<script lang="ts">
  import type { PresentationView } from '@composable-svelte/core/application';
  import { FeatureOutlet, type FeatureViewPropsOf } from '@composable-svelte/core/application';
  import type { ProductDetailState, ProductDetailAction } from './product-detail.types.js';
  import type { Product } from '../../models/product.js';
  import { formatPrice, getStockStatus, isInStock } from '../../models/product.js';
  import { productDetailComposition } from './product-detail.reducer.js';

  // ============================================================================
  // Props
  // ============================================================================

  type ProductDetailProps = Omit<FeatureViewPropsOf<typeof productDetailComposition>, 'store'> & {
    store: PresentationView<ProductDetailState, ProductDetailAction>;
    product: Product;
    onBack?: () => void;
  };

  let { store, views, surface, product, onBack }: ProductDetailProps = $props();

</script>

<!-- ============================================================================ -->
<!-- ProductDetail View -->
<!-- ============================================================================ -->

<div use:surface class="flex flex-col h-full bg-background">
  <!-- Header -->
  <div class="flex items-center gap-4 p-4 border-b">
    {#if onBack}
      <button
        onclick={onBack}
        class="w-10 h-10 rounded-full hover:bg-accent flex items-center justify-center"
        aria-label="Back"
      >
        ←
      </button>
    {/if}
    <h1 class="text-xl font-bold flex-1">Product Details</h1>
    <div class="relative">
      <button
        data-testid="detail-info"
        onclick={() => store.dispatch({ type: 'infoButtonTapped' })}
        class="w-10 h-10 rounded-full hover:bg-accent flex items-center justify-center"
        aria-label="Info"
      >
        ℹ️
      </button>

      <FeatureOutlet view={views.destination} />
    </div>
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto p-6">
    <!-- Product Image -->
    <div class="text-center mb-6">
      <div class="text-8xl">{product.image}</div>
    </div>

    <!-- Product Info -->
    <div class="space-y-4">
      <h2 class="text-3xl font-bold">{product.name}</h2>
      <p class="text-2xl font-bold text-primary">{formatPrice(product.price)}</p>

      <!-- Stock Status -->
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium {isInStock(product) ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
        {getStockStatus(product)}
      </div>

      <p class="text-muted-foreground">{product.description}</p>

      <!-- Specs -->
      <div class="mt-6">
        <h3 class="text-lg font-semibold mb-3">Specifications</h3>
        <dl class="grid grid-cols-2 gap-4">
          {#each Object.entries(product.specs) as [key, value]}
            <div>
              <dt class="text-sm text-muted-foreground">{key}</dt>
              <dd class="text-sm font-semibold">{value}</dd>
            </div>
          {/each}
        </dl>
      </div>
    </div>
  </div>

  <!-- Actions Footer -->
  <div class="p-4 border-t space-y-3">
    <!-- Primary Actions -->
    <div class="grid grid-cols-2 gap-3">
      <button
        data-testid="detail-add-to-cart"
        onclick={() => store.dispatch({ type: 'addToCartButtonTapped' })}
        disabled={!isInStock(product)}
        class="py-3 px-4 bg-primary text-primary-foreground rounded-lg font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Add to Cart
      </button>
      <button
        data-testid="detail-quick-view"
        onclick={() => store.dispatch({ type: 'quickViewButtonTapped' })}
        class="py-3 px-4 bg-secondary text-secondary-foreground rounded-lg font-semibold hover:opacity-90"
      >
        Quick View
      </button>
    </div>

    <!-- Secondary Actions -->
    <div class="grid grid-cols-2 gap-3">
      <button
        data-testid="detail-share"
        onclick={() => store.dispatch({ type: 'shareButtonTapped' })}
        class="py-2 px-4 border-2 border-border rounded-lg font-medium hover:bg-accent"
      >
        Share
      </button>
      <button
        data-testid="detail-delete"
        onclick={() => store.dispatch({ type: 'deleteButtonTapped' })}
        class="py-2 px-4 border-2 border-destructive text-destructive rounded-lg font-medium hover:bg-destructive/10"
      >
        Delete
      </button>
    </div>
  </div>
</div>
