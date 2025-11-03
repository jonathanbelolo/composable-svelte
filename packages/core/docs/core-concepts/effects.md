# Effects

Deep dive into Composable Svelte's effect system: declarative, type-safe side effects that integrate seamlessly with reducers.

## Table of Contents

1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [Effect Types](#effect-types)
4. [Effect Execution](#effect-execution)
5. [Common Patterns](#common-patterns)
6. [Advanced Techniques](#advanced-techniques)
7. [Testing Effects](#testing-effects)
8. [Best Practices](#best-practices)
9. [Common Pitfalls](#common-pitfalls)

## Overview

Effects are **declarative descriptions of side effects**. They're data structures that describe WHAT should happen, not HOW or WHEN it happens. The Store executes them after reducers complete.

### Key Principles

1. **Effects are Data**: They're values, not functions that execute immediately
2. **Reducers Stay Pure**: All side effects are described as Effect values
3. **Store Executes**: The Store handles all effect execution
4. **Type-Safe**: Effects carry the action type they can dispatch

### Why Effects?

```typescript
// ❌ BAD: Side effects in reducer
const reducer = (state, action, deps) => {
  switch (action.type) {
    case 'loadUser':
      // This won't work! Reducer has already returned.
      deps.api.fetchUser(action.id).then(user => {
        // How do we update state here?
      });
      return [state, Effect.none()];
  }
};

// ✅ GOOD: Effects as data
const reducer = (state, action, deps) => {
  switch (action.type) {
    case 'loadUser':
      return [
        { ...state, isLoading: true },
        Effect.run(async (dispatch) => {
          const user = await deps.api.fetchUser(action.id);
          dispatch({ type: 'userLoaded', user });
        })
      ];

    case 'userLoaded':
      return [
        { ...state, user: action.user, isLoading: false },
        Effect.none()
      ];
  }
};
```

## Core Concepts

### Effect Structure

All effects are discriminated unions with a `_tag` field:

```typescript
type Effect<Action> =
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Run'; readonly execute: EffectExecutor<Action> }
  | { readonly _tag: 'FireAndForget'; readonly execute: () => void | Promise<void> }
  | { readonly _tag: 'Batch'; readonly effects: readonly Effect<Action>[] }
  | { readonly _tag: 'Cancellable'; readonly id: string; readonly execute: EffectExecutor<Action> }
  | { readonly _tag: 'Debounced'; readonly id: string; readonly ms: number; readonly execute: EffectExecutor<Action> }
  | { readonly _tag: 'Throttled'; readonly id: string; readonly ms: number; readonly execute: EffectExecutor<Action> }
  | { readonly _tag: 'AfterDelay'; readonly ms: number; readonly execute: EffectExecutor<Action> }
  | { readonly _tag: 'Subscription'; readonly id: string; readonly setup: SubscriptionSetup<Action> };
```

### The Dispatch Function

Effects receive a `dispatch` function to send actions back to the store:

```typescript
type Dispatch<Action> = (action: Action) => void;

// Inside an effect
Effect.run(async (dispatch) => {
  const data = await api.fetch();
  dispatch({ type: 'dataLoaded', data }); // Type-safe!
});
```

### Effect Lifecycle

```
Action Dispatched
      ↓
Reducer Runs (pure)
      ↓
Returns [newState, effect]
      ↓
Store Updates State
      ↓
Effect Executes (async)
      ↓
Effect Dispatches Actions
      ↓
Reducer Runs Again...
```

## Effect Types

### `Effect.none()`

No side effects. Use this when an action only needs to update state.

```typescript
case 'increment':
  return [
    { ...state, count: state.count + 1 },
    Effect.none() // No side effects
  ];
```

**When to use**:
- Pure state updates
- No async operations needed
- Default case in switch statements

### `Effect.run()`

Execute async work and dispatch actions based on results.

```typescript
Effect.run<Action>(
  execute: (dispatch: Dispatch<Action>) => void | Promise<void>
): Effect<Action>
```

**Example: API call**

```typescript
case 'loadTodos':
  return [
    { ...state, isLoading: true },
    Effect.run(async (dispatch) => {
      try {
        const todos = await deps.api.get('/todos');
        dispatch({ type: 'todosLoaded', todos });
      } catch (error) {
        dispatch({ type: 'loadFailed', error: error.message });
      }
    })
  ];
```

**Example: Multiple dispatches**

```typescript
Effect.run(async (dispatch) => {
  dispatch({ type: 'started' });

  await performWork();

  dispatch({ type: 'progress', percent: 50 });

  await performMoreWork();

  dispatch({ type: 'completed' });
});
```

**When to use**:
- API calls
- Database queries
- File I/O
- Any async operation that needs to dispatch results

### `Effect.fireAndForget()`

Execute work without dispatching actions. "Fire and forget" - the store doesn't wait for completion.

```typescript
Effect.fireAndForget<Action>(
  execute: () => void | Promise<void>
): Effect<Action>
```

**Example: Analytics tracking**

```typescript
case 'buttonClicked':
  return [
    state,
    Effect.fireAndForget(() => {
      analytics.track('button_click', {
        button: action.buttonId,
        timestamp: Date.now()
      });
    })
  ];
```

**Example: Logging**

```typescript
case 'error':
  return [
    { ...state, error: action.error },
    Effect.fireAndForget(async () => {
      await logger.error('Application error', {
        error: action.error,
        state: state
      });
    })
  ];
```

**When to use**:
- Analytics/telemetry
- Logging
- Side effects that don't affect state
- Operations where you don't care about success/failure

**Note**: Cannot dispatch actions. If you need to dispatch, use `Effect.run()` instead.

### `Effect.batch()`

Execute multiple effects in parallel. All effects start simultaneously.

```typescript
Effect.batch<Action>(
  ...effects: Effect<Action>[]
): Effect<Action>
```

**Example: Parallel API calls**

```typescript
case 'loadDashboard':
  return [
    { ...state, isLoading: true },
    Effect.batch(
      Effect.run(async (dispatch) => {
        const user = await api.fetchUser();
        dispatch({ type: 'userLoaded', user });
      }),
      Effect.run(async (dispatch) => {
        const stats = await api.fetchStats();
        dispatch({ type: 'statsLoaded', stats });
      }),
      Effect.run(async (dispatch) => {
        const notifications = await api.fetchNotifications();
        dispatch({ type: 'notificationsLoaded', notifications });
      })
    )
  ];
```

**Example: Save + track**

```typescript
case 'saveData':
  return [
    { ...state, isSaving: true },
    Effect.batch(
      Effect.run(async (dispatch) => {
        await api.save(state.data);
        dispatch({ type: 'saved' });
      }),
      Effect.fireAndForget(() => {
        analytics.track('data_saved');
      })
    )
  ];
```

**Optimizations**:
- Empty batch returns `Effect.none()`
- Single effect returns that effect directly
- `Effect.none()` effects are filtered out

**When to use**:
- Multiple independent operations
- Parallel API calls
- Combining different effect types

### `Effect.cancellable()`

Execute effect that can be cancelled by ID. Starting a new effect with the same ID cancels the previous one.

```typescript
Effect.cancellable<Action>(
  id: string,
  execute: (dispatch: Dispatch<Action>) => void | Promise<void>
): Effect<Action>
```

**Example: Cancelling stale API requests**

```typescript
case 'searchChanged':
  return [
    { ...state, searchQuery: action.query },
    Effect.cancellable('search', async (dispatch) => {
      const results = await api.search(action.query);
      dispatch({ type: 'searchResults', results });
    })
  ];
```

**How it works**:
1. User types "h" → starts search for "h"
2. User types "e" → **cancels** search for "h", starts search for "he"
3. User types "l" → **cancels** search for "he", starts search for "hel"
4. Only the last search completes

**Example: Abort controller**

The store uses `AbortController` internally. You can access it if needed:

```typescript
Effect.cancellable('fetch', async (dispatch) => {
  const controller = new AbortController();

  const response = await fetch('/api/data', {
    signal: controller.signal
  });

  const data = await response.json();
  dispatch({ type: 'dataLoaded', data });
});
```

**When to use**:
- Search-as-you-type
- Autocomplete
- Operations that become stale
- Request deduplication

### `Effect.debounced()`

Execute effect after a delay. Resets the timer if called again with the same ID.

```typescript
Effect.debounced<Action>(
  id: string,
  ms: number,
  execute: (dispatch: Dispatch<Action>) => void | Promise<void>
): Effect<Action>
```

**Example: Search with debounce**

```typescript
case 'searchTextChanged':
  return [
    { ...state, searchText: action.text },
    Effect.debounced('search', 300, async (dispatch) => {
      const results = await api.search(action.text);
      dispatch({ type: 'searchResults', results });
    })
  ];
```

**Behavior**:
- User types "h" → timer starts (300ms)
- User types "e" (within 300ms) → **timer resets** (300ms from now)
- User types "l" (within 300ms) → **timer resets** (300ms from now)
- User stops typing → after 300ms, search executes

**Example: Autosave**

```typescript
case 'documentChanged':
  return [
    { ...state, document: action.document, hasUnsavedChanges: true },
    Effect.debounced('autosave', 2000, async (dispatch) => {
      await api.save(action.document);
      dispatch({ type: 'documentSaved' });
    })
  ];
```

**When to use**:
- Search-as-you-type
- Autosave
- Input validation
- Any operation you want to delay until user stops acting

### `Effect.throttled()`

Execute effect at most once per time period. Unlike debounce, this executes immediately then enforces a cooldown.

```typescript
Effect.throttled<Action>(
  id: string,
  ms: number,
  execute: (dispatch: Dispatch<Action>) => void | Promise<void>
): Effect<Action>
```

**Example: Scroll handler**

```typescript
case 'scroll':
  return [
    state,
    Effect.throttled('scroll-handler', 100, async (dispatch) => {
      const scrollY = window.scrollY;
      dispatch({ type: 'scrollPositionUpdated', scrollY });
    })
  ];
```

**Behavior**:
- First call → **executes immediately**
- Subsequent calls within 100ms → **ignored**
- After 100ms → next call executes

**Debounce vs. Throttle**:

```
Debounce: Wait for quiet period
Events:  |--|-|---|-------|
Executes:              ^

Throttle: Regular intervals
Events:  |--|-|---|-------|
Executes: ^    ^      ^
```

**Example: Rate-limiting API calls**

```typescript
case 'refreshData':
  return [
    state,
    Effect.throttled('refresh', 5000, async (dispatch) => {
      const data = await api.fetch();
      dispatch({ type: 'dataRefreshed', data });
    })
  ];
```

**When to use**:
- Scroll handlers
- Resize handlers
- Rate-limiting API calls
- High-frequency events

### `Effect.afterDelay()`

Execute effect after a fixed delay. Not cancellable.

```typescript
Effect.afterDelay<Action>(
  ms: number,
  execute: (dispatch: Dispatch<Action>) => void | Promise<void>
): Effect<Action>
```

**Example: Animation lifecycle**

```typescript
case 'showModal':
  return [
    { ...state, modalVisible: true, modalAnimating: true },
    Effect.afterDelay(300, (dispatch) => {
      dispatch({ type: 'modalAnimationCompleted' });
    })
  ];
```

**Example: Timeout fallback**

```typescript
case 'startOperation':
  return [
    { ...state, operationInProgress: true },
    Effect.batch(
      Effect.run(async (dispatch) => {
        await performOperation();
        dispatch({ type: 'operationCompleted' });
      }),
      Effect.afterDelay(5000, (dispatch) => {
        dispatch({ type: 'operationTimeout' });
      })
    )
  ];
```

**When to use**:
- Animation timing
- Timeout fallbacks
- Scheduled actions
- Delayed notifications

### `Effect.subscription()`

Create a long-running subscription with automatic cleanup. Returns a cleanup function that's called when cancelled.

```typescript
Effect.subscription<Action>(
  id: string,
  setup: (dispatch: Dispatch<Action>) => (() => void | Promise<void>)
): Effect<Action>
```

**Example: WebSocket connection**

```typescript
case 'connect':
  return [
    { ...state, status: 'connecting' },
    Effect.subscription('websocket', (dispatch) => {
      const socket = new WebSocket('wss://example.com');

      socket.onopen = () => {
        dispatch({ type: 'connected' });
      };

      socket.onmessage = (event) => {
        dispatch({ type: 'messageReceived', data: event.data });
      };

      socket.onerror = (error) => {
        dispatch({ type: 'error', error });
      };

      socket.onclose = () => {
        dispatch({ type: 'disconnected' });
      };

      // Return cleanup function
      return () => {
        socket.close();
      };
    })
  ];
```

**Example: Event listener**

```typescript
case 'enableKeyboardShortcuts':
  return [
    { ...state, keyboardEnabled: true },
    Effect.subscription('keyboard', (dispatch) => {
      const handler = (event: KeyboardEvent) => {
        if (event.metaKey && event.key === 's') {
          event.preventDefault();
          dispatch({ type: 'saveShortcut' });
        }
      };

      window.addEventListener('keydown', handler);

      return () => {
        window.removeEventListener('keydown', handler);
      };
    })
  ];
```

**Example: Interval timer**

```typescript
case 'startTimer':
  return [
    { ...state, timerActive: true },
    Effect.subscription('timer', (dispatch) => {
      const interval = setInterval(() => {
        dispatch({ type: 'tick' });
      }, 1000);

      return () => {
        clearInterval(interval);
      };
    })
  ];
```

**Cancelling subscriptions**:

```typescript
case 'disconnect':
  return [
    { ...state, status: 'disconnected' },
    Effect.cancel('websocket') // Calls cleanup function
  ];
```

**When to use**:
- WebSocket connections
- Server-Sent Events (SSE)
- Event listeners
- Intervals/timers
- Any resource that needs cleanup

### `Effect.cancel()`

Cancel all in-flight effects with the given ID. Works with cancellable effects, subscriptions, debounced effects, and throttled effects.

```typescript
Effect.cancel<Action>(id: string): Effect<Action>
```

**Example: Cancel search**

```typescript
case 'clearSearch':
  return [
    { ...state, searchText: '', searchResults: [] },
    Effect.cancel('search')
  ];
```

**Example: Cancel multiple effects**

```typescript
case 'reset':
  return [
    initialState,
    Effect.batch(
      Effect.cancel('websocket'),
      Effect.cancel('autosave'),
      Effect.cancel('search')
    )
  ];
```

**What gets cancelled**:
- `Effect.cancellable()` → Aborts execution
- `Effect.subscription()` → Calls cleanup function
- `Effect.debounced()` → Clears pending timer
- `Effect.throttled()` → Clears throttle state

**When to use**:
- User navigates away
- Feature is disabled
- Cleanup on reset
- Manual cancellation

### `Effect.animated()`

Convenience wrapper for animation lifecycle. Dispatches an action after a delay.

```typescript
Effect.animated<Action>(config: {
  duration: number;
  onComplete: Action;
}): Effect<Action>
```

**Example: Modal presentation**

```typescript
case 'showModal':
  return [
    {
      ...state,
      modal: { status: 'presenting', content: action.content }
    },
    Effect.animated({
      duration: 300,
      onComplete: { type: 'modalPresented' }
    })
  ];
```

**Example: With timeout fallback**

```typescript
case 'showModal':
  return [
    {
      ...state,
      modal: { status: 'presenting', content: action.content }
    },
    Effect.batch(
      Effect.animated({
        duration: 300,
        onComplete: { type: 'modalPresented' }
      }),
      Effect.animated({
        duration: 600, // 2x duration
        onComplete: { type: 'modalPresentationTimeout' }
      })
    )
  ];
```

**When to use**:
- Fixed-duration animations
- CSS transitions
- Svelte transitions
- Animation state management

**Note**: This is syntactic sugar for `Effect.afterDelay()`.

### `Effect.transition()`

Create both present and dismiss effects for complete animation lifecycle.

```typescript
Effect.transition<Action>(config: {
  presentDuration?: number;
  dismissDuration?: number;
  createPresentationEvent: (event: {
    type: 'presentationCompleted' | 'dismissalCompleted'
  }) => Action;
}): {
  present: Effect<Action>;
  dismiss: Effect<Action>;
}
```

**Example: Modal lifecycle**

```typescript
const modalTransition = Effect.transition({
  presentDuration: 300,
  dismissDuration: 200,
  createPresentationEvent: (event) => ({
    type: 'presentation',
    event
  })
});

// In reducer
case 'showModal':
  return [
    {
      ...state,
      modal: { status: 'presenting', content: action.content }
    },
    modalTransition.present
  ];

case 'hideModal':
  return [
    {
      ...state,
      modal: { status: 'dismissing', content: state.modal.content }
    },
    modalTransition.dismiss
  ];
```

**When to use**:
- Symmetric animations (present/dismiss)
- DRY animation configuration
- Consistent timing across features

### `Effect.map()`

Transform effect actions for composition. This is how child effects are lifted to parent actions.

```typescript
Effect.map<A, B>(
  effect: Effect<A>,
  transform: (action: A) => B
): Effect<B>
```

**Example: Child to parent action**

```typescript
const childEffect: Effect<ChildAction> = Effect.run(async (dispatch) => {
  const data = await api.fetch();
  dispatch({ type: 'childDataLoaded', data });
});

const parentEffect: Effect<ParentAction> = Effect.map(
  childEffect,
  (childAction) => ({ type: 'child', action: childAction })
);
```

**Used in reducer composition**:

```typescript
const parentReducer = (state, action, deps) => {
  // ... handle parent actions

  // Compose child reducer
  if (action.type === 'child') {
    const [childState, childEffect] = childReducer(
      state.child,
      action.action,
      deps
    );

    return [
      { ...state, child: childState },
      Effect.map(childEffect, (ca) => ({ type: 'child', action: ca }))
    ];
  }
};
```

**When to use**:
- Reducer composition
- Lifting child effects to parent
- Action transformation

**Note**: Usually handled by composition helpers like `scope()`.

## Effect Execution

### Execution Order

Effects execute **after** the reducer completes and state updates:

```typescript
store.dispatch({ type: 'loadData' });
// 1. Reducer runs → returns [newState, effect]
// 2. Store updates state
// 3. UI re-renders
// 4. Effect executes (async)
// 5. Effect dispatches actions → cycle repeats
```

### Synchronous State Updates

State updates are synchronous. Effects are async:

```typescript
console.log('Before:', store.state.count); // 0

store.dispatch({ type: 'increment' });

console.log('After:', store.state.count); // 1 (immediate!)

// But effects run async
store.dispatch({ type: 'loadData' });
console.log(store.state.data); // undefined (effect hasn't run yet)
```

### Error Handling

The Store catches and logs effect errors. Effects never crash the app:

```typescript
Effect.run(async (dispatch) => {
  throw new Error('Oops!'); // Logged to console, doesn't crash
});
```

**Best practice**: Handle errors in effects explicitly:

```typescript
Effect.run(async (dispatch) => {
  try {
    const data = await api.fetch();
    dispatch({ type: 'success', data });
  } catch (error) {
    dispatch({ type: 'error', error: error.message });
  }
});
```

### Effect Lifecycle Hooks

The Store provides hooks for effect execution:

```typescript
const store = createStore({
  initialState,
  reducer,
  // Future: middleware for effect interception
});
```

## Common Patterns

### Loading States

Track loading state explicitly:

```typescript
type LoadingState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: Data }
  | { status: 'error'; error: string };

interface State {
  data: LoadingState;
}

case 'loadData':
  return [
    { ...state, data: { status: 'loading' } },
    Effect.run(async (dispatch) => {
      try {
        const data = await api.fetch();
        dispatch({ type: 'dataLoaded', data });
      } catch (error) {
        dispatch({ type: 'loadFailed', error: error.message });
      }
    })
  ];

case 'dataLoaded':
  return [
    { ...state, data: { status: 'success', data: action.data } },
    Effect.none()
  ];

case 'loadFailed':
  return [
    { ...state, data: { status: 'error', error: action.error } },
    Effect.none()
  ];
```

### Retry Logic

Implement exponential backoff:

```typescript
case 'loadDataWithRetry':
  return [
    { ...state, retries: 0 },
    retryEffect(0)
  ];

function retryEffect(attempt: number): Effect<Action> {
  return Effect.run(async (dispatch) => {
    try {
      const data = await api.fetch();
      dispatch({ type: 'dataLoaded', data });
    } catch (error) {
      if (attempt < 3) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt) * 1000;

        dispatch({ type: 'retrying', attempt: attempt + 1 });

        await new Promise(resolve => setTimeout(resolve, delay));

        // Recursive retry
        dispatch({ type: 'loadDataWithRetry' });
      } else {
        dispatch({ type: 'loadFailed', error: error.message });
      }
    }
  });
}
```

### Sequential Operations

Chain effects with multiple dispatches:

```typescript
case 'saveAndNavigate':
  return [
    { ...state, isSaving: true },
    Effect.run(async (dispatch) => {
      // Step 1: Save data
      await api.save(state.data);
      dispatch({ type: 'saved' });

      // Step 2: Wait for animation
      await new Promise(r => setTimeout(r, 300));

      // Step 3: Navigate
      dispatch({ type: 'navigateToList' });
    })
  ];
```

### Race Conditions

Use the latest result with cancellable effects:

```typescript
let requestId = 0;

case 'search':
  const currentId = ++requestId;

  return [
    { ...state, searchQuery: action.query },
    Effect.cancellable('search', async (dispatch) => {
      const results = await api.search(action.query);

      // Only dispatch if this is still the latest request
      if (currentId === requestId) {
        dispatch({ type: 'searchResults', results });
      }
    })
  ];
```

### Polling

Implement polling with subscriptions:

```typescript
case 'startPolling':
  return [
    { ...state, polling: true },
    Effect.subscription('poll', (dispatch) => {
      // Initial fetch
      dispatch({ type: 'fetchData' });

      // Poll every 5 seconds
      const interval = setInterval(() => {
        dispatch({ type: 'fetchData' });
      }, 5000);

      return () => {
        clearInterval(interval);
      };
    })
  ];

case 'stopPolling':
  return [
    { ...state, polling: false },
    Effect.cancel('poll')
  ];
```

### Coordinated Effects

Execute effects in sequence with dependencies:

```typescript
case 'initialize':
  return [
    { ...state, status: 'initializing' },
    Effect.run(async (dispatch) => {
      // Step 1: Load config
      dispatch({ type: 'loadConfig' });
      await waitForState(store, s => s.config !== null);

      // Step 2: Connect to API
      dispatch({ type: 'connect' });
      await waitForState(store, s => s.connected);

      // Step 3: Load initial data
      dispatch({ type: 'loadData' });
    })
  ];
```

### Optimistic Updates

Update UI immediately, rollback on error:

```typescript
case 'saveTodo':
  const optimisticTodo = { ...action.todo, _syncing: true };

  return [
    {
      ...state,
      todos: state.todos.map(t =>
        t.id === action.todo.id ? optimisticTodo : t
      )
    },
    Effect.run(async (dispatch) => {
      try {
        await api.save(action.todo);
        dispatch({ type: 'todoSaved', id: action.todo.id });
      } catch (error) {
        dispatch({ type: 'todoSaveFailed', id: action.todo.id, error });
      }
    })
  ];

case 'todoSaved':
  return [
    {
      ...state,
      todos: state.todos.map(t =>
        t.id === action.id ? { ...t, _syncing: false } : t
      )
    },
    Effect.none()
  ];

case 'todoSaveFailed':
  return [
    {
      ...state,
      todos: state.todos.map(t =>
        t.id === action.id ? { ...t, _syncing: false, _error: action.error } : t
      )
    },
    Effect.none()
  ];
```

## Advanced Techniques

### Custom Effect Types

Create domain-specific effects:

```typescript
// Higher-level abstraction
const ApiEffect = {
  fetch<T, A>(
    endpoint: string,
    onSuccess: (data: T) => A,
    onError: (error: string) => A
  ): Effect<A> {
    return Effect.run(async (dispatch) => {
      try {
        const response = await fetch(endpoint);
        const data = await response.json();
        dispatch(onSuccess(data));
      } catch (error) {
        dispatch(onError(error.message));
      }
    });
  },

  post<T, A>(
    endpoint: string,
    body: any,
    onSuccess: (data: T) => A,
    onError: (error: string) => A
  ): Effect<A> {
    return Effect.run(async (dispatch) => {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await response.json();
        dispatch(onSuccess(data));
      } catch (error) {
        dispatch(onError(error.message));
      }
    });
  }
};

// Usage
case 'loadTodos':
  return [
    { ...state, loading: true },
    ApiEffect.fetch(
      '/api/todos',
      (todos) => ({ type: 'todosLoaded', todos }),
      (error) => ({ type: 'loadFailed', error })
    )
  ];
```

### Effect Composition

Combine effects into reusable patterns:

```typescript
// Load multiple resources in parallel
function loadAll<A>(
  resources: Array<{
    fetch: () => Promise<any>;
    onSuccess: (data: any) => A;
    onError: (error: string) => A;
  }>
): Effect<A> {
  return Effect.batch(
    ...resources.map(resource =>
      Effect.run(async (dispatch) => {
        try {
          const data = await resource.fetch();
          dispatch(resource.onSuccess(data));
        } catch (error) {
          dispatch(resource.onError(error.message));
        }
      })
    )
  );
}

// Usage
case 'loadDashboard':
  return [
    { ...state, loading: true },
    loadAll([
      {
        fetch: () => api.fetchUser(),
        onSuccess: (user) => ({ type: 'userLoaded', user }),
        onError: (error) => ({ type: 'userLoadFailed', error })
      },
      {
        fetch: () => api.fetchStats(),
        onSuccess: (stats) => ({ type: 'statsLoaded', stats }),
        onError: (error) => ({ type: 'statsLoadFailed', error })
      }
    ])
  ];
```

### Effect Middleware

Transform effects before execution (future feature):

```typescript
// Future: Effect middleware
const loggingMiddleware = (effect: Effect<any>) => {
  console.log('Executing effect:', effect._tag);
  return effect;
};

const analyticsMiddleware = (effect: Effect<any>) => {
  if (effect._tag === 'Run') {
    analytics.track('effect_executed');
  }
  return effect;
};
```

### Conditional Effect Execution

Only execute effects based on state conditions:

```typescript
case 'incrementIfEven':
  if (state.count % 2 !== 0) {
    return [state, Effect.none()]; // Skip
  }

  return [
    { ...state, count: state.count + 1 },
    Effect.fireAndForget(() => {
      console.log('Incremented to:', state.count + 1);
    })
  ];
```

### Effect Pipelines

Chain effects with explicit sequencing:

```typescript
function pipeline<A>(
  effects: Array<(dispatch: Dispatch<A>) => Promise<void>>
): Effect<A> {
  return Effect.run(async (dispatch) => {
    for (const effect of effects) {
      await effect(dispatch);
    }
  });
}

// Usage
case 'onboarding':
  return [
    state,
    pipeline([
      async (dispatch) => {
        await showWelcome();
        dispatch({ type: 'welcomeShown' });
      },
      async (dispatch) => {
        await collectUserInfo();
        dispatch({ type: 'userInfoCollected' });
      },
      async (dispatch) => {
        await setupAccount();
        dispatch({ type: 'accountSetup' });
      }
    ])
  ];
```

## Testing Effects

### Testing Effect Creation

Test that reducers return the correct effects:

```typescript
import { describe, it, expect } from 'vitest';
import { Effect } from '@composable-svelte/core';

describe('User reducer', () => {
  it('returns loading effect on loadUser action', () => {
    const state = { user: null, loading: false };
    const action = { type: 'loadUser', id: '123' };

    const [newState, effect] = userReducer(state, action, deps);

    expect(newState.loading).toBe(true);
    expect(effect._tag).toBe('Run');
  });

  it('returns batch effect for saveAndNotify', () => {
    const state = { data: 'test' };
    const action = { type: 'saveAndNotify' };

    const [newState, effect] = reducer(state, action, deps);

    expect(effect._tag).toBe('Batch');
    expect(effect.effects).toHaveLength(2);
    expect(effect.effects[0]._tag).toBe('Run');
    expect(effect.effects[1]._tag).toBe('FireAndForget');
  });
});
```

### Testing Effect Execution

Use `TestStore` to test complete effect execution:

```typescript
import { createTestStore } from '@composable-svelte/core/testing';

describe('User loading', () => {
  it('loads user successfully', async () => {
    const mockApi = {
      fetchUser: vi.fn().mockResolvedValue({ id: '123', name: 'Alice' })
    };

    const store = createTestStore({
      initialState: { user: null, loading: false },
      reducer: userReducer,
      dependencies: { api: mockApi }
    });

    await store.send({ type: 'loadUser', id: '123' }, (state) => {
      expect(state.loading).toBe(true);
    });

    await store.receive({ type: 'userLoaded' }, (state) => {
      expect(state.user).toEqual({ id: '123', name: 'Alice' });
      expect(state.loading).toBe(false);
    });
  });

  it('handles load failure', async () => {
    const mockApi = {
      fetchUser: vi.fn().mockRejectedValue(new Error('Network error'))
    };

    const store = createTestStore({
      initialState: { user: null, loading: false, error: null },
      reducer: userReducer,
      dependencies: { api: mockApi }
    });

    await store.send({ type: 'loadUser', id: '123' });

    await store.receive({ type: 'loadFailed' }, (state) => {
      expect(state.error).toBe('Network error');
      expect(state.loading).toBe(false);
    });
  });
});
```

### Testing Cancellation

Test that effects are properly cancelled:

```typescript
describe('Search cancellation', () => {
  it('cancels previous search when new search starts', async () => {
    let searchesCompleted = 0;

    const mockApi = {
      search: vi.fn().mockImplementation(async (query) => {
        await new Promise(r => setTimeout(r, 100));
        searchesCompleted++;
        return [`result for ${query}`];
      })
    };

    const store = createTestStore({
      initialState: { query: '', results: [] },
      reducer: searchReducer,
      dependencies: { api: mockApi }
    });

    store.dispatch({ type: 'search', query: 'a' });
    store.dispatch({ type: 'search', query: 'ab' });
    store.dispatch({ type: 'search', query: 'abc' });

    await new Promise(r => setTimeout(r, 200));

    // Only the last search should complete
    expect(searchesCompleted).toBe(1);
    expect(store.state.query).toBe('abc');
  });
});
```

### Testing Debounce

Test debounced effects:

```typescript
describe('Debounced search', () => {
  it('debounces rapid searches', async () => {
    const mockApi = {
      search: vi.fn().mockResolvedValue(['result'])
    };

    const store = createTestStore({
      initialState: { query: '', results: [] },
      reducer: searchReducer,
      dependencies: { api: mockApi }
    });

    store.dispatch({ type: 'searchChanged', text: 'h' });
    store.dispatch({ type: 'searchChanged', text: 'he' });
    store.dispatch({ type: 'searchChanged', text: 'hel' });

    // No API calls yet
    expect(mockApi.search).not.toHaveBeenCalled();

    // Wait for debounce
    await new Promise(r => setTimeout(r, 400));

    // Only one API call for final query
    expect(mockApi.search).toHaveBeenCalledTimes(1);
    expect(mockApi.search).toHaveBeenCalledWith('hel');
  });
});
```

## Best Practices

### 1. Always Return an Effect

Every reducer must return an effect, even if it's `Effect.none()`:

```typescript
// ✅ GOOD
case 'reset':
  return [initialState, Effect.none()];

// ❌ BAD (TypeScript error)
case 'reset':
  return [initialState]; // Missing effect!
```

### 2. Handle All Async Outcomes

Always handle success and failure:

```typescript
// ✅ GOOD
Effect.run(async (dispatch) => {
  try {
    const data = await api.fetch();
    dispatch({ type: 'success', data });
  } catch (error) {
    dispatch({ type: 'error', error: error.message });
  }
});

// ❌ BAD (no error handling)
Effect.run(async (dispatch) => {
  const data = await api.fetch(); // What if this fails?
  dispatch({ type: 'success', data });
});
```

### 3. Use Specific Effect Types

Choose the right effect type for the job:

```typescript
// ✅ GOOD
Effect.fireAndForget(() => {
  analytics.track('event'); // No dispatch needed
});

// ❌ BAD (unnecessary complexity)
Effect.run(async (dispatch) => {
  analytics.track('event'); // Dispatch not used!
});
```

### 4. Cancel Long-Running Effects

Always cancel subscriptions when they're no longer needed:

```typescript
case 'enable':
  return [
    state,
    Effect.subscription('my-feature', (dispatch) => {
      // Setup
      return () => {
        // Cleanup
      };
    })
  ];

case 'disable':
  return [
    state,
    Effect.cancel('my-feature') // Don't forget!
  ];
```

### 5. Use IDs Consistently

Use consistent IDs for cancellable effects:

```typescript
// ✅ GOOD (consistent ID)
const SEARCH_ID = 'search-query';

case 'search':
  return [
    state,
    Effect.cancellable(SEARCH_ID, ...)
  ];

case 'clearSearch':
  return [
    state,
    Effect.cancel(SEARCH_ID)
  ];
```

### 6. Batch Independent Effects

Combine effects that don't depend on each other:

```typescript
// ✅ GOOD (parallel)
Effect.batch(
  Effect.run(...),
  Effect.run(...),
  Effect.fireAndForget(...)
);

// ❌ BAD (sequential when not needed)
Effect.run(async (dispatch) => {
  await doThing1();
  await doThing2(); // Could be parallel!
});
```

### 7. Keep Effect Logic Simple

Complex logic belongs in the reducer, not the effect:

```typescript
// ✅ GOOD
case 'loadData':
  const shouldRefresh = state.lastUpdate < Date.now() - 60000;

  if (!shouldRefresh) {
    return [state, Effect.none()];
  }

  return [state, Effect.run(...)];

// ❌ BAD (logic in effect)
case 'loadData':
  return [
    state,
    Effect.run(async (dispatch) => {
      if (state.lastUpdate < Date.now() - 60000) {
        // Logic should be in reducer!
        const data = await api.fetch();
        dispatch({ type: 'loaded', data });
      }
    })
  ];
```

## Common Pitfalls

### Pitfall 1: Not Dispatching in Effects

```typescript
// ❌ WRONG: Effect never dispatches
Effect.run(async (dispatch) => {
  const data = await api.fetch();
  // Forgot to dispatch! State never updates.
});

// ✅ CORRECT
Effect.run(async (dispatch) => {
  const data = await api.fetch();
  dispatch({ type: 'dataLoaded', data });
});
```

### Pitfall 2: Async Reducer

```typescript
// ❌ WRONG: Reducers can't be async
const reducer = async (state, action, deps) => {
  const data = await fetch('/api'); // This won't work!
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

### Pitfall 3: Forgetting Cleanup

```typescript
// ❌ WRONG: No cleanup
Effect.subscription('websocket', (dispatch) => {
  const socket = new WebSocket('wss://...');
  // Forgot to return cleanup!
});

// ✅ CORRECT
Effect.subscription('websocket', (dispatch) => {
  const socket = new WebSocket('wss://...');
  return () => socket.close();
});
```

### Pitfall 4: Dispatching in Reducer

```typescript
// ❌ WRONG: Side effect in reducer
const reducer = (state, action, deps) => {
  store.dispatch({ type: 'otherAction' }); // NO!
  return [state, Effect.none()];
};

// ✅ CORRECT: Dispatch in effect
const reducer = (state, action, deps) => {
  return [
    state,
    Effect.run(async (dispatch) => {
      dispatch({ type: 'otherAction' });
    })
  ];
};
```

### Pitfall 5: Race Conditions

```typescript
// ❌ WRONG: Race condition
case 'search':
  return [
    state,
    Effect.run(async (dispatch) => {
      const results = await api.search(action.query);
      // What if user searched again? These results are stale!
      dispatch({ type: 'results', results });
    })
  ];

// ✅ CORRECT: Use cancellable
case 'search':
  return [
    state,
    Effect.cancellable('search', async (dispatch) => {
      const results = await api.search(action.query);
      dispatch({ type: 'results', results });
    })
  ];
```

### Pitfall 6: Forgetting Error Handling

```typescript
// ❌ WRONG: Unhandled errors
Effect.run(async (dispatch) => {
  const data = await api.fetch(); // Can throw!
  dispatch({ type: 'loaded', data });
});

// ✅ CORRECT: Handle errors
Effect.run(async (dispatch) => {
  try {
    const data = await api.fetch();
    dispatch({ type: 'loaded', data });
  } catch (error) {
    dispatch({ type: 'loadFailed', error: error.message });
  }
});
```

### Pitfall 7: Nested Batches

```typescript
// ⚠️ INEFFICIENT: Nested batches
Effect.batch(
  Effect.batch(effect1, effect2),
  Effect.batch(effect3, effect4)
);

// ✅ BETTER: Flat batch
Effect.batch(effect1, effect2, effect3, effect4);
```

## Next Steps

- **[Composition](./composition.md)** - Composing reducers with `scope()` and `ifLet()`
- **[Testing](./testing.md)** - Testing patterns with TestStore
- **[Navigation](../navigation/tree-based.md)** - State-driven navigation with effects

## Related Documentation

- [Store and Reducers](./store-and-reducers.md) - Core state management
- [Getting Started](../getting-started.md) - Basic setup
- [API Reference](../api/reference.md) - Complete API documentation
