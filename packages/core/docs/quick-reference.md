# Quick Reference

A concise reference for @composable-svelte/core. For detailed documentation, see [Documentation Index](./README.md).

## Installation

```bash
npm install @composable-svelte/core svelte@^5.0.0 motion@^11.0.0
```

## Core Patterns

### Basic Store

```typescript
import { createStore, Effect } from '@composable-svelte/core';

const store = createStore({
  initialState: { count: 0 },
  reducer: (state, action, deps) => {
    switch (action.type) {
      case 'increment':
        return [{ ...state, count: state.count + 1 }, Effect.none()];
    }
  },
  dependencies: {}
});

// In Svelte component
store.dispatch({ type: 'increment' });
console.log(store.state.count); // Reactive
```

### Effects

```typescript
// No effect
Effect.none()

// Run async work
Effect.run(async (dispatch) => {
  const data = await fetch('/api');
  dispatch({ type: 'loaded', data });
})

// Fire and forget
Effect.fireAndForget(async () => {
  await analytics.track('event');
})

// Batch multiple
Effect.batch(
  Effect.run(/* ... */),
  Effect.fireAndForget(/* ... */)
)

// Merge (race condition)
Effect.merge(
  Effect.run(/* ... */),
  Effect.run(/* ... */)
)

// Cancel by ID
Effect.cancel('my-effect-id')
```

### Composition

```typescript
import { scope, combineReducers } from '@composable-svelte/core';

// Compose child reducer
const appReducer = scope(
  // Extract child state
  (state) => state.counter,
  // Update child state
  (state, counter) => ({ ...state, counter }),
  // Extract child action
  (action) => action.type === 'counter' ? action.action : null,
  // Embed child action
  (childAction) => ({ type: 'counter', action: childAction }),
  // Child reducer
  counterReducer
);
```

## Navigation

### Optional Child (Modal/Sheet/Drawer)

```typescript
import { ifLet, PresentationAction } from '@composable-svelte/core';

interface State {
  destination: AddItemState | null;
}

// In reducer
case 'addButtonTapped':
  return [
    { ...state, destination: { title: '', description: '' } },
    Effect.none()
  ];

case 'destination':
  return ifLet(
    (s) => s.destination,
    (s, d) => ({ ...s, destination: d }),
    (a) => a.type === 'presented' ? a.action : null,
    (ca) => ({ type: 'presented', action: ca }),
    addItemReducer
  )(state, action, deps);
```

### Navigation Components

```svelte
<script>
  import { Modal, Sheet, Drawer, Alert } from '@composable-svelte/core/navigation-components';
  import { scopeToOptional } from '@composable-svelte/core';

  const scopedStore = scopeToOptional(store, 'destination');
</script>

{#if scopedStore}
  <Modal store={scopedStore}>
    <AddItemForm />
  </Modal>
{/if}
```

### Enum Destinations

```typescript
import { createDestinationReducer } from '@composable-svelte/core';

type DestinationState =
  | { type: 'addItem'; state: AddItemState }
  | { type: 'editItem'; state: EditItemState };

const destinationReducer = createDestinationReducer({
  addItem: addItemReducer,
  editItem: editItemReducer
});
```

## DSL & Matchers

### createDestination

```typescript
import { createDestination } from '@composable-svelte/core';

const { reducer, Destination } = createDestination({
  addItem: addItemReducer,
  editItem: editItemReducer
});

// In parent reducer
const [newState, effect] = reducer(state.destination, action, deps);
return [{ ...state, destination: newState }, effect];

// Type-safe matching
if (Destination.is(action, 'addItem.saveButtonTapped')) {
  // action matched saveButtonTapped in addItem
}

const editState = Destination.extract(state, 'editItem');
// editState is EditItemState | null
```

### Case Path Matching

