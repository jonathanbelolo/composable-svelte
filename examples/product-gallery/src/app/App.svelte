<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import { Sidebar } from '@composable-svelte/core/navigation-components';
  import { Modal } from '@composable-svelte/core/navigation-components';
  import { scopeTo } from '@composable-svelte/core/navigation';
  import { appReducer } from './app.reducer.js';
  import { createInitialAppState } from './app.types.js';
  import { SAMPLE_PRODUCTS } from '../models/sample-data.js';
  import ProductList from '../features/product-list/ProductList.svelte';
  import ProductDetail from '../features/product-detail/ProductDetail.svelte';
  import CategoryFilter from '../features/category-filter/CategoryFilter.svelte';

  // ============================================================================
  // Store Initialization
  // ============================================================================

  const store = createStore({
    initialState: createInitialAppState(SAMPLE_PRODUCTS),
    reducer: appReducer,
    dependencies: {}
  });

  // ============================================================================
  // Derived State
  // ============================================================================

  const state = $derived(store.state);

  // Phase 3 DSL: Scope to product detail using scopeTo()
  // Phase 2 manual pattern (before):
  // const productDetailStore = $derived(
  //   state.productDetail
  //     ? {
  //         state: state.productDetail,
  //         dispatch: (action: any) => {
  //           store.dispatch({ type: 'productDetail', action: { type: 'presented', action } });
  //         },
  //         dismiss: () => {
  //           store.dispatch({ type: 'productDetail', action: { type: 'dismiss' } });
  //         }
  //       }
  //     : null
  // );

  const productDetailStore = $derived(
    scopeTo(store).into('productDetail').optional()
  );

  const currentProduct = $derived(
    state.productDetail ? state.products.find((p) => p.id === state.productDetail!.productId) : null
  );
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
        onCategoryToggle={(category) => store.dispatch({ type: 'categoryToggled', category })}
      />
    {/snippet}
  </Sidebar>

  <!-- Main Content Area -->
  <div class="flex-1 flex flex-col overflow-hidden">
    <!-- Mobile Menu Button -->
    <div class="lg:hidden p-4 border-b flex items-center gap-4">
      <button
        onclick={() => store.dispatch({ type: 'sidebarToggled' })}
        class="w-10 h-10 rounded-lg hover:bg-accent flex items-center justify-center"
        aria-label="Toggle sidebar"
      >
        ☰
      </button>
      <h1 class="text-xl font-bold">Product Gallery</h1>
    </div>

    <!-- Product List -->
    <div class="flex-1 overflow-hidden">
      <ProductList
        products={state.products}
        cart={state.cart}
        viewMode={state.viewMode}
        selectedCategories={state.filters.selectedCategories}
        onViewModeChange={(mode) => store.dispatch({ type: 'viewModeChanged', mode })}
        onProductClick={(productId) => store.dispatch({ type: 'productClicked', productId })}
      />
    </div>
  </div>
</div>

<!-- ============================================================================ -->
<!-- Product Detail Modal -->
<!-- ============================================================================ -->

{#if productDetailStore && currentProduct}
  <Modal store={productDetailStore} disableClickOutside>
    {#snippet children({ store: detailStore })}
      <ProductDetail
        store={detailStore}
        product={currentProduct}
        onBack={() => detailStore.dismiss()}
      />
    {/snippet}
  </Modal>
{/if}
