import { describe, it, expect } from 'vitest';
import { hydrateStore, parseState } from '../../src/lib/ssr/hydrate';
import { serializeStore } from '../../src/lib/ssr/serialize';
import { createStore } from '../../src/lib/store';
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

describe('hydrateStore', () => {
  it('hydrates store from serialized JSON', () => {
    const serverState: TestState = {
      count: 42,
      items: ['a', 'b'],
      user: { id: 1, name: 'Alice' },
      isLoading: false
    };

    const json = JSON.stringify(serverState);

    const store = hydrateStore<TestState, TestAction>(json, {
      reducer
    });

    expect(store.state).toEqual(serverState);
  });

  it('hydrated store is functional', () => {
    const serverState: TestState = {
      count: 5,
      items: ['x'],
      user: null,
      isLoading: false
    };

    const json = JSON.stringify(serverState);

    const store = hydrateStore<TestState, TestAction>(json, {
      reducer
    });

    // State should match
    expect(store.state.count).toBe(5);

    // Should be able to dispatch actions
    store.dispatch({ type: 'increment' });
    expect(store.state.count).toBe(6);

    store.dispatch({ type: 'addItem', item: 'new' });
    expect(store.state.items).toEqual(['x', 'new']);
  });

  it('preserves complex nested data', () => {
    const complexState: TestState = {
      count: 999,
      items: ['one', 'two', 'three', 'four'],
      user: { id: 123, name: 'Complex User' },
      isLoading: true
    };

    const json = JSON.stringify(complexState);

    const store = hydrateStore<TestState, TestAction>(json, {
      reducer
    });

    expect(store.state).toEqual(complexState);
    expect(store.state.user?.name).toBe('Complex User');
    expect(store.state.items).toHaveLength(4);
  });

  it('roundtrip with serializeStore', () => {
    // Create initial server store
    const serverStore = createStore({
      initialState: {
        count: 10,
        items: ['a', 'b', 'c'],
        user: { id: 1, name: 'Test' },
        isLoading: false
      },
      reducer
    });

    // Serialize
    const json = serializeStore(serverStore);

    // Hydrate on client
    const clientStore = hydrateStore<TestState, TestAction>(json, {
      reducer
    });

    // State should match exactly
    expect(clientStore.state).toEqual(serverStore.state);
  });

  it('works with dependencies', () => {
    interface Deps {
      apiKey: string;
    }

    const json = JSON.stringify({ count: 5, items: [], user: null, isLoading: false });

    const store = hydrateStore<TestState, TestAction, Deps>(json, {
      reducer,
      dependencies: { apiKey: 'test-key' }
    });

    expect(store.state.count).toBe(5);
  });

  it('forces deferEffects to false for client hydration', async () => {
    // This test verifies the behavior implicitly
    // If deferEffects were true, effects would not run
    let effectRan = false;

    const reducerWithEffect: Reducer<TestState, TestAction> = (state, action) => {
      if (action.type === 'increment') {
        return [
          { ...state, count: state.count + 1 },
          Effect.run((dispatch) => {
            effectRan = true;
            dispatch({ type: 'addItem', item: 'from-effect' });
          })
        ];
      }
      if (action.type === 'addItem') {
        return [{ ...state, items: [...state.items, action.item] }, Effect.none()];
      }
      return [state, Effect.none()];
    };

    const json = JSON.stringify(initialState);

    const store = hydrateStore<TestState, TestAction>(json, {
      reducer: reducerWithEffect
    });

    store.dispatch({ type: 'increment' });

    // Wait for effect to execute
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(effectRan).toBe(true);
    expect(store.state.items).toContain('from-effect');
  });

  it('throws TypeError if data is empty string', () => {
    expect(() => {
      hydrateStore('', { reducer });
    }).toThrow(TypeError);

    expect(() => {
      hydrateStore('', { reducer });
    }).toThrow('hydrateStore: data is required');
  });

  it('throws TypeError if data is null', () => {
    expect(() => {
      hydrateStore(null as any, { reducer });
    }).toThrow(TypeError);
  });

  it('throws TypeError if config is missing', () => {
    const json = JSON.stringify(initialState);

    expect(() => {
      hydrateStore(json, null as any);
    }).toThrow(TypeError);

    expect(() => {
      hydrateStore(json, null as any);
    }).toThrow('hydrateStore: config is required');
  });

  it('throws TypeError if reducer is missing', () => {
    const json = JSON.stringify(initialState);

    expect(() => {
      hydrateStore(json, {} as any);
    }).toThrow(TypeError);

    expect(() => {
      hydrateStore(json, {} as any);
    }).toThrow('hydrateStore: config.reducer is required');
  });

  it('throws TypeError if JSON is invalid', () => {
    expect(() => {
      hydrateStore('{ invalid json }', { reducer });
    }).toThrow(TypeError);

    expect(() => {
      hydrateStore('{ invalid json }', { reducer });
    }).toThrow('Failed to parse state JSON');
  });

  it('handles empty object state', () => {
    const json = '{}';

    // Need a reducer that works with empty state
    const emptyReducer: Reducer<any, TestAction> = (state) => [state, Effect.none()];

    const store = hydrateStore(json, { reducer: emptyReducer });

    expect(store.state).toEqual({});
  });

  it('handles array state', () => {
    const json = '[1, 2, 3]';

    const arrayReducer: Reducer<number[], { type: 'add'; value: number }> = (state, action) => {
      if (action.type === 'add') {
        return [[...state, action.value], Effect.none()];
      }
      return [state, Effect.none()];
    };

    const store = hydrateStore(json, { reducer: arrayReducer });

    expect(store.state).toEqual([1, 2, 3]);
  });
});

describe('parseState', () => {
  it('parses valid JSON', () => {
    const state: TestState = {
      count: 42,
      items: ['a'],
      user: { id: 1, name: 'Test' },
      isLoading: false
    };

    const json = JSON.stringify(state);
    const parsed = parseState<TestState>(json);

    expect(parsed).toEqual(state);
  });

  it('parses primitives', () => {
    expect(parseState('42')).toBe(42);
    expect(parseState('"hello"')).toBe('hello');
    expect(parseState('true')).toBe(true);
    expect(parseState('null')).toBeNull();
  });

  it('parses arrays', () => {
    const json = '[1, 2, 3, 4]';
    const parsed = parseState<number[]>(json);

    expect(parsed).toEqual([1, 2, 3, 4]);
  });

  it('parses nested objects', () => {
    const json = '{"a": {"b": {"c": 123}}}';
    const parsed = parseState(json);

    expect(parsed).toEqual({ a: { b: { c: 123 } } });
  });

  it('throws TypeError if data is empty', () => {
    expect(() => {
      parseState('');
    }).toThrow(TypeError);

    expect(() => {
      parseState('');
    }).toThrow('parseState: data is required');
  });

  it('throws TypeError if data is null', () => {
    expect(() => {
      parseState(null as any);
    }).toThrow(TypeError);
  });

  it('throws TypeError if JSON is invalid', () => {
    expect(() => {
      parseState('{ bad json }');
    }).toThrow(TypeError);

    expect(() => {
      parseState('{ bad json }');
    }).toThrow('Failed to parse state JSON');
  });

  it('handles empty object', () => {
    const parsed = parseState('{}');
    expect(parsed).toEqual({});
  });

  it('handles empty array', () => {
    const parsed = parseState('[]');
    expect(parsed).toEqual([]);
  });
});
