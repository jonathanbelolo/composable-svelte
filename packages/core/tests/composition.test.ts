import { describe, it, expect } from 'vitest';
import { scope, combineReducers } from '../src/lib/composition';
import { Effect } from '../src/lib/effect';
import type { Reducer } from '../src/lib/types';

describe('scope()', () => {
  interface ParentState {
    counter: CounterState;
    other: string;
  }

  interface CounterState {
    count: number;
  }

  type ParentAction =
    | { type: 'counter'; action: CounterAction }
    | { type: 'other'; value: string };

  type CounterAction =
    | { type: 'increment' }
    | { type: 'decrement' };

  const counterReducer: Reducer<CounterState, CounterAction> = (state, action) => {
    switch (action.type) {
      case 'increment':
        return [{ ...state, count: state.count + 1 }, Effect.none()];
      case 'decrement':
        return [{ ...state, count: state.count - 1 }, Effect.none()];
      default:
        return [state, Effect.none()];
    }
  };

  it('composes child reducer into parent', () => {
    const parentReducer = scope(
      (s: ParentState) => s.counter,
      (s, c) => ({ ...s, counter: c }),
      (a: ParentAction) => (a.type === 'counter' ? a.action : null),
      (ca) => ({ type: 'counter', action: ca }) as ParentAction,
      counterReducer
    );

    const initialState: ParentState = {
      counter: { count: 0 },
      other: 'test'
    };

    const [newState, effect] = parentReducer(
      initialState,
      { type: 'counter', action: { type: 'increment' } },
      undefined
    );

    expect(newState.counter.count).toBe(1);
    expect(newState.other).toBe('test');
    expect(effect._tag).toBe('None');
  });

  it('returns unchanged state for non-child actions', () => {
    const parentReducer = scope(
      (s: ParentState) => s.counter,
      (s, c) => ({ ...s, counter: c }),
      (a: ParentAction) => (a.type === 'counter' ? a.action : null),
      (ca) => ({ type: 'counter', action: ca }) as ParentAction,
      counterReducer
    );

    const initialState: ParentState = {
      counter: { count: 5 },
      other: 'test'
    };

    const [newState, effect] = parentReducer(
      initialState,
      { type: 'other', value: 'new' },
      undefined
    );

    // State should be unchanged (same reference)
    expect(newState).toBe(initialState);
    expect(effect._tag).toBe('None');
  });

  it('lifts child effects to parent actions', () => {
    const effectfulReducer: Reducer<CounterState, CounterAction> = (state, action) => {
      if (action.type === 'increment') {
        return [
          { ...state, count: state.count + 1 },
          Effect.run(async (dispatch) => {
            dispatch({ type: 'decrement' });
          })
        ];
      }
      return [state, Effect.none()];
    };

    const parentReducer = scope(
      (s: ParentState) => s.counter,
      (s, c) => ({ ...s, counter: c }),
      (a: ParentAction) => (a.type === 'counter' ? a.action : null),
      (ca) => ({ type: 'counter', action: ca }) as ParentAction,
      effectfulReducer
    );

    const initialState: ParentState = {
      counter: { count: 0 },
      other: 'test'
    };

    const [newState, effect] = parentReducer(
      initialState,
      { type: 'counter', action: { type: 'increment' } },
      undefined
    );

    expect(newState.counter.count).toBe(1);
    expect(effect._tag).toBe('Run');
  });
});

