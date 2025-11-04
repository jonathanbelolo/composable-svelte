import { describe, it, expect, vi } from 'vitest';
import {
  forEach,
  forEachElement,
  elementAction,
  type IdentifiedItem
} from '../../src/lib/composition/for-each.js';
import { scopeToElement } from '../../src/lib/navigation/scope-to-element.js';
import { createStore } from '../../src/lib/store.js';
import { Effect } from '../../src/lib/effect.js';
import type { Reducer } from '../../src/lib/types.js';

// =======================================================================
// Test Fixtures
// =======================================================================

interface CounterState {
  count: number;
}

type CounterAction =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'set'; value: number };

interface ParentState {
  items: Array<IdentifiedItem<string, CounterState>>;
}

type ParentAction =
  | { type: 'addItem' }
  | { type: 'removeItem'; id: string }
  | { type: 'counter'; id: string; action: CounterAction };

// Counter reducer for testing
const counterReducer: Reducer<CounterState, CounterAction, any> = (state, action) => {
  switch (action.type) {
    case 'increment':
      return [{ count: state.count + 1 }, Effect.none()];
    case 'decrement':
      return [{ count: state.count - 1 }, Effect.none()];
    case 'set':
      return [{ count: action.value }, Effect.none()];
    default:
      return [state, Effect.none()];
  }
};

// =======================================================================
// forEach Tests
// =======================================================================

