import { describe, expect, it, onTestFinished } from 'vitest';
import { createStore } from '@composable-svelte/core';
import { nestedSlot } from '@composable-svelte/core/application';
import {
  appComposition,
  productDetailSlot
} from '../src/app/app.reducer.js';
import { createInitialAppState, type AppAction } from '../src/app/app.types.js';
import { appRouting } from '../src/app/app.routing.js';
import {
  productDetailDestinationSlot
} from '../src/features/product-detail/product-detail.reducer.js';
import { SAMPLE_PRODUCTS } from '../src/models/sample-data.js';

function setup() {
  const store = createStore({
    initialState: createInitialAppState(SAMPLE_PRODUCTS),
    ...appComposition,
    dependencies: {},
    ssr: { deferEffects: false }
  });
  onTestFinished(() => store.destroy());
  return store;
}

function openDetail(store: ReturnType<typeof setup>, productId = SAMPLE_PRODUCTS[0]!.id) {
  store.dispatch({ type: 'productClicked', productId });
  const detail = appComposition.bind(store, productDetailSlot)!;
  detail.dispatch({ type: 'rootPresentationCompleted' });
  return detail;
}

const addSlot = nestedSlot(productDetailSlot, productDetailDestinationSlot.case('addToCart'));
const deleteSlot = nestedSlot(productDetailSlot, productDetailDestinationSlot.case('deleteAlert'));

async function drainManagedEffects() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

function subscribeToActions(
  store: ReturnType<typeof setup>,
  listener: (action: AppAction) => void
): () => void {
  const subscribe = store.subscribeToActions;
  expect(subscribe).toBeTypeOf('function');
  if (!subscribe) throw new Error('managed createStore must expose action subscriptions');
  return subscribe((action) => listener(action));
}

function isConfirmedOutput(action: AppAction, kind: 'addToCart' | 'deleteAlert'): boolean {
  if (action.type !== 'productDetail' || action.action.type !== 'presented') return false;
  const detail = action.action.action;
  if (detail.type !== 'destination' || detail.action.type !== 'presented') return false;
  const destination = detail.action.action;
  return kind === 'addToCart'
    ? destination.type === 'addToCart' && destination.action.type === 'addConfirmed'
    : destination.type === 'deleteAlert' && destination.action.type === 'deleteConfirmed';
}

