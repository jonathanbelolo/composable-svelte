# Getting Started with Composable Svelte

Welcome to **Composable Svelte** - a Composable Architecture library for Svelte 5, inspired by [The Composable Architecture (TCA)](https://github.com/pointfreeco/swift-composable-architecture) from Swift/iOS.

## What is Composable Svelte?

Composable Svelte helps you build predictable, testable, and maintainable Svelte applications using:

- **Pure Reducers**: State management with `(state, action, deps) => [newState, effect]`
- **Declarative Effects**: Side effects as data structures
- **Composability**: Nest and scope reducers like Lego blocks
- **Type-Safe Navigation**: State-driven navigation with Modal, Sheet, Drawer, Alert
- **TestStore**: Exhaustive action testing
- **Complete Backend**: API client, WebSocket, Storage, Clock dependencies

## Prerequisites

- Node.js 18+ or Bun
- Svelte 5 (with runes)
- TypeScript 5.0+
- Basic understanding of Svelte and TypeScript

## Installation

```bash
npm install @composable-svelte/core
# or
pnpm add @composable-svelte/core
# or
bun add @composable-svelte/core
```

> **Note**: The package is not yet published to npm. Clone the repository to use it in development.

### Peer Dependencies

Composable Svelte requires:

```json
{
  "svelte": "^5.0.0",
  "motion": "^11.0.0"
}
```

Install them if not already present:

```bash
npm install svelte@^5.0.0 motion@^11.0.0
```

## Your First App: Counter

Let's build a simple counter application to understand the core concepts.

### 1. Define Your State

```typescript
// counter-store.ts
import { createStore, Effect } from '@composable-svelte/core';

// 1. Define your state
interface CounterState {
  count: number;
  isLoading: boolean;
}
```

### 2. Define Your Actions

```typescript
// All possible user actions
type CounterAction =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'incrementAsync' }
  | { type: 'incrementCompleted' };
```

### 3. Create a Reducer

```typescript
// Pure function: (state, action, deps) => [newState, effect]
const counterReducer = (
  state: CounterState,
  action: CounterAction,
  deps: {}
): [CounterState, Effect<CounterAction>] => {
  switch (action.type) {
    case 'increment':
      return [
        { ...state, count: state.count + 1 },
        Effect.none()
      ];

    case 'decrement':
      return [
        { ...state, count: state.count - 1 },
        Effect.none()
      ];

    case 'incrementAsync':
      return [
        { ...state, isLoading: true },
        Effect.run(async (dispatch) => {
          await new Promise(resolve => setTimeout(resolve, 1000));
          dispatch({ type: 'incrementCompleted' });
        })
      ];

    case 'incrementCompleted':
      return [
        { ...state, count: state.count + 1, isLoading: false },
        Effect.none()
      ];
  }
};
```

### 4. Create the Store

```typescript
// Create the store
export const counterStore = createStore({
  initialState: { count: 0, isLoading: false },
  reducer: counterReducer,
  dependencies: {}
});
```

### 5. Use in Svelte Component

```svelte
<!-- Counter.svelte -->
<script lang="ts">
  import { counterStore } from './counter-store';
</script>

<div class="counter">
  <h1>Count: {counterStore.state.count}</h1>

  <div class="button-group">
    <button onclick={() => counterStore.dispatch({ type: 'increment' })}>
      +
    </button>

    <button onclick={() => counterStore.dispatch({ type: 'decrement' })}>
      -
    </button>

    <button
      onclick={() => counterStore.dispatch({ type: 'incrementAsync' })}
      disabled={counterStore.state.isLoading}
    >
      {counterStore.state.isLoading ? 'Loading...' : 'Async +'}
    </button>
  </div>
</div>

<style>
  .counter {
    text-align: center;
    padding: 2rem;
  }

  .button-group {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-top: 1rem;
  }

  button {
    padding: 0.5rem 1rem;
    font-size: 1rem;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
```

## Key Concepts

### Pure Reducers

Reducers are **pure functions** that take the current state and an action, then return a new state and an effect:

```typescript
const reducer = (state, action, deps) => {
  // Return [newState, effect]
  return [newState, Effect.none()];
};
```

**Benefits**:
- Predictable: Same inputs always produce same outputs
- Testable: No side effects to mock
- Debuggable: Easy to trace state changes

### Effects as Data

Effects are **data structures** describing side effects, not the side effects themselves:

```typescript
// Run async work
Effect.run(async (dispatch) => {
  const data = await fetch('/api/data');
  dispatch({ type: 'dataLoaded', data });
})

// Fire and forget
Effect.fireAndForget(async () => {
  await analytics.track('button_clicked');
})

// Batch multiple effects
Effect.batch(
  Effect.run(/* ... */),
  Effect.fireAndForget(/* ... */)
)

// No effect
Effect.none()
```

### Reactive State

The store's state is a **Svelte 5 rune** (`$state`), making it automatically reactive:

```svelte
<script>
  import { store } from './store';
</script>

<!-- Automatically updates when state changes -->
<h1>{store.state.count}</h1>
```

### Type Safety

TypeScript ensures type safety throughout:

```typescript
// Compile error: Property 'xyz' does not exist
store.dispatch({ type: 'xyz' });

// Compile error: Missing required property
store.dispatch({ type: 'increment' });

// ✅ Type-safe
store.dispatch({ type: 'increment' });
```

## Testing Your App

Use `TestStore` for exhaustive action testing:

```typescript
import { createTestStore } from '@composable-svelte/core';
import { describe, it, expect } from 'vitest';

describe('Counter', () => {
  it('should increment count', async () => {
    const store = createTestStore({
      initialState: { count: 0, isLoading: false },
      reducer: counterReducer,
      dependencies: {}
    });

    // Test synchronous action
    await store.send({ type: 'increment' }, (state) => {
      expect(state.count).toBe(1);
    });
  });

  it('should increment count asynchronously', async () => {
    const store = createTestStore({
      initialState: { count: 0, isLoading: false },
      reducer: counterReducer,
      dependencies: {}
    });

    // Test async action
    await store.send({ type: 'incrementAsync' }, (state) => {
      expect(state.isLoading).toBe(true);
      expect(state.count).toBe(0);
    });

    // Test effect completion
    await store.receive({ type: 'incrementCompleted' }, (state) => {
      expect(state.count).toBe(1);
      expect(state.isLoading).toBe(false);
    });
  });
});
```

## Next Steps

Now that you understand the basics, explore:

1. **[Core Concepts](./core-concepts/store-and-reducers.md)** - Deep dive into store and reducers
2. **[Effects](./core-concepts/effects.md)** - Learn all effect types
3. **[Navigation](./navigation/tree-based.md)** - State-driven navigation
4. **[Backend Integration](./backend/api-client.md)** - API, WebSocket, Storage
5. **[Testing](./core-concepts/testing.md)** - Comprehensive testing guide

## Examples

Check out complete working examples:

- **[Product Gallery](../../../examples/product-gallery/)** - Full-featured e-commerce app
- **[Styleguide](../../../examples/styleguide/)** - Component showcase with 73+ components
- **[URL Routing](../../../examples/url-routing/)** - Browser history integration

## Getting Help

- **[API Reference](./api/reference.md)** - Complete API documentation
- **[Troubleshooting](./troubleshooting.md)** - Common issues and solutions
- **[GitHub Issues](https://github.com/jonathanbelolo/composable-svelte/issues)** - Report bugs or request features

## Philosophy

Composable Svelte follows these principles:

- **Specification-First**: Complete specs before implementation
- **Type Safety**: Leverage TypeScript for compile-time guarantees
- **Testability**: Every feature testable in isolation
- **Composability**: Reducers compose like Lego blocks
- **Declarative**: State and effects as data, not imperative code
- **Predictable**: Same inputs always produce same outputs

Welcome to the Composable Architecture for Svelte! 🎉
