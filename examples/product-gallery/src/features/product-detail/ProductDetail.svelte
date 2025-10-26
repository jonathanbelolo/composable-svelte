<script lang="ts">
  import type { Store } from '@composable-svelte/core';
  import type { ProductDetailState, ProductDetailAction } from './product-detail.types.js';
  import type { Product } from '../../models/product.js';
  import { formatPrice, getStockStatus, isInStock } from '../../models/product.js';
  import { Sheet } from '@composable-svelte/core/navigation-components';
  import { Modal } from '@composable-svelte/core/navigation-components';
  import { Alert } from '@composable-svelte/core/navigation-components';
  import { Popover } from '@composable-svelte/core/navigation-components';
  import { scopeToDestination } from '@composable-svelte/core/navigation';
  import AddToCart from '../add-to-cart/AddToCart.svelte';
  import Share from '../share/Share.svelte';
  import QuickView from '../quick-view/QuickView.svelte';
  import DeleteAlert from '../delete-alert/DeleteAlert.svelte';

  // ============================================================================
  // Props
  // ============================================================================

  interface ProductDetailProps {
    store: Store<ProductDetailState, ProductDetailAction>;
    product: Product;
    onBack?: () => void;
  }

  let { store, product, onBack }: ProductDetailProps = $props();

  // ============================================================================
  // Scoped Stores
  // ============================================================================

  const addToCartStore = $derived(
    scopeToDestination(store, ['destination'], 'addToCart', 'destination')
  );

  const shareStore = $derived(
    scopeToDestination(store, ['destination'], 'share', 'destination')
  );

  const quickViewStore = $derived(
    scopeToDestination(store, ['destination'], 'quickView', 'destination')
  );

  const deleteAlertStore = $derived(
    scopeToDestination(store, ['destination'], 'deleteAlert', 'destination')
  );

  const infoPopoverVisible = $derived(store.state.destination?.type === 'info');

  // ============================================================================
  // Handlers
  // ============================================================================

  let infoButtonRef: HTMLButtonElement | undefined = $state();
</script>

<!-- ============================================================================ -->
<!-- ProductDetail View -->
<!-- ============================================================================ -->

<div class="flex flex-col h-full bg-background">
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
    <button
      bind:this={infoButtonRef}
      onclick={() => store.dispatch({ type: 'infoButtonTapped' })}
      class="w-10 h-10 rounded-full hover:bg-accent flex items-center justify-center"
      aria-label="Info"
    >
      ℹ️
    </button>
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
        onclick={() => store.dispatch({ type: 'addToCartButtonTapped' })}
        disabled={!isInStock(product)}
        class="py-3 px-4 bg-primary text-primary-foreground rounded-lg font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Add to Cart
      </button>
      <button
        onclick={() => store.dispatch({ type: 'quickViewButtonTapped' })}
        class="py-3 px-4 bg-secondary text-secondary-foreground rounded-lg font-semibold hover:opacity-90"
      >
        Quick View
      </button>
    </div>

    <!-- Secondary Actions -->
    <div class="grid grid-cols-2 gap-3">
      <button
        onclick={() => store.dispatch({ type: 'shareButtonTapped' })}
        class="py-2 px-4 border-2 border-border rounded-lg font-medium hover:bg-accent"
      >
        Share
      </button>
      <button
        onclick={() => store.dispatch({ type: 'deleteButtonTapped' })}
        class="py-2 px-4 border-2 border-destructive text-destructive rounded-lg font-medium hover:bg-destructive/10"
      >
        Delete
      </button>
    </div>
  </div>
</div>

<!-- ============================================================================ -->
<!-- Navigation Destinations -->
<!-- ============================================================================ -->

<!-- AddToCart Sheet -->
<Sheet store={addToCartStore}>
  {#snippet children({ store: childStore })}
    <AddToCart store={childStore} {product} />
  {/snippet}
</Sheet>

<!-- Share Sheet -->
<Sheet store={shareStore}>
  {#snippet children({ store: childStore })}
    <Share store={childStore} {product} />
  {/snippet}
</Sheet>

<!-- QuickView Modal -->
<Modal store={quickViewStore}>
  {#snippet children({ store: childStore })}
    <QuickView store={childStore} {product} />
  {/snippet}
</Modal>

<!-- Delete Alert -->
<Alert store={deleteAlertStore}>
  {#snippet children({ store: childStore })}
    <DeleteAlert store={childStore} {product} />
  {/snippet}
</Alert>

<!-- Info Popover -->
{#if infoPopoverVisible && infoButtonRef}
  <Popover
    triggerElement={infoButtonRef}
    onClose={() => store.dispatch({
      type: 'destination',
      action: { type: 'dismiss' }
    })}
  >
    {#snippet children()}
      <div class="p-4 w-64">
        <h4 class="font-semibold mb-2">Product Information</h4>
        <dl class="space-y-2 text-sm">
          <div>
            <dt class="text-muted-foreground">Product ID</dt>
            <dd class="font-mono">{product.id}</dd>
          </div>
          <div>
            <dt class="text-muted-foreground">Category</dt>
            <dd class="capitalize">{product.category}</dd>
          </div>
          <div>
            <dt class="text-muted-foreground">Stock</dt>
            <dd>{product.stock} units</dd>
          </div>
          <div>
            <dt class="text-muted-foreground">Favorite</dt>
            <dd>{product.isFavorite ? 'Yes' : 'No'}</dd>
          </div>
        </dl>
      </div>
    {/snippet}
  </Popover>
{/if}