```typescript
// Boolean check
Destination.is(action, 'addItem.saveButtonTapped') // boolean

// Extract state
Destination.extract(state, 'editItem') // EditItemState | null

// Match action + extract state atomically
const editState = Destination.matchCase(action, state, 'editItem.saveButtonTapped');
if (editState) {
  // editState is EditItemState
  // action matched saveButtonTapped
}

// Multi-case matching
const result = Destination.match(action, state, {
  'addItem.saveButtonTapped': (addState) => ({ type: 'add', item: addState.item }),
  'editItem.saveButtonTapped': (editState) => ({ type: 'edit', item: editState.item })
});
if (result.matched) {
  const { type, item } = result.value;
}
```

### Scope Helpers

```typescript
import { scopeToOptional, scopeToDestination } from '@composable-svelte/core';

// Scope to optional field
const scopedStore = scopeToOptional(store, 'destination');

// Scope to enum destination
const scopedStore = scopeToDestination(store, 'destination', 'addItem');

// Fluent API (alternative)
import { scopeTo } from '@composable-svelte/core';
const scopedStore = scopeTo(store).into('destination').case('addItem');
```

## Animation

### PresentationState

```typescript
interface State {
  destination: DestinationState | null;
  presentation: PresentationState<DestinationState>;
}

// Lifecycle: idle → presenting → presented → dismissing → idle

case 'showModal':
  return [
    {
      ...state,
      destination: { /* ... */ },
      presentation: {
        status: 'presenting',
        content: { /* ... */ },
        duration: 0.3
      }
    },
    Effect.run(async (dispatch) => {
      await new Promise(r => setTimeout(r, 300));
      dispatch({ type: 'presentation', event: { type: 'presentationCompleted' } });
    })
  ];
```

### Animation Helpers

```typescript
import {
  animateModalIn,
  animateModalOut,
  animateSheetIn,
  animateSheetOut
} from '@composable-svelte/core/animation';

// In component
$effect(() => {
  if (presentation.status === 'presenting') {
    animateModalIn(element).then(() => {
      store.dispatch({
        type: 'presentation',
        event: { type: 'presentationCompleted' }
      });
    });
  }
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
    },
    response: async (response) => {
      return response;
    }
  }
});

// In reducer
Effect.run(async (dispatch) => {
  const result = await deps.api.get('/users', {
    params: { page: 1 },
    headers: { 'X-Custom': 'value' }
  });

  if (result.ok) {
    dispatch({ type: 'usersLoaded', users: result.data });
  } else {
    dispatch({ type: 'usersFailed', error: result.error });
  }
})
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

  ws.on('connected', () => {
    dispatch({ type: 'wsConnected' });
  });

  await ws.connect();
})

// Send messages
ws.send({ type: 'subscribe', channel: 'updates' });
```

### Dependencies

```typescript
import {
  createSystemClock,
  createMockClock,
  createLocalStorage,
  createCookieStorage
} from '@composable-svelte/core';

// Clock
const clock = createSystemClock();
const timestamp = clock.now();
const iso = clock.toISO();

// Storage
const storage = createLocalStorage<User>({
  prefix: 'app:',
  validator: isUser
});
storage.setItem('user', currentUser);
const user = storage.getItem('user');

// Cookies
const cookies = createCookieStorage<string>({
  secure: true,
  sameSite: 'Strict',
  maxAge: 3600
});
cookies.setItem('sessionToken', 'jwt_token');
```

## URL Routing

### Browser History Sync

```typescript
import { createURLSyncEffect } from '@composable-svelte/core/routing';

// In reducer
case 'navigate':
  return [
    { ...state, currentPath: action.path },
    createURLSyncEffect(action.path, action.state)
  ];

// Pattern matching
import { matchPattern } from '@composable-svelte/core/routing';

const match = matchPattern('/users/:id/posts/:postId', '/users/123/posts/456');
if (match) {
  console.log(match.params); // { id: '123', postId: '456' }
}
```

## Testing

### TestStore

```typescript
import { createTestStore } from '@composable-svelte/core';

const store = createTestStore({
  initialState: { count: 0, isLoading: false },
  reducer: counterReducer,
  dependencies: {
    clock: createMockClock(0),
    api: createMockAPI()
  }
});

// Test synchronous action
await store.send({ type: 'increment' }, (state) => {
  expect(state.count).toBe(1);
});

// Test async action
await store.send({ type: 'incrementAsync' }, (state) => {
  expect(state.isLoading).toBe(true);
});

await store.receive({ type: 'incrementCompleted' }, (state) => {
  expect(state.count).toBe(1);
  expect(state.isLoading).toBe(false);
});
```

