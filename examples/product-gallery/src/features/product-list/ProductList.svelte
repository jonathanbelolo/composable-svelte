<script lang="ts">
  import type { Product, ProductCategory } from '../../models/product.js';
  import type { ViewMode } from '../../app/app.types.js';
  import ProductCard from './ProductCard.svelte';
  import { getTotalItems } from '../../models/cart.js';
  import type { CartState } from '../../models/cart.js';

  // Phase 6 Components
  import Empty from '@composable-svelte/core/components/ui/empty/Empty.svelte';
  import Button from '@composable-svelte/core/components/ui/button/Button.svelte';

  // ============================================================================
  // Props
  // ============================================================================

  interface ProductListProps {
    products: Product[];
    cart: CartState;
    viewMode: ViewMode;
    selectedCategories: ProductCategory[];
    onViewModeChange: (mode: ViewMode) => void;
    onProductClick: (productId: string) => void;
  }

  let {
    products,
    cart,
    viewMode,
    selectedCategories,
    onViewModeChange,
    onProductClick
  }: ProductListProps = $props();

  // ============================================================================
  // Filtered Products
  // ============================================================================

  const filteredProducts = $derived.by(() => {
    let filtered = products;

    // Filter by category
    if (selectedCategories.length > 0) {
      filtered = filtered.filter((p) => selectedCategories.includes(p.category));
    }

    // Filter by view mode
    if (viewMode === 'favorites') {
      filtered = filtered.filter((p) => p.isFavorite);
    }

    return filtered;
  });

  // ============================================================================
  // View Mode Tabs
  // ============================================================================

  const viewModes: Array<{ id: ViewMode; label: string; icon: string }> = [
    { id: 'grid', label: 'Grid', icon: '⊞' },
    { id: 'list', label: 'List', icon: '☰' },
    { id: 'favorites', label: 'Favorites', icon: '❤️' }
  ];

  // ============================================================================
  // Cart Total
  // ============================================================================

  const cartTotal = $derived(getTotalItems(cart));
</script>

<!-- ============================================================================ -->
<!-- ProductList View -->
<!-- ============================================================================ -->

<div class="flex flex-col h-full bg-background">
  <!-- Header - Enhanced with Better Structure -->
  <div class="flex items-center justify-between px-8 py-6 border-b-2 bg-gradient-to-r from-background to-muted/20 shadow-sm">
    <h1 class="text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">Products</h1>

    <!-- Cart Badge - Enhanced -->
    {#if cartTotal > 0}
      <div class="relative">
        <span class="text-4xl drop-shadow-lg">🛒</span>
        <span class="absolute -top-2 -right-2 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold shadow-lg ring-2 ring-background">
          {cartTotal}
        </span>
      </div>
    {/if}
  </div>

  <!-- View Mode Tabs - Enhanced Visual Hierarchy -->
  <div class="border-b-2 border-border bg-muted/30">
    <div class="flex px-8" role="tablist">
      {#each viewModes as mode, index (mode.id)}
        <button
          role="tab"
          aria-selected={viewMode === mode.id}
          onclick={() => onViewModeChange(mode.id)}
          class="flex items-center gap-3 px-8 py-4 font-semibold transition-all border-b-4 {viewMode ===
          mode.id
            ? 'border-primary text-primary bg-background/50'
            : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-background/30'}"
        >
          <span class="text-xl">{mode.icon}</span>
          <span class="text-base">{mode.label}</span>
        </button>
      {/each}
    </div>
  </div>

  <!-- Product Grid/List - Dramatically Enhanced Spacing -->
  <div class="flex-1 overflow-y-auto p-8 bg-gradient-to-b from-background to-muted/10">
    {#if filteredProducts.length === 0}
      <!-- Empty State with Empty Component -->
      <div class="flex items-center justify-center h-full">
        <Empty
          title="No products found"
          description={viewMode === 'favorites'
            ? "You haven't favorited any products yet."
            : selectedCategories.length > 0
              ? 'No products match your selected categories.'
              : 'No products available.'}
        >
          {#snippet icon()}
            <div class="text-8xl mb-6 opacity-50">
              {#if viewMode === 'favorites'}
                💔
              {:else}
                📦
              {/if}
            </div>
          {/snippet}

          {#if selectedCategories.length > 0}
            {#snippet actions()}
              <Button variant="outline" size="default" onclick={() => onViewModeChange('grid')}>
                Clear Filters
              </Button>
            {/snippet}
          {/if}
        </Empty>
      </div>
    {:else if viewMode === 'grid'}
      <!-- Grid View - Enhanced with Generous Spacing -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 auto-rows-fr">
        {#each filteredProducts as product (product.id)}
          <ProductCard
            {product}
            viewMode="grid"
            onclick={() => onProductClick(product.id)}
          />
        {/each}
      </div>
    {:else}
      <!-- List View (or Favorites in list mode) - Enhanced Spacing -->
      <div class="space-y-6">
        {#each filteredProducts as product (product.id)}
          <ProductCard
            {product}
            viewMode="list"
            onclick={() => onProductClick(product.id)}
          />
        {/each}
      </div>
    {/if}
  </div>
</div>