describe('gallery managed root and routing', () => {
  it('routes one incremented add output through both managed cores exactly once', async () => {
    const store = setup();
    const actions: AppAction[] = [];
    subscribeToActions(store, (action) => actions.push(action));
    const detail = openDetail(store);
    detail.dispatch({ type: 'addToCartButtonTapped' });
    const add = appComposition.bind(store, addSlot)!;
    add.dispatch({ type: 'presentationCompleted' });
    add.dispatch({ type: 'incrementQuantity' });
    add.dispatch({ type: 'addButtonTapped' });
    await drainManagedEffects();
    expect(store.state.cart.items).toEqual([{ productId: SAMPLE_PRODUCTS[0]!.id, quantity: 2 }]);
    expect(actions.filter((action) => isConfirmedOutput(action, 'addToCart'))).toHaveLength(1);
    expect(store.state.productDetail?.presentation.status).toBe('dismissing');
  });

  it('drops a queued output after root owner replacement', async () => {
    const store = setup();
    const firstId = SAMPLE_PRODUCTS[0]!.id;
    const replacementId = SAMPLE_PRODUCTS[1]!.id;
    const detail = openDetail(store, firstId);
    detail.dispatch({ type: 'addToCartButtonTapped' });
    const stale = appComposition.bind(store, addSlot)!;
    const stop = subscribeToActions(store, (action) => {
      if (
        action.type === 'productDetail' &&
        action.action.type === 'presented' &&
        action.action.action.type === 'destination' &&
        action.action.action.action.type === 'presented' &&
        action.action.action.action.action.type === 'addToCart' &&
        action.action.action.action.action.action.type === 'addButtonTapped'
      ) {
        stop();
        store.dispatch({ type: 'productClicked', productId: replacementId });
      }
    });
    stale.dispatch({ type: 'addButtonTapped' });
    await drainManagedEffects();
    expect(store.state.productDetail?.productId).toBe(replacementId);
    expect(store.state.cart.items).toEqual([]);
    expect(stale.state).toBeUndefined();
  });

  it('deletes once from routed output and immediately retires the outer owner', async () => {
    const store = setup();
    const deletedId = SAMPLE_PRODUCTS[0]!.id;
    const actions: AppAction[] = [];
    subscribeToActions(store, (action) => actions.push(action));
    const detail = openDetail(store, deletedId);
    detail.dispatch({ type: 'deleteButtonTapped' });
    appComposition.bind(store, deleteSlot)!.dispatch({ type: 'confirmButtonTapped' });
    await drainManagedEffects();
    expect(store.state.products.some((product) => product.id === deletedId)).toBe(false);
    expect(store.state.productDetail).toBeNull();
    expect(store.state.presentation.status).toBe('idle');
    expect(actions.filter((action) => isConfirmedOutput(action, 'deleteAlert'))).toHaveLength(1);
    expect(detail.state).toBeUndefined();
  });

  it('drops a queued delete output after root owner replacement', async () => {
    const store = setup();
    const deletedId = SAMPLE_PRODUCTS[0]!.id;
    const replacementId = SAMPLE_PRODUCTS[1]!.id;
    const detail = openDetail(store, deletedId);
    detail.dispatch({ type: 'deleteButtonTapped' });
    const stale = appComposition.bind(store, deleteSlot)!;
    const stop = subscribeToActions(store, (action) => {
      if (
        action.type === 'productDetail' &&
        action.action.type === 'presented' &&
        action.action.action.type === 'destination' &&
        action.action.action.action.type === 'presented' &&
        action.action.action.action.action.type === 'deleteAlert' &&
        action.action.action.action.action.action.type === 'confirmButtonTapped'
      ) {
        stop();
        store.dispatch({ type: 'productClicked', productId: replacementId });
      }
    });
    stale.dispatch({ type: 'confirmButtonTapped' });
    await drainManagedEffects();
    expect(store.state.products.some((product) => product.id === deletedId)).toBe(true);
    expect(store.state.productDetail?.productId).toBe(replacementId);
    expect(stale.state).toBeUndefined();
  });

  it('keeps the outer owner through the 200ms bridge and retires it on genuine dismiss', () => {
    const store = setup();
    const detail = openDetail(store);
    store.dispatch({ type: 'presentation', event: { type: 'dismissalRequested' } });
    expect(store.state.presentation).toMatchObject({ status: 'dismissing', duration: 200 });
    expect(detail.state).toBeDefined();
    detail.dispatch({ type: 'rootDismissalCompleted' });
    expect(store.state.productDetail).toBeNull();
    expect(store.state.presentation.status).toBe('idle');
    expect(detail.state).toBeUndefined();
  });

  it('keeps routing pure and canonical for home, product, and unsupported paths', () => {
    const state = createInitialAppState(SAMPLE_PRODUCTS, SAMPLE_PRODUCTS[0]!.id);
    expect(appRouting.serialize(state)).toBe(`/product/${SAMPLE_PRODUCTS[0]!.id}`);
    expect(appRouting.request('/')).toEqual({
      action: { type: 'presentation', event: { type: 'dismissalRequested' } },
      expectedURL: '/'
    });
    expect(appRouting.request(`/product/${SAMPLE_PRODUCTS[1]!.id}?from=test`)).toEqual({
      action: { type: 'productClicked', productId: SAMPLE_PRODUCTS[1]!.id },
      expectedURL: `/product/${SAMPLE_PRODUCTS[1]!.id}`
    });
    expect(appRouting.request('/unsupported')).toBeUndefined();
  });
});
