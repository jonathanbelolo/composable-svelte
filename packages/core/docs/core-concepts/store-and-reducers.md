# Store and Reducers

Deep dive into the heart of Composable Svelte's state management: the Store and Reducer pattern.

## Table of Contents

1. [Overview](#overview)
2. [The Store](#the-store)
3. [Reducers](#reducers)
4. [State Management Patterns](#state-management-patterns)
5. [Advanced Techniques](#advanced-techniques)
6. [Best Practices](#best-practices)
7. [Common Pitfalls](#common-pitfalls)

## Overview

Composable Svelte uses a unidirectional data flow architecture:

```
User Action → Dispatch → Reducer → New State + Effect → Store Updates → UI Re-renders
                                                         ↓
                                                    Effect Executes → Dispatch New Action
```

### Key Principles

1. **Single Source of Truth**: All application state lives in the store
2. **State is Read-Only**: Only reducers can change state
3. **Pure Functions**: Reducers are deterministic and side-effect free
4. **Effects as Data**: Side effects are data structures, not executed in reducers

## The Store

The store is the container for your application state, created with `createStore()`.

### Creating a Store

```typescript
import { createStore, Effect } from '@composable-svelte/core';

interface AppState {
  count: number;
  user: User | null;
  isLoading: boolean;
}

type AppAction =
  | { type: 'increment' }
  | { type: 'loadUser'; id: string }
  | { type: 'userLoaded'; user: User };

const appStore = createStore<AppState, AppAction>({
  initialState: {
    count: 0,
    user: null,
    isLoading: false
  },
  reducer: appReducer,
  dependencies: {
    api: createAPIClient({ baseURL: '/api' })
  }
});
```

### Store API

#### `store.state`

Reactive Svelte 5 rune (`$state`) containing current state:

```svelte
<script>
  import { appStore } from './store';
</script>

<!-- Automatically reactive -->
<h1>Count: {appStore.state.count}</h1>
<p>User: {appStore.state.user?.name ?? 'Not logged in'}</p>
```

The state is a **Svelte 5 rune**, meaning:
- **Automatically reactive**: Components re-render when state changes
- **Fine-grained**: Only components using specific state fields re-render
- **Type-safe**: TypeScript knows the exact shape of `state`

#### `store.dispatch(action)`

Sends an action to the reducer:

```typescript
// Dispatch synchronous action
appStore.dispatch({ type: 'increment' });

// Dispatch action with payload
appStore.dispatch({ type: 'loadUser', id: '123' });
```

**Important**: `dispatch()` is synchronous. It:
1. Calls the reducer with current state + action
2. Updates the store's state
3. Schedules effect execution (if any)
4. Returns immediately (does NOT wait for effects)

#### `store.subscribe(listener)`

Listen to state changes:

```typescript
const unsubscribe = appStore.subscribe((newState, prevState) => {
  console.log('State changed:', { newState, prevState });
});

// Later, clean up
unsubscribe();
```

**Use Cases**:
- Syncing with external systems (localStorage, analytics)
- Debugging and logging
- React to state changes from outside Svelte components

**In Svelte Components**: Usually not needed! Just use `store.state` directly.

#### `store.destroy()`

Cleanup store resources:

```typescript
// Cancel all in-flight effects
// Remove all listeners
// Clean up dependencies
appStore.destroy();
```

**When to use**:
- When unmounting a dynamically created store
- In tests (cleanup between tests)
- When the store is no longer needed

## Reducers

Reducers are **pure functions** that compute the next state and effects from the current state and an action.

### Reducer Signature

```typescript
type Reducer<State, Action, Dependencies> = (
  state: State,
  action: Action,
  dependencies: Dependencies
) => [State, Effect<Action>];
```

**Parameters**:
- `state`: Current state (read-only, never mutate!)
- `action`: The action being processed
- `dependencies`: Injected dependencies (API clients, clocks, etc.)

**Returns**: A tuple `[newState, effect]`:
- `newState`: The next state (must be a new object if changed)
- `effect`: Side effect to execute (or `Effect.none()`)

### Basic Reducer Example

```typescript
const counterReducer = (
  state: CounterState,
  action: CounterAction,
  deps: {}
): [CounterState, Effect<CounterAction>] => {
  switch (action.type) {
    case 'increment':
      // Return new state + no effect
      return [
        { ...state, count: state.count + 1 },
        Effect.none()
      ];

    case 'decrement':
      return [
        { ...state, count: state.count - 1 },
        Effect.none()
      ];

    case 'reset':
      return [
        { ...state, count: 0 },
        Effect.none()
      ];

    default:
      // TypeScript exhaustiveness check
      const _never: never = action;
      return [state, Effect.none()];
  }
};
```

### Async Operations with Effects

Reducers are **synchronous and pure**. For async work, return an effect:

```typescript
const userReducer = (
  state: UserState,
  action: UserAction,
  deps: { api: APIClient }
): [UserState, Effect<UserAction>] => {
  switch (action.type) {
    case 'loadUser':
      return [
        { ...state, isLoading: true },
        Effect.run(async (dispatch) => {
          const result = await deps.api.get(`/users/${action.id}`);
          if (result.ok) {
            dispatch({ type: 'userLoaded', user: result.data });
          } else {
            dispatch({ type: 'userLoadFailed', error: result.error });
          }
        })
      ];

    case 'userLoaded':
      return [
        { ...state, user: action.user, isLoading: false },
        Effect.none()
      ];

    case 'userLoadFailed':
      return [
        { ...state, isLoading: false, error: action.error },
        Effect.none()
      ];
  }
};
```

**Key Points**:
- The reducer sets `isLoading: true` **immediately**
- The effect runs **after** the reducer returns
- The effect dispatches new actions when complete
- The UI updates at each step

### Dependencies Injection

Dependencies make reducers testable by avoiding direct access to globals:

```typescript
interface Dependencies {
  api: APIClient;
  clock: Clock;
  storage: Storage<AppData>;
}

// Production store
const store = createStore({
  initialState,
  reducer,
  dependencies: {
    api: createAPIClient({ baseURL: '/api' }),
    clock: createSystemClock(),
    storage: createLocalStorage({ prefix: 'app:' })
  }
});

// Test store
const testStore = createTestStore({
  initialState,
  reducer,
  dependencies: {
    api: createMockAPI({
      '/users/:id': { ok: true, data: mockUser }
    }),
    clock: createMockClock(0),
    storage: createMockStorage()
  }
});
```

## State Management Patterns

### Immutability

**Never mutate state directly!** Always return a new object:

```typescript
// ❌ BAD: Mutating state
case 'updateUser':
  state.user.name = action.name; // MUTATION!
  return [state, Effect.none()];

// ✅ GOOD: Immutable update
case 'updateUser':
  return [
    {
      ...state,
      user: state.user
        ? { ...state.user, name: action.name }
        : null
    },
    Effect.none()
  ];
```

### Nested State Updates

Use spread operator for nested updates:

```typescript
interface AppState {
  ui: {
    sidebar: { isOpen: boolean; width: number };
    modal: { isOpen: boolean; content: string | null };
  };
  data: {
    users: User[];
    posts: Post[];
  };
}

case 'toggleSidebar':
  return [
    {
      ...state,
      ui: {
        ...state.ui,
        sidebar: {
          ...state.ui.sidebar,
          isOpen: !state.ui.sidebar.isOpen
        }
      }
    },
    Effect.none()
  ];
```

**Tip**: For deeply nested updates, consider flattening your state or using helper functions.

### Array Operations

```typescript
case 'addTodo':
  return [
    {
      ...state,
      todos: [...state.todos, action.todo] // Append
    },
    Effect.none()
  ];

case 'removeTodo':
  return [
    {
      ...state,
      todos: state.todos.filter(todo => todo.id !== action.id) // Remove
    },
    Effect.none()
  ];

case 'updateTodo':
  return [
    {
      ...state,
      todos: state.todos.map(todo =>
        todo.id === action.id
          ? { ...todo, ...action.updates } // Update
          : todo
      )
    },
    Effect.none()
  ];
```

### Derived State

Use Svelte's `$derived` for computed values:

```svelte
<script>
  import { appStore } from './store';

  // Computed value (memoized, only recomputes when dependencies change)
  const completedCount = $derived(
    appStore.state.todos.filter(t => t.completed).length
  );
</script>

<p>Completed: {completedCount} / {appStore.state.todos.length}</p>
```

**Do NOT** store derived state in the store itself:

```typescript
// ❌ BAD: Redundant derived state
interface State {
  todos: Todo[];
  completedCount: number; // BAD: Can be computed from todos
}

// ✅ GOOD: Only store source data
interface State {
  todos: Todo[];
}
```

## Advanced Techniques

### Optimistic Updates

Update UI immediately, then sync with server:

```typescript
case 'saveTodo':
  return [
    {
      ...state,
      todos: state.todos.map(todo =>
        todo.id === action.todo.id
          ? { ...todo, ...action.updates, _syncing: true } // Optimistic update
          : todo
      )
    },
    Effect.run(async (dispatch) => {
      const result = await deps.api.put(`/todos/${action.todo.id}`, action.updates);
      if (result.ok) {
        dispatch({ type: 'todoSaved', id: action.todo.id });
      } else {
        dispatch({ type: 'todoSaveFailed', id: action.todo.id, error: result.error });
      }
    })
  ];

case 'todoSaved':
  return [
    {
      ...state,
      todos: state.todos.map(todo =>
        todo.id === action.id
          ? { ...todo, _syncing: false }
          : todo
      )
    },
    Effect.none()
  ];

case 'todoSaveFailed':
  return [
    {
      ...state,
      todos: state.todos.map(todo =>
        todo.id === action.id
          ? { ...todo, _syncing: false, _error: action.error } // Revert on error
          : todo
      )
    },
    Effect.none()
  ];
```

### Batching Multiple Effects

Execute multiple side effects:

```typescript
case 'saveAndNotify':
  return [
    { ...state, isSaving: true },
    Effect.batch(
      Effect.run(async (dispatch) => {
        await deps.api.post('/data', state.data);
        dispatch({ type: 'saved' });
      }),
      Effect.fireAndForget(async () => {
        await deps.analytics.track('data_saved');
      })
    )
  ];
```

### Cancellation

Cancel in-flight effects:

```typescript
let searchEffectId = 0;

case 'searchTextChanged':
  const effectId = ++searchEffectId;

  return [
    { ...state, searchText: action.text },
    Effect.batch(
      // Cancel previous search
      Effect.cancel(`search-${searchEffectId - 1}`),
      // Start new search
      Effect.run(
        async (dispatch) => {
          await new Promise(r => setTimeout(r, 300)); // Debounce
          const results = await deps.api.get('/search', {
            params: { q: action.text }
          });
          dispatch({ type: 'searchResults', results });
        },
        { id: `search-${effectId}` }
      )
    )
  ];
```

### Conditional Effects

Only run effects based on state:

```typescript
case 'incrementIfEven':
  if (state.count % 2 !== 0) {
    // Don't increment if odd
    return [state, Effect.none()];
  }

  return [
    { ...state, count: state.count + 1 },
    Effect.fireAndForget(async () => {
      console.log('Incremented to:', state.count + 1);
    })
  ];
```

## Best Practices

### 1. Keep Reducers Pure

```typescript
// ❌ BAD: Side effects in reducer
case 'loadData':
  fetch('/api/data').then(data => {
    // This won't work! Reducer has already returned.
  });
  return [state, Effect.none()];

// ✅ GOOD: Side effects as Effects
case 'loadData':
  return [
    state,
    Effect.run(async (dispatch) => {
      const result = await fetch('/api/data');
      dispatch({ type: 'dataLoaded', data: result });
    })
  ];
```

### 2. Use TypeScript Discriminated Unions

```typescript
// ✅ Exhaustive type checking
type Action =
  | { type: 'increment' }
  | { type: 'add'; amount: number }
  | { type: 'reset' };

const reducer = (state, action, deps) => {
  switch (action.type) {
    case 'increment':
      return [{ ...state, count: state.count + 1 }, Effect.none()];
    case 'add':
      return [{ ...state, count: state.count + action.amount }, Effect.none()];
    case 'reset':
      return [{ ...state, count: 0 }, Effect.none()];
    default:
      // TypeScript error if not all cases handled
      const _never: never = action;
      return [state, Effect.none()];
  }
};
```

### 3. Small, Focused Actions

```typescript
// ❌ BAD: Giant "god" action
type Action = {
  type: 'update';
  userUpdates?: Partial<User>;
  todoUpdates?: Partial<Todo>;
  uiUpdates?: Partial<UIState>;
};

// ✅ GOOD: Specific actions
type Action =
  | { type: 'updateUserName'; name: string }
  | { type: 'updateUserEmail'; email: string }
  | { type: 'toggleTodo'; id: string }
  | { type: 'showSidebar' }
  | { type: 'hideSidebar' };
```

### 4. Normalize State Shape

```typescript
// ❌ BAD: Nested arrays
interface State {
  users: Array<{
    id: string;
    posts: Array<{
      id: string;
      comments: Array<Comment>;
    }>;
  }>;
}

// ✅ GOOD: Normalized (flat) structure
interface State {
  users: Record<string, User>;
  posts: Record<string, Post>;
  comments: Record<string, Comment>;
}
```

### 5. Handle All Cases

```typescript
// ✅ Always handle loading, success, and error states
type LoadingState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: Data }
  | { status: 'error'; error: string };

interface State {
  data: LoadingState;
}
```

## Common Pitfalls

### Pitfall 1: Mutating State

```typescript
// ❌ WRONG
case 'addItem':
  state.items.push(action.item); // Mutation!
  return [state, Effect.none()];

// ✅ CORRECT
case 'addItem':
  return [
    { ...state, items: [...state.items, action.item] },
    Effect.none()
  ];
```

### Pitfall 2: Forgetting to Return New State

```typescript
// ❌ WRONG: Returning the same state object
case 'updateName':
  return [state, Effect.none()]; // State didn't change!

// ✅ CORRECT
case 'updateName':
  return [
    { ...state, user: { ...state.user, name: action.name } },
    Effect.none()
  ];
```

### Pitfall 3: Async Code in Reducer

```typescript
// ❌ WRONG: async reducer
const reducer = async (state, action, deps) => {
  // This won't work!
  const data = await fetch('/api');
  return [{ ...state, data }, Effect.none()];
};

// ✅ CORRECT: Use effects
const reducer = (state, action, deps) => {
  return [
    state,
    Effect.run(async (dispatch) => {
      const data = await fetch('/api');
      dispatch({ type: 'dataLoaded', data });
    })
  ];
};
```

### Pitfall 4: Not Handling Effect Results

```typescript
// ⚠️ WARNING: Effect can fail silently
Effect.run(async (dispatch) => {
  const result = await deps.api.get('/data');
  // What if result.ok is false?
  dispatch({ type: 'loaded', data: result.data });
})

// ✅ BETTER: Handle both success and error
Effect.run(async (dispatch) => {
  const result = await deps.api.get('/data');
  if (result.ok) {
    dispatch({ type: 'loaded', data: result.data });
  } else {
    dispatch({ type: 'loadFailed', error: result.error });
  }
})
```

### Pitfall 5: Storing Functions in State

```typescript
// ❌ BAD: Functions can't be serialized/compared
interface State {
  onClick: () => void; // Bad!
}

// ✅ GOOD: Store data, derive functions in components
interface State {
  selectedId: string | null;
}

// In component
const handleClick = (id: string) => {
  store.dispatch({ type: 'select', id });
};
```

## Next Steps

- **[Effects](./effects.md)** - Deep dive into the effect system
- **[Composition](./composition.md)** - Composing reducers with `scope()`
- **[Testing](./testing.md)** - Testing patterns with TestStore

## Related Documentation

- [Getting Started](../getting-started.md) - Basic store setup
- [Navigation](../navigation/tree-based.md) - State-driven navigation
- [API Reference](../api/reference.md) - Complete API documentation
