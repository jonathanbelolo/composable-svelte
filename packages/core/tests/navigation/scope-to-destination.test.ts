/**
 * Tests for scopeToDestination and scopeToOptional
 */

import { describe, it, expect } from 'vitest';
import { createStore } from '../../src/store.svelte.js';
import { Effect } from '../../src/effect.js';
import {
  scopeToDestination,
  scopeToOptional,
  type PresentationAction
} from '../../src/navigation/index.js';
import type { Reducer } from '../../src/types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

interface AddItemState {
  item: string;
  quantity: number;
}

interface EditItemState {
  id: string;
  item: string;
  quantity: number;
}

type Destination =
  | { type: 'addItem'; state: AddItemState }
  | { type: 'editItem'; state: EditItemState };

type ChildAction =
  | { type: 'updateItem'; value: string }
  | { type: 'updateQuantity'; value: number }
  | { type: 'save' }
  | { type: 'cancel' };

type DestinationAction =
  | { type: 'addItem'; action: ChildAction }
  | { type: 'editItem'; action: ChildAction };

interface ParentState {
  destination: Destination | null;
  items: string[];
}

type ParentAction =
  | { type: 'showAddItem' }
  | { type: 'showEditItem'; id: string }
  | { type: 'destination'; action: PresentationAction<DestinationAction> }
  | { type: 'addItem'; item: string };

const parentReducer: Reducer<ParentState, ParentAction, null> = (state, action) => {
  switch (action.type) {
    case 'showAddItem':
      return [
        {
          ...state,
          destination: { type: 'addItem', state: { item: '', quantity: 1 } }
        },
        Effect.none()
      ];

    case 'showEditItem':
      return [
        {
          ...state,
          destination: {
            type: 'editItem',
            state: { id: action.id, item: 'test', quantity: 1 }
          }
        },
        Effect.none()
      ];

    case 'destination':
      if (action.action.type === 'dismiss') {
        return [{ ...state, destination: null }, Effect.none()];
      }
      // In real app, would delegate to child reducer via ifLet
      return [state, Effect.none()];

    case 'addItem':
      return [
        {
          ...state,
          items: [...state.items, action.item],
          destination: null
        },
        Effect.none()
      ];

    default:
      return [state, Effect.none()];
  }
};

// ============================================================================
// scopeToDestination() Tests
// ============================================================================

