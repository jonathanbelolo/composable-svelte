import { describe, expect, it, onTestFinished } from 'vitest';
import { createStore, type Reducer } from '@composable-svelte/core';
import { addToCartReducer } from '../src/features/add-to-cart/add-to-cart.reducer.js';
import type { AddToCartAction, AddToCartState } from '../src/features/add-to-cart/add-to-cart.types.js';
import { deleteAlertReducer } from '../src/features/delete-alert/delete-alert.reducer.js';
import type { DeleteAlertAction, DeleteAlertState } from '../src/features/delete-alert/delete-alert.types.js';

function recordingAdd(actions: AddToCartAction[]): Reducer<AddToCartState, AddToCartAction, {}> {
  return (state, action, dependencies) => {
    actions.push(action);
    return addToCartReducer(state, action, dependencies);
  };
}
function recordingDelete(actions: DeleteAlertAction[]): Reducer<DeleteAlertState, DeleteAlertAction, {}> {
  return (state, action, dependencies) => {
    actions.push(action);
    return deleteAlertReducer(state, action, dependencies);
  };
}

describe('gallery reducer-owned output protocol', () => {
  it('emits exactly one add payload with the current product and incremented quantity', () => {
    const actions: AddToCartAction[] = [];
    const store = createStore({ initialState: { productId: 'prod-1', quantity: 1 }, reducer: recordingAdd(actions), dependencies: {} });
    onTestFinished(() => store.destroy());
    store.dispatch({ type: 'incrementQuantity' });
    store.dispatch({ type: 'addButtonTapped' });
    expect(actions).toEqual([
      { type: 'incrementQuantity' },
      { type: 'addButtonTapped' },
      { type: 'addConfirmed', productId: 'prod-1', quantity: 2 }
    ]);
    expect(store.state).toEqual({ productId: 'prod-1', quantity: 2 });
  });

  it('emits exactly one delete payload with the current product', () => {
    const actions: DeleteAlertAction[] = [];
    const store = createStore({ initialState: { productId: 'prod-delete' }, reducer: recordingDelete(actions), dependencies: {} });
    onTestFinished(() => store.destroy());
    store.dispatch({ type: 'confirmButtonTapped' });
    expect(actions).toEqual([
      { type: 'confirmButtonTapped' },
      { type: 'deleteConfirmed', productId: 'prod-delete' }
    ]);
  });

  it('treats emitted outputs as terminal reducer no-ops', () => {
    const addState: AddToCartState = { productId: 'prod-1', quantity: 2 };
    const [sameAdd, addEffect] = addToCartReducer(addState, { type: 'addConfirmed', productId: 'prod-1', quantity: 2 }, {});
    const deleteState: DeleteAlertState = { productId: 'prod-1' };
    const [sameDelete, deleteEffect] = deleteAlertReducer(deleteState, { type: 'deleteConfirmed', productId: 'prod-1' }, {});
    expect(sameAdd).toBe(addState);
    expect(addEffect._tag).toBe('None');
    expect(sameDelete).toBe(deleteState);
    expect(deleteEffect._tag).toBe('None');
  });

  it('keeps both cancel intents effect-free', () => {
    expect(addToCartReducer({ productId: 'prod-1', quantity: 1 }, { type: 'cancelButtonTapped' }, {})[1]._tag).toBe('None');
    expect(deleteAlertReducer({ productId: 'prod-1' }, { type: 'cancelButtonTapped' }, {})[1]._tag).toBe('None');
  });

  it('does not emit output from malformed internal snapshots', () => {
    const invalidAdd: AddToCartState[] = [
      { productId: '', quantity: 1 },
      { productId: 'prod-1', quantity: 0 },
      { productId: 'prod-1', quantity: 1.5 },
      { productId: 'prod-1', quantity: Number.NaN }
    ];
    for (const state of invalidAdd) expect(addToCartReducer(state, { type: 'addButtonTapped' }, {})[1]._tag).toBe('None');
    expect(deleteAlertReducer({ productId: '' }, { type: 'confirmButtonTapped' }, {})[1]._tag).toBe('None');
  });
});
