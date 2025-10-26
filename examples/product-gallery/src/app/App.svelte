<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import { Sidebar } from '@composable-svelte/core/navigation-components';
  import { appReducer } from './app.reducer.js';
  import { createInitialAppState } from './app.types.js';
  import { SAMPLE_PRODUCTS } from '../models/sample-data.js';
  import ProductList from '../features/product-list/ProductList.svelte';
  import ProductDetail from '../features/product-detail/ProductDetail.svelte';
  import CategoryFilter from '../features/category-filter/CategoryFilter.svelte';

  // ============================================================================
  // Store Initialization
  // ============================================================================

  const store = createStore(appReducer, createInitialAppState(SAMPLE_PRODUCTS), {});

  // ============================================================================
  // Derived State
  // ============================================================================

  const state = $derived(store.state);
  const currentProduct = $derived.by(() => {
    const lastDetail = state.detailPath[state.detailPath.length - 1];
    if (!lastDetail) return null;
    return state.products.find((p) => p.id === lastDetail.productId) ?? null;
  });
</script>

<!-- ============================================================================ -->
<!-- Root App Layout -->
<!-- ============================================================================ -->

<div class="flex h-screen overflow-hidden">
  <!-- Sidebar (Desktop) -->
  <Sidebar expanded={state.sidebarExpanded} side="left" width="280px">
    {#snippet children()}
      <CategoryFilter
        selectedCategories={state.filters.selectedCategories}
        onCategoryToggle={(category) => store.send({ type: 'categoryToggled', category })}
      />
    {/snippet}
  </Sidebar>

  <!-- Main Content Area -->
  <div class="flex-1 flex flex-col overflow-hidden">
    <!-- Mobile Menu Button -->
    <div class="lg:hidden p-4 border-b flex items-center gap-4">
      <button
        onclick={() => store.send({ type: 'sidebarToggled' })}
        class="w-10 h-10 rounded-lg hover:bg-accent flex items-center justify-center"
        aria-label="Toggle sidebar"
      >
        ☰
      </button>
      <h1 class="text-xl font-bold">Product Gallery</h1>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-hidden relative">
      <!-- Base Layer: Product List -->
      {#if state.detailPath.length === 0}
        <ProductList
          products={state.products}
          cart={state.cart}
          viewMode={state.viewMode}
          selectedCategories={state.filters.selectedCategories}
          onViewModeChange={(mode) => store.send({ type: 'viewModeChanged', mode })}
          onProductClick={(productId) => store.send({ type: 'productClicked', productId })}
        />
      {/if}

      <!-- Stack Layer: Product Detail (only show last one) -->
      {#if state.detailPath.length > 0 && currentProduct}
        <div class="absolute inset-0 bg-background">
          <ProductDetail
            store={store}
            product={currentProduct}
            onBack={() => {
              store.send({
                type: 'detailPath',
                action: { type: 'pop' }
              });
            }}
          />
        </div>
      {/if}
    </div>
  </div>
</div>
