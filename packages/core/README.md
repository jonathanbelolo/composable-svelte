# @composable-svelte/core

A Composable Architecture for Svelte 5.

## Features

### Phase 1 (Core Architecture) ✅
- ✅ **Predictable State Management** - Pure reducers transform state based on actions
- ✅ **Type-Safe** - Full TypeScript support with discriminated unions
- ✅ **Effect System** - Declarative side effects (run, batch, cancellable, debounced, throttled, afterDelay, fireAndForget)
- ✅ **Reducer Composition** - Compose features with `scope()` and `combineReducers()`
- ✅ **TestStore** - Comprehensive testing support with send/receive pattern
- ✅ **Svelte 5 Integration** - Built on Svelte 5's $state runes for reactivity

### Phase 2 (Navigation System) ✅
- ✅ **Tree-Based Navigation** - Modal, Sheet, Alert, Drawer, Popover navigation
- ✅ **Stack-Based Navigation** - Multi-screen flows with NavigationStack
- ✅ **8 Navigation Components** - Accessible, tested, customizable
- ✅ **Type-Safe Action Routing** - `ifLetPresentation()` with full type inference
- ✅ **Store Scoping** - `scopeToDestination()` for child components
- ✅ **WCAG 2.1 AA Compliant** - Enterprise-grade accessibility

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

## Navigation Quick Start

```typescript
import { ifLetPresentation } from '@composable-svelte/core/navigation';
import { Modal } from '@composable-svelte/core/navigation-components';

// 1. Define state with optional destination
interface AppState {
  productDetail: ProductDetailState | null;
}

// 2. Define actions with PresentationAction wrapper
type AppAction =
  | { type: 'showProduct'; productId: string }
  | { type: 'productDetail'; action: PresentationAction<ProductDetailAction> };

// 3. Use ifLetPresentation in reducer
const appReducer: Reducer<AppState, AppAction, AppDeps> = (state, action, deps) => {
  switch (action.type) {
    case 'showProduct':
      return [{
        ...state,
        productDetail: { productId: action.productId }
      }, Effect.none()];

    case 'productDetail': {
      const [newState, effect] = ifLetPresentation(
        (s) => s.productDetail,
        (s, detail) => ({ ...s, productDetail: detail }),
        'productDetail',
        (childAction): AppAction => ({
          type: 'productDetail',
          action: { type: 'presented', action: childAction }
        }),
        productDetailReducer
      )(state, action, deps);

      // Observe dismiss
      if ('action' in action && action.action.type === 'dismiss') {
        return [{ ...newState, productDetail: null }, effect];
      }

      return [newState, effect];
    }

    default:
      return [state, Effect.none()];
  }
};
```

**In your Svelte component:**

```svelte
<script lang="ts">
  import { scopeToDestination } from '@composable-svelte/core/navigation';
  import { Modal } from '@composable-svelte/core/navigation-components';

  let { store } = $props();

  const detailStore = $derived(
    scopeToDestination(store, 'productDetail')
  );
</script>

{#if detailStore}
  <Modal
    open={true}
    title="Product Details"
    onOpenChange={(open) => !open && detailStore.dismiss()}
  >
    <ProductDetails store={detailStore} />
  </Modal>
{/if}
```

## Examples

- **Counter** - `examples/counter` - Basic store usage
- **Product Gallery** - `examples/product-gallery` - Complete navigation example with all 8 components

## Documentation

- **Navigation Guide** - [`docs/NAVIGATION-GUIDE.md`](../../docs/NAVIGATION-GUIDE.md) - Complete navigation system guide
- **Best Practices** - [`docs/navigation-best-practices.md`](../../docs/navigation-best-practices.md) - Patterns and pitfalls
- **Product Gallery README** - [`examples/product-gallery/README.md`](../../examples/product-gallery/README.md) - Architecture walkthrough

## Roadmap

- ✅ **Phase 1**: Core architecture - store, effects, composition, testing
- ✅ **Phase 2**: Navigation system - components, routing, accessibility
- 🔄 **Phase 3**: DSL + matchers - ergonomic fluent APIs
- 🔄 **Phase 4**: Animation integration - animated transitions
- 🔄 **Phase 5**: Polish, documentation, 1.0.0 release

## License

MIT
