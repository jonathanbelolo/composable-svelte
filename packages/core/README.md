# @composable-svelte/core

A Composable Architecture for Svelte 5.

## Features (Phase 1)

- ✅ **Predictable State Management** - Pure reducers transform state based on actions
- ✅ **Type-Safe** - Full TypeScript support with discriminated unions
- ✅ **Effect System** - Declarative side effects (run, batch, cancellable, debounced, throttled, afterDelay, fireAndForget)
- ✅ **Reducer Composition** - Compose features with `scope()` and `combineReducers()`
- ✅ **TestStore** - Comprehensive testing support with send/receive pattern
- ✅ **Svelte 5 Integration** - Built on Svelte 5's $state runes for reactivity

## Installation

```bash
pnpm add @composable-svelte/core svelte
```

**Requirements:**
- Svelte 5+
- TypeScript 5.5+

## Quick Start

```typescript
import { createStore, Effect, type Reducer } from '@composable-svelte/core';

// 1. Define your state
interface CounterState {
  count: number;
  isLoading: boolean;
}

// 2. Define your actions
type CounterAction =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'loadAsync' }
  | { type: 'loadComplete'; value: number };

// 3. Create a reducer
const counterReducer: Reducer<CounterState, CounterAction> = (state, action) => {
  switch (action.type) {
    case 'increment':
      return [{ ...state, count: state.count + 1 }, Effect.none()];

    case 'decrement':
      return [{ ...state, count: state.count - 1 }, Effect.none()];

    case 'loadAsync':
      return [
        { ...state, isLoading: true },
        Effect.run(async (dispatch) => {
          const value = await fetchData();
          dispatch({ type: 'loadComplete', value });
        })
      ];

    case 'loadComplete':
      return [
        { ...state, count: action.value, isLoading: false },
        Effect.none()
      ];

    default:
      return [state, Effect.none()];
  }
};

// 4. Create the store
const store = createStore({
  initialState: { count: 0, isLoading: false },
  reducer: counterReducer
});

// 5. Use in Svelte components
store.dispatch({ type: 'increment' });
console.log(store.state.count); // 1
```

## Using in Svelte 5 Components

```svelte
<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import { counterReducer, initialState } from './counter';
  import { onDestroy } from 'svelte';

  const store = createStore({
    initialState,
    reducer: counterReducer
  });

  // Derived state (reactive)
  const canDecrement = $derived(store.state.count > 0);

  onDestroy(() => store.destroy());
</script>

<div>
  <h2>Count: {store.state.count}</h2>

  <button
    onclick={() => store.dispatch({ type: 'decrement' })}
    disabled={!canDecrement}
  >
    -
  </button>

  <button onclick={() => store.dispatch({ type: 'increment' })}>
    +
  </button>
</div>
```

## Testing

```typescript
import { TestStore } from '@composable-svelte/core';
import { counterReducer, initialState } from './counter';

describe('Counter', () => {
  it('increments count', async () => {
    const store = new TestStore({ initialState, reducer: counterReducer });

    await store.send({ type: 'increment' }, (state) => {
      expect(state.count).toBe(1);
    });

    await store.send({ type: 'increment' }, (state) => {
      expect(state.count).toBe(2);
    });

    store.assertNoPendingActions();
  });

  it('handles async effects', async () => {
    const store = new TestStore({ initialState, reducer: counterReducer });

    await store.send({ type: 'loadAsync' });

    await store.receive({ type: 'loadComplete' }, (state) => {
      expect(state.isLoading).toBe(false);
      expect(state.count).toBe(42);
    });
  });
});
```

## Examples

See `examples/counter` for a complete working example.

## Documentation

Full documentation will be available in Phase 5.

For now, refer to the TypeScript types and JSDoc comments in the source code.

## Roadmap

- ✅ **Phase 1 (Current)**: Core architecture - store, effects, composition, testing
- 🔄 **Phase 2**: Navigation system
- 🔄 **Phase 3**: DSL + matchers
- 🔄 **Phase 4**: Animation integration
- 🔄 **Phase 5**: Polish, documentation, examples, 1.0.0 release

## License

MIT
