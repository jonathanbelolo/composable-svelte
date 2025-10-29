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

<div class="flex h-screen overflow-hidden bg-gradient-to-br from-background via-background to-muted/20">
  <!-- Sidebar (Desktop) - Enhanced with Shadow -->
  <Sidebar expanded={state.sidebarExpanded} side="left" width="320px">
    {#snippet children()}
      <CategoryFilter
        selectedCategories={state.filters.selectedCategories}
        onCategoryToggle={(category) => store.dispatch({ type: 'categoryToggled', category })}
      />
    {/snippet}
  </Sidebar>

  <!-- Main Content Area - Enhanced with Structure -->
  <div class="flex-1 flex flex-col overflow-hidden shadow-2xl">
    <!-- Mobile Menu Button - Enhanced -->
    <div class="lg:hidden px-6 py-5 border-b-2 flex items-center gap-4 bg-gradient-to-r from-background to-muted/20 shadow-md">
      <button
        onclick={() => store.dispatch({ type: 'sidebarToggled' })}
        class="w-12 h-12 rounded-xl hover:bg-accent flex items-center justify-center text-2xl transition-all hover:shadow-lg"
        aria-label="Toggle sidebar"
      >
        ☰
      </button>
      <h1 class="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">Product Gallery</h1>
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
  <Modal
    store={productDetailStore}
    presentation={state.presentation}
    onPresentationComplete={() =>
      store.dispatch({ type: 'presentation', event: { type: 'presentationCompleted' } })}
    onDismissalComplete={() =>
      store.dispatch({ type: 'presentation', event: { type: 'dismissalCompleted' } })}
    disableClickOutside
  >
    {#snippet children({ store: detailStore })}
      <ProductDetail
        store={detailStore}
        product={currentProduct}
        onBack={() => detailStore.dismiss()}
      />
    {/snippet}
  </Modal>
{/if}