describe('forEach', () => {
  it('routes actions to child reducer by ID', () => {
    const reducer = forEach<ParentState, ParentAction, CounterState, CounterAction, string, any>({
      getArray: (s) => s.items,
      setArray: (s, items) => ({ ...s, items }),
      extractChild: (a) => (a.type === 'counter' ? { id: a.id, action: a.action } : null),
      wrapChild: (id, action) => ({ type: 'counter', id, action }),
      childReducer: counterReducer
    });

    const initialState: ParentState = {
      items: [
        { id: 'a', state: { count: 0 } },
        { id: 'b', state: { count: 10 } }
      ]
    };

    const [newState] = reducer(initialState, { type: 'counter', id: 'a', action: { type: 'increment' } }, {});

    expect(newState.items[0].state.count).toBe(1);
    expect(newState.items[1].state.count).toBe(10); // Unchanged
  });

  it('returns unchanged state when action does not match', () => {
    const reducer = forEach<ParentState, ParentAction, CounterState, CounterAction, string, any>({
      getArray: (s) => s.items,
      setArray: (s, items) => ({ ...s, items }),
      extractChild: (a) => (a.type === 'counter' ? { id: a.id, action: a.action } : null),
      wrapChild: (id, action) => ({ type: 'counter', id, action }),
      childReducer: counterReducer
    });

    const initialState: ParentState = {
      items: [{ id: 'a', state: { count: 0 } }]
    };

    const [newState] = reducer(initialState, { type: 'addItem' }, {});

    expect(newState).toBe(initialState); // Same reference - no change
  });

  it('returns unchanged state when ID not found', () => {
    const reducer = forEach<ParentState, ParentAction, CounterState, CounterAction, string, any>({
      getArray: (s) => s.items,
      setArray: (s, items) => ({ ...s, items }),
      extractChild: (a) => (a.type === 'counter' ? { id: a.id, action: a.action } : null),
      wrapChild: (id, action) => ({ type: 'counter', id, action }),
      childReducer: counterReducer
    });

    const initialState: ParentState = {
      items: [{ id: 'a', state: { count: 0 } }]
    };

    const [newState] = reducer(initialState, { type: 'counter', id: 'nonexistent', action: { type: 'increment' } }, {});

    expect(newState).toBe(initialState); // ID not found - no change
  });

  it('maps child effects to parent actions', async () => {
    const childReducer: Reducer<CounterState, CounterAction, any> = (state, action) => {
      if (action.type === 'increment') {
        return [
          { count: state.count + 1 },
          Effect.run(async (dispatch) => {
            dispatch({ type: 'increment' });
          })
        ];
      }
      return [state, Effect.none()];
    };

    const reducer = forEach<ParentState, ParentAction, CounterState, CounterAction, string, any>({
      getArray: (s) => s.items,
      setArray: (s, items) => ({ ...s, items }),
      extractChild: (a) => (a.type === 'counter' ? { id: a.id, action: a.action } : null),
      wrapChild: (id, action) => ({ type: 'counter', id, action }),
      childReducer
    });

    const initialState: ParentState = {
      items: [{ id: 'a', state: { count: 0 } }]
    };

    const [, effect] = reducer(initialState, { type: 'counter', id: 'a', action: { type: 'increment' } }, {});

    // Effect should be mapped to parent action format
    expect(effect._tag).toBe('Run');

    // Verify the effect dispatches wrapped action
    const actions: ParentAction[] = [];
    await (effect as any).execute((action: ParentAction) => {
      actions.push(action);
    });

    expect(actions).toEqual([{ type: 'counter', id: 'a', action: { type: 'increment' } }]);
  });

  it('handles empty arrays', () => {
    const reducer = forEach<ParentState, ParentAction, CounterState, CounterAction, string, any>({
      getArray: (s) => s.items,
      setArray: (s, items) => ({ ...s, items }),
      extractChild: (a) => (a.type === 'counter' ? { id: a.id, action: a.action } : null),
      wrapChild: (id, action) => ({ type: 'counter', id, action }),
      childReducer: counterReducer
    });

    const initialState: ParentState = {
      items: []
    };

    const [newState] = reducer(initialState, { type: 'counter', id: 'a', action: { type: 'increment' } }, {});

    expect(newState).toBe(initialState);
    expect(newState.items).toEqual([]);
  });

  it('updates arrays immutably', () => {
    const reducer = forEach<ParentState, ParentAction, CounterState, CounterAction, string, any>({
      getArray: (s) => s.items,
      setArray: (s, items) => ({ ...s, items }),
      extractChild: (a) => (a.type === 'counter' ? { id: a.id, action: a.action } : null),
      wrapChild: (id, action) => ({ type: 'counter', id, action }),
      childReducer: counterReducer
    });

    const initialState: ParentState = {
      items: [{ id: 'a', state: { count: 0 } }]
    };

    const [newState] = reducer(initialState, { type: 'counter', id: 'a', action: { type: 'increment' } }, {});

    // New state object
    expect(newState).not.toBe(initialState);
    // New array
    expect(newState.items).not.toBe(initialState.items);
    // New item object
    expect(newState.items[0]).not.toBe(initialState.items[0]);
    // Same ID
    expect(newState.items[0].id).toBe('a');
  });

  it('supports numeric IDs', () => {
    interface NumericState {
      items: Array<IdentifiedItem<number, CounterState>>;
    }

    type NumericAction = { type: 'counter'; id: number; action: CounterAction };

    const reducer = forEach<NumericState, NumericAction, CounterState, CounterAction, number, any>({
      getArray: (s) => s.items,
      setArray: (s, items) => ({ ...s, items }),
      extractChild: (a) => (a.type === 'counter' ? { id: a.id, action: a.action } : null),
      wrapChild: (id, action) => ({ type: 'counter', id, action }),
      childReducer: counterReducer
    });

    const initialState: NumericState = {
      items: [
        { id: 1, state: { count: 0 } },
        { id: 2, state: { count: 5 } }
      ]
    };

    const [newState] = reducer(initialState, { type: 'counter', id: 2, action: { type: 'increment' } }, {});

    expect(newState.items[0].state.count).toBe(0); // Unchanged
    expect(newState.items[1].state.count).toBe(6); // Incremented
  });
});

// =======================================================================
// forEachElement Tests
// =======================================================================