### Mock Dependencies

```typescript
import { createMockClock } from '@composable-svelte/core';

const mockClock = createMockClock(0);
mockClock.advance(1000); // +1 second
expect(mockClock.now()).toBe(1000);

// Mock API
const mockAPI = {
  get: vi.fn().mockResolvedValue({ ok: true, data: [] })
};

// Mock Storage
const mockStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn()
};
```

## Type Safety

### Action Discriminated Unions

```typescript
type Action =
  | { type: 'increment' }
  | { type: 'add'; amount: number }
  | { type: 'loadData'; id: string };

// TypeScript enforces exhaustiveness
const reducer = (state, action, deps) => {
  switch (action.type) {
    case 'increment':
      return [{ ...state, count: state.count + 1 }, Effect.none()];
    case 'add':
      return [{ ...state, count: state.count + action.amount }, Effect.none()];
    case 'loadData':
      // Must handle all cases
      return [state, Effect.none()];
  }
};
```

### Template Literal Types

```typescript
// Case paths have autocomplete
Destination.is(action, 'addItem.saveButtonTapped')
//                     ^ Autocomplete: 'addItem.saveButtonTapped' | 'editItem.deleteButtonTapped' | ...
```

## Common Patterns

### Dismiss from Child

```typescript
import { createDismissDependency } from '@composable-svelte/core';

// In parent
const dismissDep = createDismissDependency<ParentAction>((action) => ({
  type: 'destination',
  action: { type: 'dismiss' }
}));

// Pass to child
const [newState, effect] = childReducer(
  childState,
  childAction,
  { ...deps, dismiss: dismissDep }
);

// In child
case 'cancelButtonTapped':
  return [state, deps.dismiss()];
```

### Error Handling

```typescript
Effect.run(async (dispatch) => {
  try {
    const data = await fetch('/api');
    dispatch({ type: 'loaded', data });
  } catch (error) {
    dispatch({ type: 'failed', error: error.message });
  }
})
```

### Debouncing

```typescript
let debounceTimer: number | null = null;

case 'searchTextChanged':
  if (debounceTimer) clearTimeout(debounceTimer);

  return [
    { ...state, searchText: action.text },
    Effect.run(async (dispatch) => {
      await new Promise(r => debounceTimer = setTimeout(r, 300));
      dispatch({ type: 'performSearch', text: action.text });
    })
  ];
```

## Performance Tips

1. **Memoize Selectors**: Use `$derived` for computed values
2. **Batch Updates**: Use `Effect.batch()` for multiple effects
3. **Cancel Effects**: Use `Effect.cancel()` for cleanup
4. **Lazy Load**: Split reducers and load on demand
5. **Virtual Scrolling**: Use for large lists

## Debugging

### Enable Debug Mode

```typescript
const store = createStore({
  initialState,
  reducer,
  dependencies: {},
  debug: true // Logs all actions and state changes
});
```

### Chrome DevTools

```typescript
// Add to window for inspection
if (typeof window !== 'undefined') {
  (window as any).__stores__ = { appStore: store };
}
```

## Migration

### From Redux

- Replace actions → actions (same)
- Replace reducers → `(state, action, deps) => [newState, effect]`
- Replace middleware → Effects
- Replace thunks → `Effect.run()`
- Replace sagas → `Effect.run()` or `Effect.merge()`

### From TCA (Swift)

- `@Reducer` → Manual reducer functions
- `@Presents` → `destination: T | null`
- `Scope` → `scope()` / `ifLet()`
- `@Dependency(\.dismiss)` → `deps.dismiss()`
- `TestStore` → Similar API

## Resources

- **[Full Documentation](./README.md)**
- **[API Reference](./api/reference.md)**
- **[Examples](../../../examples/)**
- **[GitHub](https://github.com/jonathanbelolo/composable-svelte)**