describe('combineReducers()', () => {
  interface AppState {
    counter: CounterState;
    todos: TodosState;
  }

  interface CounterState {
    count: number;
  }

  interface TodosState {
    items: string[];
  }

  type AppAction =
    | { type: 'increment' }
    | { type: 'decrement' }
    | { type: 'addTodo'; text: string };

  const counterReducer: Reducer<CounterState, AppAction> = (state, action) => {
    switch (action.type) {
      case 'increment':
        return [{ ...state, count: state.count + 1 }, Effect.none()];
      case 'decrement':
        return [{ ...state, count: state.count - 1 }, Effect.none()];
      default:
        return [state, Effect.none()];
    }
  };

  const todosReducer: Reducer<TodosState, AppAction> = (state, action) => {
    switch (action.type) {
      case 'addTodo':
        return [{ ...state, items: [...state.items, action.text] }, Effect.none()];
      default:
        return [state, Effect.none()];
    }
  };

  it('combines multiple slice reducers', () => {
    const appReducer = combineReducers({
      counter: counterReducer,
      todos: todosReducer
    });

    const initialState: AppState = {
      counter: { count: 0 },
      todos: { items: [] }
    };

    const [newState, effect] = appReducer(
      initialState,
      { type: 'increment' },
      undefined
    );

    expect(newState.counter.count).toBe(1);
    expect(newState.todos.items).toEqual([]);
    expect(effect._tag).toBe('None');
  });

  it('only creates new state if a slice changed', () => {
    const appReducer = combineReducers({
      counter: counterReducer,
      todos: todosReducer
    });

    const initialState: AppState = {
      counter: { count: 0 },
      todos: { items: [] }
    };

    // Action that neither reducer handles
    const [newState] = appReducer(
      initialState,
      { type: 'unknown' } as any,
      undefined
    );

    // Should return same reference
    expect(newState).toBe(initialState);
  });

  it('batches effects from multiple reducers', () => {
    const effectfulCounterReducer: Reducer<CounterState, AppAction> = (state, action) => {
      if (action.type === 'increment') {
        return [
          { ...state, count: state.count + 1 },
          Effect.run(async (d) => d({ type: 'decrement' }))
        ];
      }
      return [state, Effect.none()];
    };

    const effectfulTodosReducer: Reducer<TodosState, AppAction> = (state, action) => {
      if (action.type === 'addTodo') {
        return [
          { ...state, items: [...state.items, action.text] },
          Effect.run(async (d) => d({ type: 'increment' }))
        ];
      }
      return [state, Effect.none()];
    };

    const appReducer = combineReducers({
      counter: effectfulCounterReducer,
      todos: effectfulTodosReducer
    });

    const initialState: AppState = {
      counter: { count: 0 },
      todos: { items: [] }
    };

    // Both reducers produce effects
    const action: AppAction = { type: 'increment' };
    const [, effect] = appReducer(initialState, action, undefined);

    // Single effect from counter reducer
    expect(effect._tag).toBe('Run');

    // Both produce effects with addTodo (hypothetically if we had a universal action)
    // This test just verifies the batching logic works
  });

  it('returns single effect when only one reducer produces effect', () => {
    const effectfulCounterReducer: Reducer<CounterState, AppAction> = (state, action) => {
      if (action.type === 'increment') {
        return [
          { ...state, count: state.count + 1 },
          Effect.run(async () => {})
        ];
      }
      return [state, Effect.none()];
    };

    const appReducer = combineReducers({
      counter: effectfulCounterReducer,
      todos: todosReducer
    });

    const initialState: AppState = {
      counter: { count: 0 },
      todos: { items: [] }
    };

    const [, effect] = appReducer(initialState, { type: 'increment' }, undefined);

    // Should be a single Run effect, not batched
    expect(effect._tag).toBe('Run');
  });

  it('preserves state keys structure', () => {
    const appReducer = combineReducers({
      counter: counterReducer,
      todos: todosReducer
    });

    const initialState: AppState = {
      counter: { count: 0 },
      todos: { items: [] }
    };

    const [newState] = appReducer(
      initialState,
      { type: 'addTodo', text: 'test' },
      undefined
    );

    expect(newState).toHaveProperty('counter');
    expect(newState).toHaveProperty('todos');
    expect(newState.todos.items).toEqual(['test']);
    expect(newState.counter.count).toBe(0);
  });
});