describe('scopeToDestination()', () => {
  it('returns null state when destination is null', () => {
    const initialState: ParentState = {
      destination: null,
      items: []
    };

    const store = createStore({
      initialState,
      reducer: parentReducer,
      dependencies: null
    });

    const scopedStore = scopeToDestination<AddItemState, ChildAction>(
      store,
      ['destination'],
      'addItem',
      'destination'
    );

    expect(scopedStore.state).toBeNull();
  });

  it('returns null state when destination type does not match', () => {
    const initialState: ParentState = {
      destination: {
        type: 'editItem',
        state: { id: '123', item: 'apple', quantity: 1 }
      },
      items: []
    };

    const store = createStore({
      initialState,
      reducer: parentReducer,
      dependencies: null
    });

    // Scope to 'addItem' but destination is 'editItem'
    const scopedStore = scopeToDestination<AddItemState, ChildAction>(
      store,
      ['destination'],
      'addItem',
      'destination'
    );

    expect(scopedStore.state).toBeNull();
  });

  it('returns scoped store when destination matches case type', () => {
    const initialState: ParentState = {
      destination: {
        type: 'addItem',
        state: { item: 'apple', quantity: 5 }
      },
      items: []
    };

    const store = createStore({
      initialState,
      reducer: parentReducer,
      dependencies: null
    });

    const scopedStore = scopeToDestination<AddItemState, ChildAction>(
      store,
      ['destination'],
      'addItem',
      'destination'
    );

    expect(scopedStore.state).not.toBeNull();
    expect(scopedStore.state).toEqual({ item: 'apple', quantity: 5 });
  });

  it('dispatch() wraps actions with case type and PresentationAction.presented', () => {
    const initialState: ParentState = {
      destination: {
        type: 'addItem',
        state: { item: 'apple', quantity: 5 }
      },
      items: []
    };

    const dispatched: ParentAction[] = [];

    const testReducer: Reducer<ParentState, ParentAction, null> = (state, action) => {
      dispatched.push(action);
      return parentReducer(state, action, null);
    };

    const store = createStore({
      initialState,
      reducer: testReducer,
      dependencies: null
    });

    const scopedStore = scopeToDestination<AddItemState, ChildAction>(
      store,
      ['destination'],
      'addItem',
      'destination'
    );

    // Dispatch child action
    scopedStore.dispatch({ type: 'updateItem', value: 'banana' });

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toEqual({
      type: 'destination',
      action: {
        type: 'presented',
        action: {
          type: 'addItem',  // Case type wrapper
          action: { type: 'updateItem', value: 'banana' }
        }
      }
    });
  });

  it('dispatch() wraps actions with case type to distinguish between destination types', () => {
    // Regression test: Verify that actions are wrapped with case type
    // This prevents actions from one destination type being handled by another
    const initialState: ParentState = {
      destination: {
        type: 'addItem',
        state: { item: 'apple', quantity: 5 }
      },
      items: []
    };

    const dispatched: ParentAction[] = [];

    const testReducer: Reducer<ParentState, ParentAction, null> = (state, action) => {
      dispatched.push(action);
      return parentReducer(state, action, null);
    };

    const store = createStore({
      initialState,
      reducer: testReducer,
      dependencies: null
    });

    // Create scoped stores for BOTH destination types
    const addItemStore = scopeToDestination<AddItemState, ChildAction>(
      store,
      ['destination'],
      'addItem',
      'destination'
    );

    const editItemStore = scopeToDestination<EditItemState, ChildAction>(
      store,
      ['destination'],
      'editItem',
      'destination'
    );

    // Dispatch from addItem store
    addItemStore.dispatch({ type: 'save' });

    // Verify action is wrapped with 'addItem' case type
    expect(dispatched[0]).toEqual({
      type: 'destination',
      action: {
        type: 'presented',
        action: {
          type: 'addItem',  // ← Critical: Case type prevents confusion
          action: { type: 'save' }
        }
      }
    });

    // Now switch destination to editItem
    store.dispatch({ type: 'showEditItem', id: '123' });

    // Re-create scoped stores
    const editItemStore2 = scopeToDestination<EditItemState, ChildAction>(
      store,
      ['destination'],
      'editItem',
      'destination'
    );

    // Dispatch from editItem store
    editItemStore2.dispatch({ type: 'save' });

    // Verify action is wrapped with 'editItem' case type (index 2: first action + showEditItem + second action)
    expect(dispatched[2]).toEqual({
      type: 'destination',
      action: {
        type: 'presented',
        action: {
          type: 'editItem',  // ← Different case type for different destination
          action: { type: 'save' }
        }
      }
    });
  });

  it('dispatch() wraps actions in correct parent field', () => {
    type CustomDestinationAction = { type: 'addItem'; action: ChildAction };

    type CustomParentAction =
      | { type: 'show' }
      | { type: 'modal'; action: PresentationAction<CustomDestinationAction> };

    const initialState: ParentState = {
      destination: {
        type: 'addItem',
        state: { item: 'apple', quantity: 5 }
      },
      items: []
    };

    const dispatched: CustomParentAction[] = [];

    const customReducer: Reducer<ParentState, CustomParentAction, null> = (
      state,
      action
    ) => {
      dispatched.push(action);
      return [state, Effect.none()];
    };

    const store = createStore({
      initialState,
      reducer: customReducer,
      dependencies: null
    });

    const scopedStore = scopeToDestination<
      AddItemState,
      ChildAction,
      ParentState,
      CustomParentAction
    >(
      store,
      ['destination'],
      'addItem',
      'modal' // Different field name
    );

    scopedStore.dispatch({ type: 'save' });

    expect(dispatched[0]).toEqual({
      type: 'modal',
      action: {
        type: 'presented',
        action: {
          type: 'addItem',  // Case type wrapper
          action: { type: 'save' }
        }
      }
    });
  });

  it('dismiss() dispatches PresentationAction.dismiss', () => {
    const initialState: ParentState = {
      destination: {
        type: 'addItem',
        state: { item: 'apple', quantity: 5 }
      },
      items: []
    };

    const dispatched: ParentAction[] = [];

    const testReducer: Reducer<ParentState, ParentAction, null> = (state, action) => {
      dispatched.push(action);
      return parentReducer(state, action, null);
    };

    const store = createStore({
      initialState,
      reducer: testReducer,
      dependencies: null
    });

    const scopedStore = scopeToDestination<AddItemState, ChildAction>(
      store,
      ['destination'],
      'addItem',
      'destination'
    );

    // Call dismiss
    scopedStore.dismiss();

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toEqual({
      type: 'destination',
      action: { type: 'dismiss' }
    });
  });

  it('works with nested destination paths', () => {
    interface NestedState {
      navigation: {
        destination: Destination | null;
      };
    }

    type NestedAction =
      | { type: 'show' }
      | { type: 'destination'; action: PresentationAction<ChildAction> };

    const nestedReducer: Reducer<NestedState, NestedAction, null> = (state) => {
      return [state, Effect.none()];
    };

    const initialState: NestedState = {
      navigation: {
        destination: {
          type: 'addItem',
          state: { item: 'apple', quantity: 5 }
        }
      }
    };

    const store = createStore({
      initialState,
      reducer: nestedReducer,
      dependencies: null
    });

    const scopedStore = scopeToDestination<
      AddItemState,
      ChildAction,
      NestedState,
      NestedAction
    >(
      store,
      ['navigation', 'destination'], // Nested path
      'addItem',
      'destination'
    );

    expect(scopedStore.state).not.toBeNull();
    expect(scopedStore.state).toEqual({ item: 'apple', quantity: 5 });
  });

  it('scoped store updates reactively when parent state changes', () => {
    const initialState: ParentState = {
      destination: null,
      items: []
    };

    const store = createStore({
      initialState,
      reducer: parentReducer,
      dependencies: null
    });

    // Initially null
    let scopedStore = scopeToDestination<AddItemState, ChildAction>(
      store,
      ['destination'],
      'addItem',
      'destination'
    );

    expect(scopedStore.state).toBeNull();

    // Show add item
    store.dispatch({ type: 'showAddItem' });

    // Re-create scoped store (in real Svelte, this would be $derived)
    scopedStore = scopeToDestination<AddItemState, ChildAction>(
      store,
      ['destination'],
      'addItem',
      'destination'
    );

    expect(scopedStore.state).not.toBeNull();
    expect(scopedStore.state?.item).toBe('');
    expect(scopedStore.state?.quantity).toBe(1);
  });
});

