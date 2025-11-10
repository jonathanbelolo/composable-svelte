import { describe, it, expect } from 'vitest';
import { createStore } from '../../src/lib/store';
import { serializeStore, serializeState } from '../../src/lib/ssr/serialize';
import { Effect } from '../../src/lib/effect';
import type { Reducer } from '../../src/lib/types';

interface TestState {
  count: number;
  items: string[];
  user: { id: number; name: string } | null;
  isLoading: boolean;
}

type TestAction =
  | { type: 'increment' }
  | { type: 'addItem'; item: string };

const initialState: TestState = {
  count: 0,
  items: [],
  user: null,
  isLoading: false
};

const reducer: Reducer<TestState, TestAction> = (state, action) => {
  switch (action.type) {
    case 'increment':
      return [{ ...state, count: state.count + 1 }, Effect.none()];
    case 'addItem':
      return [{ ...state, items: [...state.items, action.item] }, Effect.none()];
    default:
      return [state, Effect.none()];
  }
};

describe('serializeStore', () => {
  it('serializes empty initial state', () => {
    const store = createStore({ initialState, reducer });
    const json = serializeStore(store);

    expect(json).toBe(JSON.stringify(initialState));
    expect(JSON.parse(json)).toEqual(initialState);
  });

  it('serializes state after updates', () => {
    const store = createStore({ initialState, reducer });

    store.dispatch({ type: 'increment' });
    store.dispatch({ type: 'addItem', item: 'first' });

    const json = serializeStore(store);
    const parsed = JSON.parse(json);

    expect(parsed.count).toBe(1);
    expect(parsed.items).toEqual(['first']);
  });

  it('serializes complex nested state', () => {
    const complexState: TestState = {
      count: 42,
      items: ['a', 'b', 'c'],
      user: { id: 1, name: 'Alice' },
      isLoading: true
    };

    const store = createStore({
      initialState: complexState,
      reducer
    });

    const json = serializeStore(store);
    const parsed = JSON.parse(json);

    expect(parsed).toEqual(complexState);
    expect(parsed.user).toEqual({ id: 1, name: 'Alice' });
  });

  it('serializes arrays correctly', () => {
    const state: TestState = {
      ...initialState,
      items: ['one', 'two', 'three']
    };

    const store = createStore({
      initialState: state,
      reducer
    });

    const json = serializeStore(store);
    const parsed = JSON.parse(json);

    expect(Array.isArray(parsed.items)).toBe(true);
    expect(parsed.items).toHaveLength(3);
    expect(parsed.items).toEqual(['one', 'two', 'three']);
  });

  it('serializes null values correctly', () => {
    const state: TestState = {
      ...initialState,
      user: null
    };

    const store = createStore({
      initialState: state,
      reducer
    });

    const json = serializeStore(store);
    const parsed = JSON.parse(json);

    expect(parsed.user).toBeNull();
  });

  it('serializes boolean values correctly', () => {
    const state: TestState = {
      ...initialState,
      isLoading: true
    };

    const store = createStore({
      initialState: state,
      reducer
    });

    const json = serializeStore(store);
    const parsed = JSON.parse(json);

    expect(parsed.isLoading).toBe(true);
  });

  it('throws TypeError if store is null', () => {
    expect(() => {
      serializeStore(null as any);
    }).toThrow(TypeError);

    expect(() => {
      serializeStore(null as any);
    }).toThrow('serializeStore: store is required');
  });

  it('throws TypeError if store is undefined', () => {
    expect(() => {
      serializeStore(undefined as any);
    }).toThrow(TypeError);
  });

  it('produces valid JSON', () => {
    const store = createStore({ initialState, reducer });
    const json = serializeStore(store);

    // Should not throw
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('roundtrip maintains data integrity', () => {
    const complexState: TestState = {
      count: 123,
      items: ['a', 'b', 'c', 'd'],
      user: { id: 99, name: 'Bob' },
      isLoading: false
    };

    const store = createStore({
      initialState: complexState,
      reducer
    });

    const json = serializeStore(store);
    const parsed = JSON.parse(json);

    expect(parsed).toEqual(complexState);
  });
});

describe('serializeState', () => {
  it('serializes plain state object', () => {
    const state: TestState = {
      count: 42,
      items: ['x', 'y'],
      user: { id: 1, name: 'Test' },
      isLoading: false
    };

    const json = serializeState(state);
    const parsed = JSON.parse(json);

    expect(parsed).toEqual(state);
  });

  it('serializes empty object', () => {
    const json = serializeState({});
    expect(json).toBe('{}');
    expect(JSON.parse(json)).toEqual({});
  });

  it('serializes primitives', () => {
    expect(serializeState(42)).toBe('42');
    expect(serializeState('hello')).toBe('"hello"');
    expect(serializeState(true)).toBe('true');
    expect(serializeState(null)).toBe('null');
  });

  it('serializes arrays', () => {
    const arr = [1, 2, 3];
    const json = serializeState(arr);
    expect(JSON.parse(json)).toEqual(arr);
  });

  it('throws TypeError if state is undefined', () => {
    expect(() => {
      serializeState(undefined as any);
    }).toThrow(TypeError);

    expect(() => {
      serializeState(undefined as any);
    }).toThrow('serializeState: state is required');
  });

  it('produces valid JSON', () => {
    const state = { a: 1, b: 'test', c: [1, 2, 3] };
    const json = serializeState(state);

    expect(() => JSON.parse(json)).not.toThrow();
  });
});
