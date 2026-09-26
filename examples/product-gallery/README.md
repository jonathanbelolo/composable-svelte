# Product Gallery Example

This example shows a routed application with a managed product-detail feature and a nested managed destination. It uses the current application renderer and genuine framework-created views throughout.

## What it demonstrates

- `defineApplication`, `ApplicationRoot`, and `ApplicationHost` own the application store, routing, and renderer resources.
- `ManagedIntegrationBuilder` composes the optional product-detail feature and its destination cases.
- `defineViews`, `FeatureViews`, and `FeatureOutlet` bind the declared view tree to the renderer.
- `Modal`, `Sheet`, `Alert`, and `Popover` receive the exact `PresentationView` minted for their feature or destination case.
- Reducer-owned outputs add products to the cart or delete them from the catalog exactly once after managed action routing.
- Root and nested exits preserve the current owner and immutable child state until animation completion.

## Managed presentation lifecycle

The root application has an optional `productDetail` slot. Product detail has one destination slot with `addToCart`, `share`, `quickView`, `deleteAlert`, and `info` cases. Both integrations opt into deferred dismissal:

```ts
new ManagedIntegrationBuilder(coreReducer)
  .with(productDetailSlot, productDetailComposition, {
    replaceOn: (action) => action.type === 'productClicked',
    dismissal: 'deferred'
  });
```

A primitive Escape or backdrop gesture calls the genuine view's `dismiss()` method. Deferred dismissal keeps that exact child and owner live while the reducer changes its presentation state to `dismissing`. Animation completion dispatches a distinct action through the captured view:

```svelte
<Modal
  store={view.store}
  presentation={state.presentation}
  onPresentationComplete={() =>
    view.store.dispatch({ type: 'rootPresentationCompleted' })}
  onDismissalComplete={() =>
    view.store.dispatch({ type: 'rootDismissalCompleted' })}
>
  <p>Product details</p>
</Modal>
```

The completion action clears the slot. Repeated dismiss requests do not act as completion, and a completion dispatched through a retired view cannot affect a replacement owner. The reducers retain the example's legacy `duration` metadata (`200` at the root and `300` for nested destinations); the primitives use spring completion rather than treating those numbers as elapsed-time guarantees.

Nested destinations follow the same protocol with their own case actions. For example, an add-to-cart sheet dispatches `presentationCompleted` and `dismissalCompleted` through its captured case view. The parent product-detail reducer owns the 300 ms nested presentation state.

Product deletion is deliberately different: confirmed deletion is a business output that immediately removes the catalog item and its outer product-detail owner. The previous example already had no delete-exit animation to preserve.

## State and action flow

The application state contains the catalog, cart, filters, view mode, and an optional `ProductDetailState`. Product detail contains an optional tagged destination plus its nested presentation state.

Leaf reducers emit payload-bearing actions such as `addConfirmed` and `deleteConfirmed`. Managed composition routes those actions through the destination and product-detail boundaries. The application reducer validates the payload and performs the business update. Components dispatch user intent; they do not construct parent stores or duplicate child reduction.

## Main files

```text
src/app/App.svelte                 ApplicationRoot and ApplicationHost
src/app/AppContent.svelte          defineViews declarations and genuine view rendering
src/app/app.reducer.ts             root reducer and optional managed composition
src/features/product-detail/
  product-detail.reducer.ts        destination reducer and managed case composition
  ProductDetail.svelte             product-detail content using its supplied view props
src/features/add-to-cart/          payload-bearing add output
src/features/delete-alert/         payload-bearing delete output
tests/gallery-managed-routing.test.ts
tests/gallery-owner-lifecycle.browser.test.ts
tests/app.browser.test.ts
```

## Run

From this example directory:

```sh
pnpm check
pnpm build
pnpm test
```