// ============================================================================
// scopeToOptional() Tests
// ============================================================================

describe('scopeToOptional()', () => {
  interface SimpleChildState {
    message: string;
  }

  type SimpleChildAction = { type: 'updateMessage'; value: string } | { type: 'close' };

  interface SimpleParentState {
    modal: SimpleChildState | null;
  }

  type SimpleParentAction =
    | { type: 'showModal' }
    | { type: 'modal'; action: PresentationAction<SimpleChildAction> };

  const simpleReducer: Reducer<SimpleParentState, SimpleParentAction, null> = (
    state,
    action
  ) => {
    switch (action.type) {
      case 'showModal':
        return [{ ...state, modal: { message: 'hello' } }, Effect.none()];
      case 'modal':
        if (action.action.type === 'dismiss') {
          return [{ ...state, modal: null }, Effect.none()];
        }
        return [state, Effect.none()];
      default:
        return [state, Effect.none()];
    }
  };

  it('returns null state when child is null', () => {
    const initialState: SimpleParentState = {
      modal: null
    };

    const store = createStore({
      initialState,
      reducer: simpleReducer,
      dependencies: null
    });

    const scopedStore = scopeToOptional<SimpleChildState, SimpleChildAction>(
      store,
      ['modal'],
      'modal'
    );

    expect(scopedStore.state).toBeNull();
  });

  it('returns scoped store when child is non-null', () => {
    const initialState: SimpleParentState = {
      modal: { message: 'hello' }
    };

    const store = createStore({
      initialState,
      reducer: simpleReducer,
      dependencies: null
    });

    const scopedStore = scopeToOptional<SimpleChildState, SimpleChildAction>(
      store,
      ['modal'],
      'modal'
    );

    expect(scopedStore.state).not.toBeNull();
    expect(scopedStore.state?.message).toBe('hello');
  });

  it('dispatch() wraps actions correctly', () => {
    const initialState: SimpleParentState = {
      modal: { message: 'hello' }
    };

    const dispatched: SimpleParentAction[] = [];

    const testReducer: Reducer<SimpleParentState, SimpleParentAction, null> = (
      state,
      action
    ) => {
      dispatched.push(action);
      return simpleReducer(state, action, null);
    };

    const store = createStore({
      initialState,
      reducer: testReducer,
      dependencies: null
    });

    const scopedStore = scopeToOptional<SimpleChildState, SimpleChildAction>(
      store,
      ['modal'],
      'modal'
    );

    scopedStore.dispatch({ type: 'updateMessage', value: 'goodbye' });

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toEqual({
      type: 'modal',
      action: {
        type: 'presented',
        action: { type: 'updateMessage', value: 'goodbye' }
      }
    });
  });

  it('dismiss() works correctly', () => {
    const initialState: SimpleParentState = {
      modal: { message: 'hello' }
    };

    const dispatched: SimpleParentAction[] = [];

    const testReducer: Reducer<SimpleParentState, SimpleParentAction, null> = (
      state,
      action
    ) => {
      dispatched.push(action);
      return simpleReducer(state, action, null);
    };

    const store = createStore({
      initialState,
      reducer: testReducer,
      dependencies: null
    });

    const scopedStore = scopeToOptional<SimpleChildState, SimpleChildAction>(
      store,
      ['modal'],
      'modal'
    );

    scopedStore.dismiss();

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toEqual({
      type: 'modal',
      action: { type: 'dismiss' }
    });
  });

  it('simpler API for non-enum cases', () => {
    // scopeToOptional is simpler because it doesn't require case type filtering
    const initialState: SimpleParentState = {
      modal: { message: 'hello' }
    };

    const store = createStore({
      initialState,
      reducer: simpleReducer,
      dependencies: null
    });

    // scopeToOptional: 3 parameters
    const scopedStore1 = scopeToOptional<SimpleChildState, SimpleChildAction>(
      store,
      ['modal'],
      'modal'
    );

    expect(scopedStore1.state).toEqual({ message: 'hello' });

    // For comparison: scopeToDestination would require 4 parameters
    // (but doesn't make sense for non-enum child state)
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Scoped Store Integration', () => {
  it('integrates with Svelte component pattern', () => {
    // Simulating Svelte 5 component usage
    const initialState: ParentState = {
      destination: null,
      items: []
    };

    const store = createStore({
      initialState,
      reducer: parentReducer,
      dependencies: null
    });

    // Component would use $derived to create scoped store
    const getScopedStore = () =>
      scopeToDestination<AddItemState, ChildAction>(
        store,
        ['destination'],
        'addItem',
        'destination'
      );

    // Initially no modal
    let scopedStore = getScopedStore();
    expect(scopedStore.state).toBeNull();

    // Show modal
    store.dispatch({ type: 'showAddItem' });

    // Re-derive (Svelte would do this automatically)
    scopedStore = getScopedStore();
    expect(scopedStore.state).not.toBeNull();

    // Component dispatches child actions
    scopedStore.dispatch({ type: 'updateItem', value: 'banana' });

    // Component dismisses
    scopedStore.dismiss();

    // Re-derive
    scopedStore = getScopedStore();
    expect(scopedStore.state).toBeNull();
  });

  it('supports multiple scoped stores for different destinations', () => {
    const initialState: ParentState = {
      destination: {
        type: 'addItem',
        state: { item: 'apple', quantity: 1 }
      },
      items: []
    };

    const store = createStore({
      initialState,
      reducer: parentReducer,
      dependencies: null
    });

    // Create scoped stores for both destination types
    const addItemStore = scopeToDestination<AddItemState, ChildAction>(
      store,
      ['destination'],
      'addItem',
      'destination'
    );

    const editItemStore = scopeToDestination<EditItemState, ChildAction>(
      store,
      ['destination'],
      'editItem',
      'destination'
    );

    // Only addItem should be non-null
    expect(addItemStore.state).not.toBeNull();
    expect(editItemStore.state).toBeNull();

    // Switch to editItem
    store.dispatch({ type: 'showEditItem', id: '123' });

    // Re-create scoped stores
    const addItemStore2 = scopeToDestination<AddItemState, ChildAction>(
      store,
      ['destination'],
      'addItem',
      'destination'
    );

    const editItemStore2 = scopeToDestination<EditItemState, ChildAction>(
      store,
      ['destination'],
      'editItem',
      'destination'
    );

    // Now only editItem should be non-null
    expect(addItemStore2.state).toBeNull();
    expect(editItemStore2.state).not.toBeNull();
    expect(editItemStore2.state?.id).toBe('123');
  });

  it('provides type-safe component integration', () => {
    // This test verifies type safety (compile-time check)
    const initialState: ParentState = {
      destination: {
        type: 'addItem',
        state: { item: 'apple', quantity: 5 }
      },
      items: []
    };

    const store = createStore({
      initialState,
      reducer: parentReducer,
      dependencies: null
    });

    const scopedStore = scopeToDestination<AddItemState, ChildAction>(
      store,
      ['destination'],
      'addItem',
      'destination'
    );

    // Type safety: scopedStore.state is AddItemState | null
    if (scopedStore.state) {
      // TypeScript knows state is AddItemState here
      const item: string = scopedStore.state.item;
      const quantity: number = scopedStore.state.quantity;

      expect(item).toBe('apple');
      expect(quantity).toBe(5);

      // This would be a compile error:
      // const id: string = scopedStore.state.id; // Property 'id' does not exist
    }

    // Type safety: dispatch accepts ChildAction
    scopedStore.dispatch({ type: 'updateItem', value: 'banana' });

    // This would be a compile error:
    // scopedStore.dispatch({ type: 'invalidAction' }); // Type error
  });
});
