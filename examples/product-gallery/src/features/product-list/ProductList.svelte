<script lang="ts">
  import type { Product, ProductCategory } from '../../models/product.js';
  import type { ViewMode } from '../../app/app.types.js';
  import ProductCard from './ProductCard.svelte';
  import { getTotalItems } from '../../models/cart.js';
  import type { CartState } from '../../models/cart.js';

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
  <!-- Header -->
  <div class="flex items-center justify-between p-4 border-b">
    <h1 class="text-2xl font-bold">Products</h1>

    <!-- Cart Badge -->
    {#if cartTotal > 0}
      <div class="relative">
        <span class="text-3xl">🛒</span>
        <span class="absolute -top-1 -right-1 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold">
          {cartTotal}
        </span>
      </div>
    {/if}
  </div>

  <!-- View Mode Tabs -->
  <div class="border-b border-border">
    <div class="flex" role="tablist">
      {#each viewModes as mode, index (mode.id)}
        <button
          role="tab"
          aria-selected={viewMode === mode.id}
          onclick={() => onViewModeChange(mode.id)}
          class="flex items-center gap-2 px-6 py-3 font-medium transition-colors border-b-2 {viewMode ===
          mode.id
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground'}"
        >
          <span class="text-lg">{mode.icon}</span>
          <span>{mode.label}</span>
        </button>
      {/each}
    </div>
  </div>

  <!-- Product Grid/List -->
  <div class="flex-1 overflow-y-auto p-4">
    {#if filteredProducts.length === 0}
      <!-- Empty State -->
      <div class="flex flex-col items-center justify-center h-full text-center p-8">
        <div class="text-6xl mb-4">📦</div>
        <h3 class="text-xl font-semibold mb-2">No products found</h3>
        <p class="text-muted-foreground">
          {#if viewMode === 'favorites'}
            You haven't favorited any products yet.
          {:else if selectedCategories.length > 0}
            No products match your selected categories.
          {:else}
            No products available.
          {/if}
        </p>
      </div>
    {:else if viewMode === 'grid'}
      <!-- Grid View -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {#each filteredProducts as product (product.id)}
          <ProductCard
            {product}
            viewMode="grid"
            onclick={() => onProductClick(product.id)}
          />
        {/each}
      </div>
    {:else}
      <!-- List View (or Favorites in list mode) -->
      <div class="space-y-4">
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
