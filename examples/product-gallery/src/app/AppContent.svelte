<script lang="ts">
  import type { ApplicationInstance, FeatureViewPropsOf, PresentationFeatureViewProps, PresentationView } from '@composable-svelte/core/application';
  import { FeatureOutlet, FeatureViews, defineViews } from '@composable-svelte/core/application';
  import { Alert, Modal, Popover, Sheet } from '@composable-svelte/core/navigation-components';
  import CategoryFilter from '../features/category-filter/CategoryFilter.svelte';
  import ProductDetail from '../features/product-detail/ProductDetail.svelte';
  import ProductList from '../features/product-list/ProductList.svelte';
  import AddToCart from '../features/add-to-cart/AddToCart.svelte';
  import Share from '../features/share/Share.svelte';
  import QuickView from '../features/quick-view/QuickView.svelte';
  import DeleteAlert from '../features/delete-alert/DeleteAlert.svelte';
  import type { AddToCartAction, AddToCartState } from '../features/add-to-cart/add-to-cart.types.js';
  import type { ShareAction, ShareState } from '../features/share/share.types.js';
  import type { QuickViewAction, QuickViewState } from '../features/quick-view/quick-view.types.js';
  import type { DeleteAlertAction, DeleteAlertState } from '../features/delete-alert/delete-alert.types.js';
  import type { InfoAction, InfoState, ProductDetailAction, ProductDetailState } from '../features/product-detail/product-detail.types.js';
  import { productDetailComposition } from '../features/product-detail/product-detail.reducer.js';
  import { appComposition } from './app.reducer.js';
  import type { AppAction, AppState } from './app.types.js';

  let { app }: { app: ApplicationInstance<AppState, AppAction> } = $props();
  const state = $derived(app.store.state);
  type ProductDetailViewProps = Omit<FeatureViewPropsOf<typeof productDetailComposition>, 'store'> & {
    store: PresentationView<ProductDetailState, ProductDetailAction>;
  };

  function currentProduct(productId: string | undefined) {
    const product = state.products.find((candidate) => candidate.id === productId);
    if (!product) throw new Error('A managed product view requires its current product');
    return product;
  }

  const productDetailViews = defineViews(productDetailComposition, {
    destination: { cases: {
      addToCart: { content: addToCartContent }, share: { content: shareContent },
      quickView: { content: quickViewContent }, deleteAlert: { content: deleteAlertContent },
      info: { content: infoContent }
    }}
  });
  const rootViews = defineViews(appComposition, {
    productDetail: { content: productDetailContent, children: productDetailViews }
  });
</script>

