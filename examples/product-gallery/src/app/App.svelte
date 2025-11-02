<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createStore } from '@composable-svelte/core';
  import { Modal } from '@composable-svelte/core/navigation-components';
  import { scopeTo } from '@composable-svelte/core/navigation';
  import { syncBrowserHistory } from '@composable-svelte/core/routing';
  import { appReducer } from './app.reducer.js';
  import { createInitialAppState } from './app.types.js';
  import { parseAppURL, serializeAppState, productIdToAction } from './app.routing.js';
  import { SAMPLE_PRODUCTS } from '../models/sample-data.js';
  import { createProductDetailState } from '../features/product-detail/product-detail.types.js';
  import ProductList from '../features/product-list/ProductList.svelte';
  import ProductDetail from '../features/product-detail/ProductDetail.svelte';
  import CategoryFilter from '../features/category-filter/CategoryFilter.svelte';

  // ============================================================================
  // Store Initialization with Deep Linking
  // ============================================================================

  // Initialize state from URL (deep linking support)
  const defaultState = createInitialAppState(SAMPLE_PRODUCTS);
  const productIdFromURL = parseAppURL(window.location.pathname);
  const initialState = productIdFromURL
    ? {
        ...defaultState,
        productDetail: createProductDetailState(productIdFromURL),
        presentation: { status: 'presented' as const, content: createProductDetailState(productIdFromURL) }
      }
    : defaultState;

  const store = createStore({
    initialState,
    reducer: appReducer,
    dependencies: {}
  });

  // ============================================================================
  // Browser History Sync
  // ============================================================================

  let cleanup: (() => void) | null = null;

  onMount(() => {
    cleanup = syncBrowserHistory(store, {
      parse: parseAppURL,
      serialize: serializeAppState,
      destinationToAction: productIdToAction
    });
  });

  onDestroy(() => {
    cleanup?.();
  });

  // ============================================================================
  // Derived State
  // ============================================================================

  // Use onMount + subscribe instead of $derived to avoid infinite loops
  let state = $state(initialState);

  onMount(() => {
    const unsubscribe = store.subscribe(s => state = s);
    return unsubscribe;
  });

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
  <aside
    class="h-full border-r bg-background overflow-hidden transition-all duration-300 lg:block"
    class:hidden={!state.sidebarExpanded}
    style="width: 320px;"
  >
    <CategoryFilter
      selectedCategories={state.filters.selectedCategories}
      onCategoryToggle={(category) => store.dispatch({ type: 'categoryToggled', category })}
    />
  </aside>

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
