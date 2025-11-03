# Testing

Comprehensive guide to testing reducers, effects, and composed features with TestStore.

## Table of Contents

1. [Overview](#overview)
2. [TestStore Fundamentals](#teststore-fundamentals)
3. [Testing Synchronous Actions](#testing-synchronous-actions)
4. [Testing Asynchronous Effects](#testing-asynchronous-effects)
5. [Testing Time-Based Effects](#testing-time-based-effects)
6. [Testing Composed Reducers](#testing-composed-reducers)
7. [Testing Navigation](#testing-navigation)
8. [Mock Dependencies](#mock-dependencies)
9. [Exhaustive Testing Patterns](#exhaustive-testing-patterns)
10. [Common Patterns](#common-patterns)
11. [Common Pitfalls](#common-pitfalls)

## Overview

Composable Svelte's testing philosophy centers on **exhaustive testing**: asserting every action that flows through your reducer, both user-initiated and effect-dispatched. This approach catches subtle bugs and ensures your reducers behave correctly in all scenarios.

### Key Principles

1. **Exhaustiveness**: Assert all actions, not just the final state
2. **Isolation**: Test reducers independently with mock dependencies
3. **Determinism**: Tests should be fast, reliable, and repeatable
4. **Clarity**: Tests document the intended behavior of your features

### The send/receive Pattern

```typescript
// User sends action
await store.send({ type: 'loadData' }, (state) => {
  expect(state.isLoading).toBe(true);
});

// Test receives effect-dispatched action
await store.receive({ type: 'dataLoaded' }, (state) => {
  expect(state.isLoading).toBe(false);
  expect(state.data).toEqual(expectedData);
});
```

This pattern ensures you test **the entire action flow**, not just endpoints.

## TestStore Fundamentals

### Creating a TestStore

```typescript
import { createTestStore } from '@composable-svelte/core';

const store = createTestStore({
  initialState: {
    count: 0,
    isLoading: false
  },
  reducer: counterReducer,
  dependencies: {
    api: mockAPI,
    clock: mockClock
  }
});
```

### Core API

#### `send(action, assert?)`

Dispatches a user action and optionally asserts the resulting state.

```typescript
// Without assertion
await store.send({ type: 'increment' });

// With state assertion
await store.send({ type: 'increment' }, (state) => {
  expect(state.count).toBe(1);
});
```

**When to use**:
- Simulating user interactions
- Testing immediate state changes
- Triggering effects

#### `receive(partialAction, assert?, timeout?)`

Waits for an effect to dispatch a matching action.

```typescript
await store.receive({ type: 'dataLoaded' }, (state) => {
  expect(state.data).toEqual(expectedData);
});

// With custom timeout (default: 1000ms)
await store.receive({ type: 'slowOperation' }, undefined, 5000);
```

**When to use**:
- Asserting effect-dispatched actions
- Testing async operation results
- Verifying effect sequences

#### `assertNoPendingActions()`

Verifies all received actions have been asserted (when `exhaustivity: 'on'`).

```typescript
await store.send({ type: 'loadData' });
await store.receive({ type: 'dataLoaded' });

store.assertNoPendingActions(); // ✅ Passes
```

#### `finish()`

Convenience method that flushes pending effects and asserts no actions remain.

```typescript
await store.send({ type: 'saveData' });
await store.receive({ type: 'dataSaved' });
await store.finish(); // Equivalent to: await advanceTime(0); assertNoPendingActions();
```

#### `getState()`

Returns the current state (useful for direct inspection).

```typescript
await store.send({ type: 'increment' });
expect(store.getState().count).toBe(1);
```

#### `getHistory()`

Returns all dispatched actions (user-sent and effect-dispatched).

```typescript
await store.send({ type: 'increment' });
await store.receive({ type: 'animationCompleted' });

const history = store.getHistory();
expect(history).toEqual([
  { type: 'increment' },
  { type: 'animationCompleted' }
]);
```

## Testing Synchronous Actions

Test actions that immediately update state without effects.

### Basic State Updates

```typescript
import { describe, it, expect } from 'vitest';
import { createTestStore } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';

interface CounterState {
  count: number;
}

type CounterAction =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'add'; amount: number };

const counterReducer = (state, action, deps) => {
  switch (action.type) {
    case 'increment':
      return [{ ...state, count: state.count + 1 }, Effect.none()];
    case 'decrement':
      return [{ ...state, count: state.count - 1 }, Effect.none()];
    case 'add':
      return [{ ...state, count: state.count + action.amount }, Effect.none()];
    default:
      return [state, Effect.none()];
  }
};

describe('Counter Reducer', () => {
  it('increments count', async () => {
    const store = createTestStore({
      initialState: { count: 0 },
      reducer: counterReducer
    });

    await store.send({ type: 'increment' }, (state) => {
      expect(state.count).toBe(1);
    });

    await store.send({ type: 'increment' }, (state) => {
      expect(state.count).toBe(2);
    });

    store.assertNoPendingActions();
  });

  it('decrements count', async () => {
    const store = createTestStore({
      initialState: { count: 5 },
      reducer: counterReducer
    });

    await store.send({ type: 'decrement' }, (state) => {
      expect(state.count).toBe(4);
    });
  });

  it('adds amount to count', async () => {
    const store = createTestStore({
      initialState: { count: 0 },
      reducer: counterReducer
    });

    await store.send({ type: 'add', amount: 10 }, (state) => {
      expect(state.count).toBe(10);
    });

    await store.send({ type: 'add', amount: 5 }, (state) => {
      expect(state.count).toBe(15);
    });
  });
});
```

### Testing State Guards

Verify that invalid state transitions are prevented.

```typescript
interface FormState {
  value: string;
  isSubmitting: boolean;
}

type FormAction =
  | { type: 'updateValue'; value: string }
  | { type: 'submit' }
  | { type: 'submitSuccess' };

const formReducer = (state, action, deps) => {
  switch (action.type) {
    case 'updateValue':
      // Guard: Don't allow updates while submitting
      if (state.isSubmitting) {
        return [state, Effect.none()];
      }
      return [{ ...state, value: action.value }, Effect.none()];

    case 'submit':
      // Guard: Don't submit if already submitting
      if (state.isSubmitting) {
        return [state, Effect.none()];
      }
      return [
        { ...state, isSubmitting: true },
        Effect.run(async (dispatch) => {
          await deps.api.submit(state.value);
          dispatch({ type: 'submitSuccess' });
        })
      ];

    case 'submitSuccess':
      return [{ ...state, isSubmitting: false }, Effect.none()];

    default:
      return [state, Effect.none()];
  }
};

describe('Form Guards', () => {
  it('prevents updates while submitting', async () => {
    const store = createTestStore({
      initialState: { value: 'initial', isSubmitting: false },
      reducer: formReducer,
      dependencies: {
        api: { submit: async () => {} }
      }
    });

    await store.send({ type: 'submit' }, (state) => {
      expect(state.isSubmitting).toBe(true);
    });

    // Try to update while submitting (should be ignored)
    await store.send({ type: 'updateValue', value: 'changed' }, (state) => {
      expect(state.value).toBe('initial'); // Unchanged!
      expect(state.isSubmitting).toBe(true);
    });
  });

  it('prevents duplicate submissions', async () => {
    const submitMock = vi.fn();
    const store = createTestStore({
      initialState: { value: 'test', isSubmitting: false },
      reducer: formReducer,
      dependencies: {
        api: { submit: submitMock }
      }
    });

    await store.send({ type: 'submit' });
    await store.send({ type: 'submit' }); // Second submit (should be ignored)

    await store.receive({ type: 'submitSuccess' });

    // API should only be called once
    expect(submitMock).toHaveBeenCalledTimes(1);
  });
});
```

## Testing Asynchronous Effects

Test actions that trigger effects which dispatch additional actions.

### Basic Async Flow

```typescript
interface UserState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
}

type UserAction =
  | { type: 'loadUser'; id: string }
  | { type: 'userLoaded'; user: User }
  | { type: 'userLoadFailed'; error: string };

const userReducer = (state, action, deps) => {
  switch (action.type) {
    case 'loadUser':
      return [
        { ...state, isLoading: true, error: null },
        Effect.run(async (dispatch) => {
          const result = await deps.api.getUser(action.id);
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
        { ...state, error: action.error, isLoading: false },
        Effect.none()
      ];

    default:
      return [state, Effect.none()];
  }
};

describe('User Reducer', () => {
  it('loads user successfully', async () => {
    const mockUser = { id: '123', name: 'Alice' };
    const store = createTestStore({
      initialState: { user: null, isLoading: false, error: null },
      reducer: userReducer,
      dependencies: {
        api: {
          getUser: async (id) => ({ ok: true, data: mockUser })
        }
      }
    });

    // User initiates load
    await store.send({ type: 'loadUser', id: '123' }, (state) => {
      expect(state.isLoading).toBe(true);
      expect(state.error).toBe(null);
    });

    // Effect dispatches success action
    await store.receive({ type: 'userLoaded' }, (state) => {
      expect(state.user).toEqual(mockUser);
      expect(state.isLoading).toBe(false);
    });

    await store.finish();
  });

  it('handles load failure', async () => {
    const store = createTestStore({
      initialState: { user: null, isLoading: false, error: null },
      reducer: userReducer,
      dependencies: {
        api: {
          getUser: async (id) => ({ ok: false, error: 'Network error' })
        }
      }
    });

    await store.send({ type: 'loadUser', id: '123' });

    await store.receive({ type: 'userLoadFailed' }, (state) => {
      expect(state.error).toBe('Network error');
      expect(state.isLoading).toBe(false);
      expect(state.user).toBe(null);
    });
  });
});
```

### Testing Effect Chains

Test effects that dispatch actions which trigger more effects.

```typescript
interface DataState {
  data: Data | null;
  isLoading: boolean;
  isSaving: boolean;
}

type DataAction =
  | { type: 'loadAndSave' }
  | { type: 'dataLoaded'; data: Data }
  | { type: 'savingStarted' }
  | { type: 'saveComplete' };

const dataReducer = (state, action, deps) => {
  switch (action.type) {
    case 'loadAndSave':
      return [
        { ...state, isLoading: true },
        Effect.run(async (dispatch) => {
          const data = await deps.api.load();
          dispatch({ type: 'dataLoaded', data });
        })
      ];

    case 'dataLoaded':
      return [
        { ...state, data: action.data, isLoading: false },
        Effect.run(async (dispatch) => {
          dispatch({ type: 'savingStarted' });
        })
      ];

    case 'savingStarted':
      return [
        { ...state, isSaving: true },
        Effect.run(async (dispatch) => {
          await deps.api.save(state.data);
          dispatch({ type: 'saveComplete' });
        })
      ];

    case 'saveComplete':
      return [
        { ...state, isSaving: false },
        Effect.none()
      ];

    default:
      return [state, Effect.none()];
  }
};

describe('Effect Chains', () => {
  it('handles chained effects', async () => {
    const mockData = { id: '1', value: 'test' };
    const store = createTestStore({
      initialState: { data: null, isLoading: false, isSaving: false },
      reducer: dataReducer,
      dependencies: {
        api: {
          load: async () => mockData,
          save: async (data) => {}
        }
      }
    });

    // User initiates load
    await store.send({ type: 'loadAndSave' }, (state) => {
      expect(state.isLoading).toBe(true);
    });

    // First effect completes
    await store.receive({ type: 'dataLoaded' }, (state) => {
      expect(state.data).toEqual(mockData);
      expect(state.isLoading).toBe(false);
    });

    // Second effect starts (triggered by dataLoaded)
    await store.receive({ type: 'savingStarted' }, (state) => {
      expect(state.isSaving).toBe(true);
    });

    // Save completes
    await store.receive({ type: 'saveComplete' }, (state) => {
      expect(state.isSaving).toBe(false);
    });

    await store.finish();
  });
});
```

## Testing Time-Based Effects

Test effects that use delays, debouncing, or throttling with fake timers.

### Setup Requirements

```typescript
import { beforeEach, afterEach, vi } from 'vitest';

describe('Time-based effects', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Tests go here
});
```

### Testing Delays

```typescript
interface TooltipState {
  content: string | null;
  isWaitingToShow: boolean;
  presentation: { status: 'idle' | 'presenting' | 'presented' | 'dismissing'; content: string | null };
}

type TooltipAction =
  | { type: 'hoverStarted'; content: string }
  | { type: 'hoverEnded' }
  | { type: 'delayCompleted' }
  | { type: 'presentation'; event: { type: 'presentationCompleted' } };

const tooltipReducer = (state, action, deps) => {
  switch (action.type) {
    case 'hoverStarted':
      return [
        { ...state, content: action.content, isWaitingToShow: true },
        Effect.afterDelay(deps.hoverDelay, (dispatch) => {
          dispatch({ type: 'delayCompleted' });
        })
      ];

    case 'delayCompleted':
      // Guard: Only show if still waiting
      if (!state.isWaitingToShow) {
        return [state, Effect.none()];
      }

      return [
        {
          ...state,
          isWaitingToShow: false,
          presentation: { status: 'presenting', content: state.content }
        },
        Effect.batch(
          Effect.afterDelay(150, (dispatch) => {
            dispatch({ type: 'presentation', event: { type: 'presentationCompleted' } });
          })
        )
      ];

    case 'presentation':
      if (action.event.type === 'presentationCompleted') {
        return [
          { ...state, presentation: { ...state.presentation, status: 'presented' } },
          Effect.none()
        ];
      }
      return [state, Effect.none()];

    case 'hoverEnded':
      return [
        { ...state, content: null, isWaitingToShow: false, presentation: { status: 'idle', content: null } },
        Effect.none()
      ];

    default:
      return [state, Effect.none()];
  }
};

describe('Tooltip with Hover Delay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows tooltip after delay', async () => {
    const store = createTestStore({
      initialState: {
        content: null,
        isWaitingToShow: false,
        presentation: { status: 'idle', content: null }
      },
      reducer: tooltipReducer,
      dependencies: { hoverDelay: 300 }
    });

    // User hovers
    await store.send({ type: 'hoverStarted', content: 'Save file' }, (state) => {
      expect(state.isWaitingToShow).toBe(true);
      expect(state.presentation.status).toBe('idle');
    });

    // Advance virtual time to trigger delay
    await store.advanceTime(300);

    // Delay effect fires
    await store.receive({ type: 'delayCompleted' }, (state) => {
      expect(state.isWaitingToShow).toBe(false);
      expect(state.presentation.status).toBe('presenting');
    });

    // Advance for animation
    await store.advanceTime(150);

    await store.receive({
      type: 'presentation',
      event: { type: 'presentationCompleted' }
    }, (state) => {
      expect(state.presentation.status).toBe('presented');
    });

    await store.finish();
  });

  it('cancels tooltip if hover ends before delay', async () => {
    const store = createTestStore({
      initialState: {
        content: null,
        isWaitingToShow: false,
        presentation: { status: 'idle', content: null }
      },
      reducer: tooltipReducer,
      dependencies: { hoverDelay: 300 }
    });

    await store.send({ type: 'hoverStarted', content: 'Save file' });

    // Hover ends before delay completes
    await store.advanceTime(100);
    await store.send({ type: 'hoverEnded' }, (state) => {
      expect(state.isWaitingToShow).toBe(false);
      expect(state.content).toBe(null);
    });

    // Advance past original delay time
    await store.advanceTime(300);

    // delayCompleted fires but is ignored by guard
    await store.receive({ type: 'delayCompleted' }, (state) => {
      // State remains unchanged
      expect(state.isWaitingToShow).toBe(false);
      expect(state.presentation.status).toBe('idle');
    });

    await store.finish();
  });
});
```

### Important Notes on Fake Timers

1. **Effects still execute asynchronously**: Even with fake timers, effect callbacks execute asynchronously. Always use `await store.advanceTime()`.

2. **Guards must handle cancelled timers**: When you cancel an effect (via state changes or `Effect.cancel()`), the timer may still fire. Use state guards to ignore stale actions:

   ```typescript
   case 'delayCompleted':
     // Guard: Only process if still waiting
     if (!state.isWaitingToShow) {
       return [state, Effect.none()];
     }
     // ...process action
   ```

3. **Use `advanceTime(0)` to flush effects**: This flushes the microtask queue without advancing timers.

## Testing Composed Reducers

Test parent-child reducer composition with `scope()` and `ifLet()`.

### Testing scope() Composition

```typescript
import { scope } from '@composable-svelte/core';

interface ParentState {
  counter: CounterState;
  other: string;
}

interface CounterState {
  count: number;
}

type ParentAction =
  | { type: 'counter'; action: CounterAction }
  | { type: 'updateOther'; value: string };

type CounterAction =
  | { type: 'increment' }
  | { type: 'decrement' };

const counterReducer = (state, action, deps) => {
  switch (action.type) {
    case 'increment':
      return [{ ...state, count: state.count + 1 }, Effect.none()];
    case 'decrement':
      return [{ ...state, count: state.count - 1 }, Effect.none()];
    default:
      return [state, Effect.none()];
  }
};

const parentReducer = scope(
  (s) => s.counter,
  (s, c) => ({ ...s, counter: c }),
  (a) => (a.type === 'counter' ? a.action : null),
  (ca) => ({ type: 'counter', action: ca }),
  counterReducer
);

describe('Scoped Counter', () => {
  it('routes actions to child reducer', async () => {
    const store = createTestStore({
      initialState: {
        counter: { count: 0 },
        other: 'test'
      },
      reducer: parentReducer
    });

    await store.send(
      { type: 'counter', action: { type: 'increment' } },
      (state) => {
        expect(state.counter.count).toBe(1);
        expect(state.other).toBe('test'); // Parent state unchanged
      }
    );
  });

  it('ignores non-child actions', async () => {
    const store = createTestStore({
      initialState: {
        counter: { count: 5 },
        other: 'test'
      },
      reducer: parentReducer
    });

    await store.send({ type: 'updateOther', value: 'new' }, (state) => {
      // State should be unchanged (same reference)
      expect(state.counter.count).toBe(5);
    });
  });
});
```

## Testing Navigation

Test navigation patterns with `ifLet()` and `PresentationAction`.

### Testing Optional Destinations

```typescript
import { ifLet, type PresentationAction } from '@composable-svelte/core';

interface ParentState {
  destination: ChildState | null;
  items: string[];
}

interface ChildState {
  count: number;
}

type ParentAction =
  | { type: 'showDestination' }
  | { type: 'hideDestination' }
  | { type: 'destination'; action: PresentationAction<ChildAction> };

type ChildAction =
  | { type: 'increment' }
  | { type: 'save' };

const childReducer = (state, action, deps) => {
  switch (action.type) {
    case 'increment':
      return [{ ...state, count: state.count + 1 }, Effect.none()];
    case 'save':
      // Child dismisses itself via deps.dismiss()
      return [state, Effect.run(async (dispatch) => {
        await deps.dismiss();
      })];
    default:
      return [state, Effect.none()];
  }
};

const parentReducer = (state, action, deps) => {
  switch (action.type) {
    case 'showDestination':
      return [
        { ...state, destination: { count: 0 } },
        Effect.none()
      ];

    case 'hideDestination':
      return [
        { ...state, destination: null },
        Effect.none()
      ];

    default:
      break;
  }

  // ifLet handles destination actions
  const [newState, effect] = ifLet(
    (s) => s.destination,
    (s, d) => ({ ...s, destination: d }),
    (a) => a.type === 'destination' && a.action.type === 'presented' ? a.action.action : null,
    (ca) => ({ type: 'destination', action: { type: 'presented', action: ca } }),
    childReducer,
    {
      dismiss: async () => {
        // Dispatch dismiss action
        deps.dispatch({ type: 'destination', action: { type: 'dismiss' } });
      }
    }
  )(state, action, deps);

  // Handle dismiss
  if (action.type === 'destination' && action.action.type === 'dismiss') {
    return [
      { ...newState, destination: null },
      Effect.none()
    ];
  }

  return [newState, effect];
};

describe('Navigation with ifLet', () => {
  it('shows destination', async () => {
    const store = createTestStore({
      initialState: { destination: null, items: [] },
      reducer: parentReducer
    });

    await store.send({ type: 'showDestination' }, (state) => {
      expect(state.destination).toEqual({ count: 0 });
    });
  });

  it('hides destination', async () => {
    const store = createTestStore({
      initialState: { destination: { count: 5 }, items: [] },
      reducer: parentReducer
    });

    await store.send({ type: 'hideDestination' }, (state) => {
      expect(state.destination).toBe(null);
    });
  });

  it('routes actions to destination', async () => {
    const store = createTestStore({
      initialState: { destination: { count: 0 }, items: [] },
      reducer: parentReducer
    });

    await store.send({
      type: 'destination',
      action: { type: 'presented', action: { type: 'increment' } }
    }, (state) => {
      expect(state.destination?.count).toBe(1);
    });
  });

  it('handles child dismissal via deps.dismiss()', async () => {
    const store = createTestStore({
      initialState: { destination: { count: 0 }, items: [] },
      reducer: parentReducer
    });

    await store.send({
      type: 'destination',
      action: { type: 'presented', action: { type: 'save' } }
    });

    // Child calls deps.dismiss(), which dispatches dismiss action
    await store.receive({
      type: 'destination',
      action: { type: 'dismiss' }
    }, (state) => {
      expect(state.destination).toBe(null);
    });
  });
});
```

## Mock Dependencies

Create testable reducers with mock dependencies for API clients, storage, clocks, etc.

### Mock API Client

```typescript
interface APIClient {
  get<T>(url: string): Promise<Result<T>>;
  post<T>(url: string, data: any): Promise<Result<T>>;
}

interface Result<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

function createMockAPI(responses: Record<string, Result<any>>): APIClient {
  return {
    get: async (url) => {
      return responses[url] || { ok: false, error: 'Not found' };
    },
    post: async (url, data) => {
      return responses[url] || { ok: false, error: 'Not found' };
    }
  };
}

// Usage in tests
const store = createTestStore({
  initialState,
  reducer,
  dependencies: {
    api: createMockAPI({
      '/users/123': { ok: true, data: { id: '123', name: 'Alice' } },
      '/posts': { ok: true, data: [] }
    })
  }
});
```

### Mock Clock

```typescript
interface Clock {
  now(): number;
}

function createMockClock(startTime: number = 0): Clock {
  let currentTime = startTime;

  return {
    now: () => currentTime,
    // Helper for advancing time in tests
    advance: (ms: number) => {
      currentTime += ms;
    }
  };
}

// Usage in tests
const mockClock = createMockClock(1000);
const store = createTestStore({
  initialState,
  reducer,
  dependencies: { clock: mockClock }
});

// In test
await store.send({ type: 'recordTime' });
mockClock.advance(5000);
await store.send({ type: 'checkElapsed' });
```

### Mock Storage

```typescript
interface Storage<T> {
  get(key: string): Promise<T | null>;
  set(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

function createMockStorage<T>(): Storage<T> {
  const data = new Map<string, T>();

  return {
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => {
      data.set(key, value);
    },
    remove: async (key) => {
      data.delete(key);
    }
  };
}

// Usage in tests
const store = createTestStore({
  initialState,
  reducer,
  dependencies: {
    storage: createMockStorage<UserPreferences>()
  }
});
```

### Spy Dependencies

Track calls to dependencies for assertions.

```typescript
import { vi } from 'vitest';

describe('API calls', () => {
  it('calls API with correct parameters', async () => {
    const getMock = vi.fn().mockResolvedValue({ ok: true, data: mockUser });

    const store = createTestStore({
      initialState,
      reducer,
      dependencies: {
        api: { get: getMock }
      }
    });

    await store.send({ type: 'loadUser', id: '123' });
    await store.receive({ type: 'userLoaded' });

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledWith('/users/123');
  });
});
```

## Exhaustive Testing Patterns

### Exhaustivity Mode

By default, TestStore operates in **exhaustive mode** (`exhaustivity: 'on'`), which requires you to assert **all** actions dispatched by effects.

```typescript
describe('Exhaustive Testing', () => {
  it('fails if actions are not asserted', async () => {
    const store = createTestStore({
      initialState,
      reducer: (state, action) => {
        if (action.type === 'loadData') {
          return [
            state,
            Effect.batch(
              Effect.run(async (dispatch) => {
                dispatch({ type: 'dataLoaded' });
              }),
              Effect.run(async (dispatch) => {
                dispatch({ type: 'analyticsSent' });
              })
            )
          ];
        }
        return [state, Effect.none()];
      }
    });

    await store.send({ type: 'loadData' });
    await store.receive({ type: 'dataLoaded' });

    // ❌ This will throw! Missing assertion for 'analyticsSent'
    store.assertNoPendingActions();
  });

  it('passes when all actions are asserted', async () => {
    const store = createTestStore({
      initialState,
      reducer: /* same as above */
    });

    await store.send({ type: 'loadData' });
    await store.receive({ type: 'dataLoaded' });
    await store.receive({ type: 'analyticsSent' }); // ✅ All actions asserted

    store.assertNoPendingActions(); // ✅ Passes
  });
});
```

### Non-Exhaustive Mode

For certain tests (e.g., integration tests), you may want to disable exhaustiveness:

```typescript
describe('Non-Exhaustive Testing', () => {
  it('ignores unasserted actions', async () => {
    const store = createTestStore({
      initialState,
      reducer
    });

    store.exhaustivity = 'off'; // Disable exhaustiveness

    await store.send({ type: 'loadData' });
    await store.receive({ type: 'dataLoaded' });

    // ✅ Passes even though 'analyticsSent' was not asserted
    store.assertNoPendingActions();
  });
});
```

**When to use non-exhaustive mode**:
- Testing only the "happy path" in integration tests
- Testing legacy code with complex effect chains
- Focusing on specific behaviors while ignoring others

**Warning**: Non-exhaustive tests are less rigorous and may miss bugs.

### Partial Action Matching

`receive()` supports partial matching for actions with nested objects:

```typescript
await store.receive({
  type: 'presentation',
  event: { type: 'presentationCompleted' }
});
```

This matches any action where:
- `action.type === 'presentation'`
- `action.event.type === 'presentationCompleted'`

**Recommended**: Use type-only matching + state assertions for clarity:

```typescript
// ✅ More explicit and easier to debug
await store.receive({ type: 'presentationCompleted' });
expect(store.getState().presentation.status).toBe('presented');
```

## Common Patterns

### Testing Error Handling

```typescript
describe('Error Handling', () => {
  it('handles network errors', async () => {
    const store = createTestStore({
      initialState: { data: null, error: null },
      reducer,
      dependencies: {
        api: {
          get: async () => ({ ok: false, error: 'Network timeout' })
        }
      }
    });

    await store.send({ type: 'loadData' });
    await store.receive({ type: 'loadFailed' }, (state) => {
      expect(state.error).toBe('Network timeout');
      expect(state.data).toBe(null);
    });
  });

  it('handles validation errors', async () => {
    const store = createTestStore({
      initialState: { value: '', error: null },
      reducer
    });

    await store.send({ type: 'submit' }, (state) => {
      expect(state.error).toBe('Value is required');
    });
  });
});
```

### Testing Optimistic Updates

```typescript
describe('Optimistic Updates', () => {
  it('applies optimistic update and confirms on success', async () => {
    const store = createTestStore({
      initialState: { todos: [] },
      reducer,
      dependencies: {
        api: {
          addTodo: async (todo) => ({ ok: true, data: { ...todo, id: '123' } })
        }
      }
    });

    await store.send({
      type: 'addTodo',
      todo: { title: 'Buy milk', _optimistic: true }
    }, (state) => {
      // Optimistic update applied immediately
      expect(state.todos).toHaveLength(1);
      expect(state.todos[0]._optimistic).toBe(true);
    });

    await store.receive({ type: 'todoAdded' }, (state) => {
      // Confirmed with server ID
      expect(state.todos[0].id).toBe('123');
      expect(state.todos[0]._optimistic).toBeUndefined();
    });
  });

  it('reverts optimistic update on failure', async () => {
    const store = createTestStore({
      initialState: { todos: [] },
      reducer,
      dependencies: {
        api: {
          addTodo: async () => ({ ok: false, error: 'Server error' })
        }
      }
    });

    await store.send({
      type: 'addTodo',
      todo: { title: 'Buy milk', _optimistic: true }
    }, (state) => {
      expect(state.todos).toHaveLength(1);
    });

    await store.receive({ type: 'addTodoFailed' }, (state) => {
      // Optimistic update reverted
      expect(state.todos).toHaveLength(0);
    });
  });
});
```

### Testing Batch Effects

```typescript
describe('Batch Effects', () => {
  it('handles multiple parallel effects', async () => {
    const store = createTestStore({
      initialState,
      reducer: (state, action) => {
        if (action.type === 'saveAll') {
          return [
            state,
            Effect.batch(
              Effect.run(async (dispatch) => {
                dispatch({ type: 'userSaved' });
              }),
              Effect.run(async (dispatch) => {
                dispatch({ type: 'settingsSaved' });
              }),
              Effect.fireAndForget(async () => {
                // Analytics (no action dispatched)
              })
            )
          ];
        }
        return [state, Effect.none()];
      }
    });

    await store.send({ type: 'saveAll' });

    // Order doesn't matter for parallel effects
    await store.receive({ type: 'userSaved' });
    await store.receive({ type: 'settingsSaved' });

    await store.finish();
  });
});
```

## Common Pitfalls

### Pitfall 1: Not Using Fake Timers

```typescript
// ❌ WRONG: Real timers make tests slow and flaky
it('delays action', async () => {
  await store.send({ type: 'startDelay' });
  await new Promise(r => setTimeout(r, 1000)); // Wait 1 second
  await store.receive({ type: 'delayCompleted' });
});

// ✅ CORRECT: Use fake timers
beforeEach(() => {
  vi.useFakeTimers();
});

it('delays action', async () => {
  await store.send({ type: 'startDelay' });
  await store.advanceTime(1000); // Instant
  await store.receive({ type: 'delayCompleted' });
});
```

### Pitfall 2: Forgetting to Assert All Actions

```typescript
// ❌ WRONG: Missing assertion for effect action
it('loads data', async () => {
  await store.send({ type: 'loadData' });
  expect(store.getState().isLoading).toBe(false); // ❌ Skipped 'dataLoaded' action
});

// ✅ CORRECT: Assert all actions
it('loads data', async () => {
  await store.send({ type: 'loadData' }, (state) => {
    expect(state.isLoading).toBe(true);
  });

  await store.receive({ type: 'dataLoaded' }, (state) => {
    expect(state.isLoading).toBe(false);
  });
});
```

### Pitfall 3: Not Handling Guard Patterns

```typescript
// ❌ WRONG: Not receiving action that guard ignores
it('cancels hover', async () => {
  await store.send({ type: 'hoverStarted' });
  await store.send({ type: 'hoverEnded' });
  await store.advanceTime(300);

  // ❌ delayCompleted was dispatched but ignored - test will fail
  store.assertNoPendingActions();
});

// ✅ CORRECT: Receive and verify guard behavior
it('cancels hover', async () => {
  await store.send({ type: 'hoverStarted' });
  await store.send({ type: 'hoverEnded' });
  await store.advanceTime(300);

  // Guard ignores this action
  await store.receive({ type: 'delayCompleted' }, (state) => {
    expect(state.presentation.status).toBe('idle'); // Unchanged
  });
});
```

### Pitfall 4: Mutating Mock Data

```typescript
// ❌ WRONG: Mutating shared mock data
const mockUser = { id: '123', name: 'Alice' };

it('test 1', async () => {
  const store = createTestStore({
    initialState: { user: null },
    reducer,
    dependencies: {
      api: {
        getUser: async () => {
          mockUser.name = 'Bob'; // ❌ Mutation affects other tests!
          return { ok: true, data: mockUser };
        }
      }
    }
  });
});

// ✅ CORRECT: Create fresh mock data per test
it('test 1', async () => {
  const mockUser = { id: '123', name: 'Alice' }; // Fresh copy
  const store = createTestStore({
    initialState: { user: null },
    reducer,
    dependencies: {
      api: {
        getUser: async () => ({ ok: true, data: mockUser })
      }
    }
  });
});
```

### Pitfall 5: Testing Implementation Instead of Behavior

```typescript
// ❌ WRONG: Testing internal state instead of behavior
it('loads data', async () => {
  await store.send({ type: 'loadData' });
  expect(store.getHistory()).toContain({ type: 'dataLoaded' }); // Implementation detail
});

// ✅ CORRECT: Test observable behavior
it('loads data', async () => {
  await store.send({ type: 'loadData' });
  await store.receive({ type: 'dataLoaded' }, (state) => {
    expect(state.data).toEqual(expectedData); // Behavior
  });
});
```

## Next Steps

- **[Effects](./effects.md)** - Deep dive into the effect system
- **[Composition](./composition.md)** - Composing reducers with `scope()` and `ifLet()`
- **[Store and Reducers](./store-and-reducers.md)** - Core concepts

## Related Documentation

- [Getting Started](../getting-started.md) - Setting up your first tests
- [Navigation](../navigation/tree-based.md) - Testing navigation patterns
- [API Reference](../api/reference.md) - Complete TestStore API
