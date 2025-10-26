<script lang="ts">
  import type { Product } from '../../models/product.js';
  import { formatPrice, isInStock } from '../../models/product.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface ProductCardProps {
    product: Product;
    viewMode: 'grid' | 'list';
    onclick?: () => void;
  }

  let { product, viewMode, onclick }: ProductCardProps = $props();
</script>

<!-- ============================================================================ -->
<!-- Product Card -->
<!-- ============================================================================ -->

{#if viewMode === 'grid'}
  <!-- Grid View -->
  <button
    {onclick}
    data-testid="product-card"
    data-product-id={String(product.id)}
    data-product-name={String(product.name)}
    class="group relative flex flex-col p-4 rounded-lg border-2 border-border hover:border-primary hover:shadow-lg transition-all text-left bg-card"
  >
    <!-- Favorite Badge -->
    {#if product.isFavorite}
      <div class="absolute top-2 right-2 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-lg">
        ❤️
      </div>
    {/if}

    <!-- Product Image -->
    <div class="text-6xl text-center mb-4">{product.image}</div>

    <!-- Product Info -->
    <h3 class="font-semibold text-lg mb-1 line-clamp-2">{product.name}</h3>
    <p class="text-sm text-muted-foreground mb-2 capitalize">{product.category}</p>
    <p class="text-xl font-bold text-primary mb-2">{formatPrice(product.price)}</p>

    <!-- Stock Badge -->
    {#if !isInStock(product)}
      <div class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
        Out of Stock
      </div>
    {/if}
  </button>
{:else}
  <!-- List View -->
  <button
    {onclick}
    data-testid="product-card"
    data-product-id={String(product.id)}
    data-product-name={String(product.name)}
    class="group flex items-center gap-4 p-4 rounded-lg border-2 border-border hover:border-primary hover:shadow-lg transition-all text-left bg-card w-full"
  >
    <!-- Product Image -->
    <div class="text-5xl flex-shrink-0">{product.image}</div>

    <!-- Product Info -->
    <div class="flex-1 min-w-0">
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1">
          <h3 class="font-semibold text-lg mb-1">{product.name}</h3>
          <p class="text-sm text-muted-foreground mb-2">{product.description}</p>
          <p class="text-xs text-muted-foreground capitalize">{product.category}</p>
        </div>

        <div class="text-right flex-shrink-0">
          <p class="text-2xl font-bold text-primary mb-2">{formatPrice(product.price)}</p>
          {#if product.isFavorite}
            <span class="text-xl">❤️</span>
          {/if}
        </div>
      </div>

      <!-- Stock Badge -->
      {#if !isInStock(product)}
        <div class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 mt-2">
          Out of Stock
        </div>
      {/if}
    </div>
  </button>
{/if}