{#snippet addToCartContent(view: PresentationFeatureViewProps<AddToCartState, AddToCartAction>)}
  <Sheet store={view.store} presentation={state.productDetail?.presentation}
    onPresentationComplete={() => view.store.dispatch({ type: 'presentationCompleted' })}
    onDismissalComplete={() => view.store.dispatch({ type: 'dismissalCompleted' })}>
    {#snippet children()}<AddToCart store={view.store} product={currentProduct(view.store.state?.productId)} />{/snippet}
  </Sheet>
{/snippet}

{#snippet shareContent(view: PresentationFeatureViewProps<ShareState, ShareAction>)}
  <Sheet store={view.store} presentation={state.productDetail?.presentation}
    onPresentationComplete={() => view.store.dispatch({ type: 'presentationCompleted' })}
    onDismissalComplete={() => view.store.dispatch({ type: 'dismissalCompleted' })}>
    {#snippet children()}<Share store={view.store} product={currentProduct(view.store.state?.productId)} />{/snippet}
  </Sheet>
{/snippet}

{#snippet quickViewContent(view: PresentationFeatureViewProps<QuickViewState, QuickViewAction>)}
  <Modal store={view.store} presentation={state.productDetail?.presentation}
    onPresentationComplete={() => view.store.dispatch({ type: 'presentationCompleted' })}
    onDismissalComplete={() => view.store.dispatch({ type: 'dismissalCompleted' })}>
    {#snippet children()}<QuickView store={view.store} product={currentProduct(view.store.state?.productId)} />{/snippet}
  </Modal>
{/snippet}

{#snippet deleteAlertContent(view: PresentationFeatureViewProps<DeleteAlertState, DeleteAlertAction>)}
  <Alert store={view.store} presentation={state.productDetail?.presentation}
    onPresentationComplete={() => view.store.dispatch({ type: 'presentationCompleted' })}
    onDismissalComplete={() => view.store.dispatch({ type: 'dismissalCompleted' })}>
    {#snippet children()}<DeleteAlert store={view.store} product={currentProduct(view.store.state?.productId)} />{/snippet}
  </Alert>
{/snippet}

{#snippet infoContent(view: PresentationFeatureViewProps<InfoState, InfoAction>)}
  {@const product = currentProduct(view.store.state?.productId)}
  <Popover store={view.store} presentation={state.productDetail?.presentation} style="top: 100%; right: 0;"
    onPresentationComplete={() => view.store.dispatch({ type: 'presentationCompleted' })}
    onDismissalComplete={() => view.store.dispatch({ type: 'dismissalCompleted' })}>
    {#snippet children()}
      <div class="p-4 w-64"><h4 class="font-semibold mb-2">Product Information</h4>
        <dl class="space-y-2 text-sm">
          <div><dt class="text-muted-foreground">Product ID</dt><dd class="font-mono">{product.id}</dd></div>
          <div><dt class="text-muted-foreground">Category</dt><dd class="capitalize">{product.category}</dd></div>
          <div><dt class="text-muted-foreground">Stock</dt><dd>{product.stock} units</dd></div>
          <div><dt class="text-muted-foreground">Favorite</dt><dd>{product.isFavorite ? 'Yes' : 'No'}</dd></div>
        </dl>
      </div>
    {/snippet}
  </Popover>
{/snippet}

{#snippet productDetailContent(view: ProductDetailViewProps)}
  {#if view.store.state}
    {@const product = currentProduct(view.store.state.productId)}
    <Modal store={view.store} presentation={state.presentation} class="max-h-[90vh] overflow-y-auto"
      onPresentationComplete={() => view.store.dispatch({ type: 'rootPresentationCompleted' })}
      onDismissalComplete={() => view.store.dispatch({ type: 'rootDismissalCompleted' })}>
      {#snippet children()}<ProductDetail {...view} {product} onBack={() => view.store.dismiss()} />{/snippet}
    </Modal>
  {/if}
{/snippet}

<FeatureViews store={app.store} definition={rootViews}>
  {#snippet children(views)}
    <div class="flex h-screen overflow-hidden bg-gradient-to-br from-background via-background to-muted/20">
      <aside aria-label="Sidebar navigation" class="h-full border-r bg-background overflow-hidden lg:block"
        class:hidden={!state.sidebarExpanded} style="width: 320px;">
        <CategoryFilter selectedCategories={state.filters.selectedCategories}
          onCategoryToggle={(category) => app.store.dispatch({ type: 'categoryToggled', category })} />
      </aside>
      <div class="flex-1 flex flex-col overflow-hidden shadow-2xl">
        <div class="lg:hidden px-6 py-5 border-b-2 flex items-center gap-4 bg-gradient-to-r from-background to-muted/20 shadow-md">
          <button onclick={() => app.store.dispatch({ type: 'sidebarToggled' })}
            class="w-12 h-12 rounded-xl hover:bg-accent flex items-center justify-center text-2xl hover:shadow-lg"
            aria-label="Toggle sidebar">☰</button>
          <h1 class="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">Product Gallery</h1>
        </div>
        <div class="flex-1 overflow-hidden">
          <ProductList products={state.products} cart={state.cart} viewMode={state.viewMode}
            selectedCategories={state.filters.selectedCategories}
            onViewModeChange={(mode) => app.store.dispatch({ type: 'viewModeChanged', mode })}
            onProductClick={(productId) => app.store.dispatch({ type: 'productClicked', productId })}
            onFavoriteToggle={(productId) => app.store.dispatch({ type: 'favoriteToggled', productId })}
            onClearFilters={() => app.store.dispatch({ type: 'filtersCleared' })} />
        </div>
      </div>
    </div>
    <FeatureOutlet view={views.productDetail} />
  {/snippet}
</FeatureViews>