describe('forEachElement', () => {
  it('simplifies standard pattern with action type', () => {
    const reducer = forEachElement<ParentState, ParentAction, CounterState, CounterAction, string, any>(
      'counter',
      (s) => s.items,
      (s, items) => ({ ...s, items }),
      counterReducer
    );

    const initialState: ParentState = {
      items: [{ id: 'a', state: { count: 0 } }]
    };

    const [newState] = reducer(initialState, { type: 'counter', id: 'a', action: { type: 'increment' } }, {});

    expect(newState.items[0].state.count).toBe(1);
  });

  it('ignores actions with different type', () => {
    const reducer = forEachElement<ParentState, ParentAction, CounterState, CounterAction, string, any>(
      'counter',
      (s) => s.items,
      (s, items) => ({ ...s, items }),
      counterReducer
    );

    const initialState: ParentState = {
      items: [{ id: 'a', state: { count: 0 } }]
    };

    const [newState] = reducer(initialState, { type: 'addItem' }, {});

    expect(newState).toBe(initialState);
  });

  it('works with multiple items', () => {
    const reducer = forEachElement<ParentState, ParentAction, CounterState, CounterAction, string, any>(
      'counter',
      (s) => s.items,
      (s, items) => ({ ...s, items }),
      counterReducer
    );

    const initialState: ParentState = {
      items: [
        { id: 'a', state: { count: 0 } },
        { id: 'b', state: { count: 1 } },
        { id: 'c', state: { count: 2 } }
      ]
    };

    let state = initialState;

    // Increment item 'b'
    [state] = reducer(state, { type: 'counter', id: 'b', action: { type: 'increment' } }, {});
    expect(state.items[0].state.count).toBe(0);
    expect(state.items[1].state.count).toBe(2);
    expect(state.items[2].state.count).toBe(2);

    // Decrement item 'a'
    [state] = reducer(state, { type: 'counter', id: 'a', action: { type: 'decrement' } }, {});
    expect(state.items[0].state.count).toBe(-1);
    expect(state.items[1].state.count).toBe(2);
    expect(state.items[2].state.count).toBe(2);
  });
});

// =======================================================================
// elementAction Helper Tests
// =======================================================================

describe('elementAction', () => {
  it('creates properly typed element actions', () => {
    const action = elementAction('counter', 'item-1', { type: 'increment' as const });

    expect(action).toEqual({
      type: 'counter',
      id: 'item-1',
      action: { type: 'increment' }
    });
  });

  it('works with numeric IDs', () => {
    const action = elementAction('counter', 42, { type: 'increment' as const });

    expect(action).toEqual({
      type: 'counter',
      id: 42,
      action: { type: 'increment' }
    });
  });

  it('preserves action data', () => {
    const action = elementAction('counter', 'id', { type: 'set' as const, value: 100 });

    expect(action).toEqual({
      type: 'counter',
      id: 'id',
      action: { type: 'set', value: 100 }
    });
  });
});

// =======================================================================
// Integration Tests
// =======================================================================

