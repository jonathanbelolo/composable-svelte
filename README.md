# Composable Svelte

A **Composable Architecture** library for Svelte 5, inspired by [The Composable Architecture (TCA)](https://github.com/pointfreeco/swift-composable-architecture) from Swift/iOS.

**Status**: ✅ Production-ready with 420+ tests

## Features

- ✅ **Pure Reducers**: Predictable state management with `(state, action, deps) => [newState, effect]`
- ✅ **Declarative Effects**: Side effects as data structures (run, fireAndForget, batch, merge, cancel)
- ✅ **Composability**: Nest and scope reducers like Lego blocks
- ✅ **Type-Safe Navigation**: State-driven navigation with Modal, Sheet, Drawer, Alert, NavigationStack
- ✅ **Svelte 5 Runes**: Full integration with Svelte's reactivity system (`$state`, `$derived`)
- ✅ **TestStore**: Exhaustive action testing with send/receive pattern
- ✅ **Complete Backend**: API client, WebSocket, Storage, Clock dependencies
- ✅ **73+ Components**: shadcn-svelte integration with reducer-driven patterns
- ✅ **URL Routing**: Browser history sync with pattern matching

## Quick Start

### Installation

```bash
npm install @composable-svelte/core
# or
pnpm add @composable-svelte/core
```

> **Note**: Package is not yet published to npm. Clone the repo to use it.

### Basic Example

```typescript
import { createStore, Effect } from '@composable-svelte/core';

// 1. Define your state
interface CounterState {
  count: number;
  isLoading: boolean;
}

// 2. Define your actions
type CounterAction =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'incrementAsync' }
  | { type: 'incrementCompleted' };

// 3. Create a reducer
const counterReducer = (
  state: CounterState,
  action: CounterAction,
  deps: {}
): [CounterState, Effect<CounterAction>] => {
  switch (action.type) {
    case 'increment':
      return [{ ...state, count: state.count + 1 }, Effect.none()];

    case 'decrement':
      return [{ ...state, count: state.count - 1 }, Effect.none()];

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

// 4. Create the store
const store = createStore({
  initialState: { count: 0, isLoading: false },
  reducer: counterReducer,
  dependencies: {}
});
```

### In Svelte Component

```svelte
<script lang="ts">
  import { store } from './counter-store';
</script>

<div>
  <h1>Count: {store.state.count}</h1>
  <button onclick={() => store.dispatch({ type: 'increment' })}>
    +
  </button>
  <button onclick={() => store.dispatch({ type: 'decrement' })}>
    -
  </button>
  <button
    onclick={() => store.dispatch({ type: 'incrementAsync' })}
    disabled={store.state.isLoading}
  >
    Async +
  </button>
</div>
```

## Core Concepts

### 1. Store

The store holds your app state and provides:
- `state`: Reactive Svelte 5 rune
- `dispatch(action)`: Send actions to the reducer
- `subscribe(listener)`: Listen to state changes

```typescript
const store = createStore({
  initialState,
  reducer,
  dependencies
});

// Access state (reactive)
console.log(store.state.count);

// Dispatch actions
store.dispatch({ type: 'increment' });
```

### 2. Reducers

Pure functions that take state + action and return new state + effects:

```typescript
const reducer = (state, action, deps) => {
  // Return [newState, effect]
  return [newState, Effect.none()];
};
```

### 3. Effects

Declarative side effects as data structures:

```typescript
// Run async work
Effect.run(async (dispatch) => {
  const data = await fetch('/api/data');
  dispatch({ type: 'dataLoaded', data });
});

// Fire and forget
Effect.fireAndForget(async () => {
  await analytics.track('button_clicked');
});

// Batch multiple effects
Effect.batch(
  Effect.run(/* ... */),
  Effect.fireAndForget(/* ... */)
);

// No effect
Effect.none();
```

### 4. Composition

Nest reducers to build complex features:

```typescript
import { scope, combineReducers } from '@composable-svelte/core';

// Compose child reducer into parent
const appReducer = scope(
  // Lens: extract child state
  (state) => state.counter,
  // Update: set child state
  (state, counter) => ({ ...state, counter }),
  // Extract child action
  (action) => action.type === 'counter' ? action.action : null,
  // Embed child action
  (childAction) => ({ type: 'counter', action: childAction }),
  // Child reducer
  counterReducer
);
```

### 5. Navigation

State-driven navigation with tree-based destinations:

```typescript
import { ifLet, PresentationAction } from '@composable-svelte/core';
import { Modal } from '@composable-svelte/core/navigation-components';

interface AppState {
  destination: AddItemState | null;
}

// In reducer
case 'addButtonTapped':
  return [
    { ...state, destination: { title: '', description: '' } },
    Effect.none()
  ];

// In component
{#if scopedStore}
  <Modal store={scopedStore}>
    <AddItemForm />
  </Modal>
{/if}
```

## Testing

Use `TestStore` for exhaustive action testing:

```typescript
import { createTestStore } from '@composable-svelte/core';

const store = createTestStore({
  initialState: { count: 0 },
  reducer: counterReducer
});

// Test action
await store.send({ type: 'increment' }, (state) => {
  expect(state.count).toBe(1);
});

// Test async effects
await store.send({ type: 'incrementAsync' }, (state) => {
  expect(state.isLoading).toBe(true);
});

await store.receive({ type: 'incrementCompleted' }, (state) => {
  expect(state.count).toBe(1);
  expect(state.isLoading).toBe(false);
});
```

## Backend Integration

### API Client

```typescript
import { createLiveAPI } from '@composable-svelte/core/api';

const api = createLiveAPI({
  baseURL: 'https://api.example.com',
  interceptors: {
    request: async (config) => {
      config.headers.Authorization = `Bearer ${token}`;
      return config;
    }
  }
});

// In reducer
Effect.run(async (dispatch) => {
  const result = await deps.api.get('/users');
  if (result.ok) {
    dispatch({ type: 'usersLoaded', users: result.data });
  }
});
```

### WebSocket

```typescript
import { createLiveWebSocket } from '@composable-svelte/core/websocket';

const ws = createLiveWebSocket({
  url: 'wss://api.example.com/ws',
  reconnect: {
    enabled: true,
    maxAttempts: 5,
    delayMs: 1000
  },
  heartbeat: {
    enabled: true,
    intervalMs: 30000
  }
});

// In reducer
Effect.run(async (dispatch) => {
  ws.on('message', (data) => {
    dispatch({ type: 'messageReceived', data });
  });
  await ws.connect();
});
```

### Storage & Clock

```typescript
import {
  createSystemClock,
  createLocalStorage
} from '@composable-svelte/core/dependencies';

const dependencies = {
  clock: createSystemClock(),
  storage: createLocalStorage<User>({
    prefix: 'app:',
    validator: isUser
  })
};

// In reducer
deps.storage.setItem('user', currentUser);
const timestamp = deps.clock.now();
```

## Examples

Explore working examples in the `examples/` directory:

- **[Styleguide](./examples/styleguide)**: Component showcase with 73+ components
- **[Product Gallery](./examples/product-gallery)**: Full-featured product browsing app
- **[URL Routing](./examples/url-routing)**: Browser history integration examples

```bash
# Run styleguide
cd examples/styleguide
pnpm install
pnpm dev
```

## Documentation

- **[API Documentation](./packages/core/src/dependencies/README.md)**: Dependencies module
- **[Security Guide](./packages/core/src/dependencies/SECURITY.md)**: Storage security best practices
- **[CLAUDE.md](./CLAUDE.md)**: Full project documentation for contributors

## Architecture

Inspired by [The Composable Architecture (TCA)](https://github.com/pointfreeco/swift-composable-architecture):

| TCA (Swift) | Composable Svelte |
|-------------|-------------------|
| `@Reducer` macro | Manual reducer functions |
| `@Presents` macro | `destination: T \| null` field |
| `Scope` | `scope()` / `ifLet()` operators |
| `@Dependency(\.dismiss)` | `deps.dismiss()` |
| `TestStore` | `TestStore` (similar API) |
| SwiftUI views | Svelte components |

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Type check
pnpm typecheck

# Run examples
cd examples/styleguide
pnpm dev
```

## Project Status

**Completed Phases:**
- ✅ Phase 1: Core (Store, Reducer, Effects)
- ✅ Phase 2: Navigation (Modal, Sheet, Drawer)
- ✅ Phase 3: DSL & Matchers
- ✅ Phase 4: Animation
- ✅ Phase 6: Component Library (73+ components)
- ✅ Phase 7: URL Routing
- ✅ Phase 8: Backend Integration (API, WebSocket, Dependencies)

**Test Coverage**: 420+ tests across all modules

## Contributing

This project follows a specification-first approach. See [CLAUDE.md](./CLAUDE.md) for contributor guidelines.

## License

MIT

## Acknowledgments

Heavily inspired by [The Composable Architecture](https://github.com/pointfreeco/swift-composable-architecture) by Point-Free. Adapted for Svelte 5 and TypeScript with love.