describe('forEach integration', () => {
  it('works alongside parent reducer logic', () => {
    // Create a parent reducer that handles add/remove
    const parentReducer: Reducer<ParentState, ParentAction, any> = (state, action) => {
      switch (action.type) {
        case 'addItem':
          return [
            {
              ...state,
              items: [...state.items, { id: `item-${state.items.length}`, state: { count: 0 } }]
            },
            Effect.none()
          ];
        case 'removeItem':
          return [{ ...state, items: state.items.filter((i) => i.id !== action.id) }, Effect.none()];
        default:
          return [state, Effect.none()];
      }
    };

    // Compose with forEach
    const composedReducer: Reducer<ParentState, ParentAction, any> = (state, action, deps) => {
      // Run parent first
      const [stateAfterParent, parentEffect] = parentReducer(state, action, deps);

      // Then forEach
      const forEachReducer = forEachElement<ParentState, ParentAction, CounterState, CounterAction, string, any>(
        'counter',
        (s) => s.items,
        (s, items) => ({ ...s, items }),
        counterReducer
      );

      const [finalState, childEffect] = forEachReducer(stateAfterParent, action, deps);

      return [finalState, Effect.batch(parentEffect, childEffect)];
    };

    let state: ParentState = { items: [] };

    // Add item
    [state] = composedReducer(state, { type: 'addItem' }, {});
    expect(state.items).toHaveLength(1);
    expect(state.items[0].id).toBe('item-0');

    // Add another
    [state] = composedReducer(state, { type: 'addItem' }, {});
    expect(state.items).toHaveLength(2);

    // Increment first item
    [state] = composedReducer(state, { type: 'counter', id: 'item-0', action: { type: 'increment' } }, {});
    expect(state.items[0].state.count).toBe(1);
    expect(state.items[1].state.count).toBe(0);

    // Remove first item
    [state] = composedReducer(state, { type: 'removeItem', id: 'item-0' }, {});
    expect(state.items).toHaveLength(1);
    expect(state.items[0].id).toBe('item-1');

    // Increment remaining item
    [state] = composedReducer(state, { type: 'counter', id: 'item-1', action: { type: 'increment' } }, {});
    expect(state.items[0].state.count).toBe(1);
  });

  it('passes dependencies to child reducer', () => {
    interface Deps {
      multiplier: number;
    }

    const childReducer: Reducer<CounterState, CounterAction, Deps> = (state, action, deps) => {
      if (action.type === 'increment') {
        return [{ count: state.count + deps.multiplier }, Effect.none()];
      }
      return [state, Effect.none()];
    };

    const reducer = forEachElement<ParentState, ParentAction, CounterState, CounterAction, string, Deps>(
      'counter',
      (s) => s.items,
      (s, items) => ({ ...s, items }),
      childReducer
    );

    const initialState: ParentState = {
      items: [{ id: 'a', state: { count: 10 } }]
    };

    const [newState] = reducer(initialState, { type: 'counter', id: 'a', action: { type: 'increment' } }, { multiplier: 5 });

    expect(newState.items[0].state.count).toBe(15); // 10 + 5
  });
});

// =======================================================================
// scopeToElement Tests
// =======================================================================

describe('scopeToElement', () => {
  it('should create scoped store with simplified type signature', () => {
    // Setup: Create parent store with items
    const parentReducer = forEachElement(
      'counter',
      (s: ParentState) => s.items,
      (s: ParentState, items) => ({ ...s, items }),
      counterReducer
    );

    const parentStore = createStore({
      initialState: {
        items: [
          { id: 'a', state: { count: 10 } },
          { id: 'b', state: { count: 20 } }
        ]
      } as ParentState,
      reducer: parentReducer,
      dependencies: {}
    });

    // Test: Use simplified API with just one type parameter
    const scopedStore = scopeToElement<CounterAction>(
      parentStore,
      'counter',
      (s) => s.items,
      'a'
    );

    expect(scopedStore).not.toBeNull();
    expect(scopedStore!.state.count).toBe(10);
  });

  it('should dispatch actions with correct typing', () => {
    const parentReducer = forEachElement(
      'counter',
      (s: ParentState) => s.items,
      (s: ParentState, items) => ({ ...s, items }),
      counterReducer
    );

    const parentStore = createStore({
      initialState: {
        items: [{ id: 'a', state: { count: 10 } }]
      } as ParentState,
      reducer: parentReducer,
      dependencies: {}
    });

    const scopedStore = scopeToElement<CounterAction>(
      parentStore,
      'counter',
      (s) => s.items,
      'a'
    );

    // Dispatch should accept CounterAction
    scopedStore!.dispatch({ type: 'increment' });

    // Verify state updated
    expect(scopedStore!.state.count).toBe(11);
  });

  it('should return null for non-existent item', () => {
    const parentReducer = forEachElement(
      'counter',
      (s: ParentState) => s.items,
      (s: ParentState, items) => ({ ...s, items }),
      counterReducer
    );

    const parentStore = createStore({
      initialState: {
        items: [{ id: 'a', state: { count: 10 } }]
      } as ParentState,
      reducer: parentReducer,
      dependencies: {}
    });

    const scopedStore = scopeToElement<CounterAction>(
      parentStore,
      'counter',
      (s) => s.items,
      'nonexistent'
    );

    expect(scopedStore).toBeNull();
  });
});
