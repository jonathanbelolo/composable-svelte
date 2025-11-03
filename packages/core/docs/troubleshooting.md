# Troubleshooting Guide

This guide covers common issues you may encounter when working with Composable Svelte, along with symptoms, causes, and solutions.

## Table of Contents

1. [TypeScript Errors](#typescript-errors)
2. [Effect Execution Issues](#effect-execution-issues)
3. [Navigation Problems](#navigation-problems)
4. [Test Failures](#test-failures)
5. [Performance Issues](#performance-issues)
6. [SSR Issues](#ssr-issues)
7. [Build and Bundle Issues](#build-and-bundle-issues)
8. [Component Rendering Issues](#component-rendering-issues)
9. [Dependency Injection Issues](#dependency-injection-issues)
10. [Animation Issues](#animation-issues)

---

## TypeScript Errors

### Type Inference Failures

**Symptoms:**
- Types are inferred as `any` or `unknown`
- Missing autocomplete in IDE
- Error: "Type 'X' is not assignable to type 'Y'"

**Cause:**
TypeScript cannot infer types through complex reducer compositions or effect transformations.

**Solution 1: Add explicit type annotations**

```typescript
// ❌ BAD: TypeScript struggles with inference
const reducer = scope(
  (s) => s.child,
  (s, c) => ({ ...s, child: c }),
  // ...
);

// ✅ GOOD: Explicit type annotations
const reducer = scope<AppState, AppAction, ChildState, ChildAction>(
  (s: AppState) => s.child,
  (s: AppState, c: ChildState) => ({ ...s, child: c }),
  (a: AppAction) => a.type === 'child' ? a.action : null,
  (ca: ChildAction) => ({ type: 'child', action: ca } as AppAction),
  childReducer
);
```

**Solution 2: Extract type helpers**

```typescript
// Create helper types for your domain
type GetChild<S> = (state: S) => ChildState;
type SetChild<S> = (state: S, child: ChildState) => S;
type ExtractChildAction<A> = (action: A) => ChildAction | null;
type LiftChildAction<A> = (childAction: ChildAction) => A;

// Use with scope
const reducer = scope<AppState, AppAction, ChildState, ChildAction>(
  getChild as GetChild<AppState>,
  setChild as SetChild<AppState>,
  extractAction as ExtractChildAction<AppAction>,
  liftAction as LiftChildAction<AppAction>,
  childReducer
);
```

### Discriminated Union Errors

**Symptoms:**
- Error: "Property 'X' does not exist on type..."
- Switch statements not narrowing types
- Exhaustiveness checks failing

**Cause:**
Discriminated union not properly configured with `type` discriminator field.

**Solution 1: Ensure all union members have `type` field**

```typescript
// ❌ BAD: Missing type field
type Action =
  | { increment: number }
  | { decrement: number };

// ✅ GOOD: Proper discriminated union
type Action =
  | { type: 'increment'; amount: number }
  | { type: 'decrement'; amount: number };
```

**Solution 2: Use exhaustiveness checking**

```typescript
function reducer(state: State, action: Action): [State, Effect<Action>] {
  switch (action.type) {
    case 'increment':
      return [{ count: state.count + action.amount }, Effect.none()];
    case 'decrement':
      return [{ count: state.count - action.amount }, Effect.none()];
    default:
      // This catches missing cases at compile time
      const _exhaustive: never = action;
      return [state, Effect.none()];
  }
}
```

**Solution 3: Fix union type narrowing**

```typescript
// ❌ BAD: Type guard doesn't narrow properly
if (action.type === 'child') {
  const childAction = action.action; // Still union type
}

// ✅ GOOD: Explicit type guard with assertion
function isChildAction(action: Action): action is { type: 'child'; action: ChildAction } {
  return action.type === 'child';
}

if (isChildAction(action)) {
  const childAction = action.action; // Now ChildAction
}
```

### Effect Type Errors

**Symptoms:**
- Error: "Type 'Effect<ActionA>' is not assignable to type 'Effect<ActionB>'"
- Cannot combine effects of different action types

**Cause:**
Effects are typed by their action type. Combining effects with different action types requires mapping.

**Solution: Use Effect.map() to align types**

```typescript
// ❌ BAD: Mismatched effect types
const [childState, childEffect] = childReducer(state.child, action, deps);
return [
  { ...state, child: childState },
  Effect.batch(parentEffect, childEffect) // Type error!
];

// ✅ GOOD: Map child effects to parent actions
const [childState, childEffect] = childReducer(state.child, action.action, deps);
const mappedEffect = Effect.map(childEffect, (ca) => ({ type: 'child', action: ca }));
return [
  { ...state, child: childState },
  Effect.batch(parentEffect, mappedEffect)
];
```

### Generic Constraint Errors

**Symptoms:**
- Error: "Type 'X' does not satisfy constraint 'Y'"
- Cannot use custom types with library functions

**Cause:**
Library functions may have constraints on generic types (e.g., object types only).

**Solution: Ensure types meet constraints**

```typescript
// ❌ BAD: Primitive state type
type State = number;

// ✅ GOOD: Object state type
interface State {
  count: number;
}

// ❌ BAD: Union action without discriminator
type Action = string | { type: 'complex'; data: any };

// ✅ GOOD: Discriminated union
type Action =
  | { type: 'simple'; value: string }
  | { type: 'complex'; data: any };
```

---

## Effect Execution Issues

### Effect Not Running

**Symptoms:**
- Side effects don't execute
- API calls never fire
- Logs don't appear

**Cause 1: Forgot to wrap effect in Effect.run()**

```typescript
// ❌ BAD: Async function is not an effect
case 'fetchData':
  return [
    { ...state, loading: true },
    async (dispatch) => {
      const data = await api.fetch();
      dispatch({ type: 'dataLoaded', data });
    } // Not wrapped in Effect.run!
  ];

// ✅ GOOD: Wrap in Effect.run()
case 'fetchData':
  return [
    { ...state, loading: true },
    Effect.run(async (dispatch) => {
      const data = await api.fetch();
      dispatch({ type: 'dataLoaded', data });
    })
  ];
```

**Cause 2: Returning Effect.none() instead of actual effect**

```typescript
// ❌ BAD: Effect.none() doesn't run anything
case 'save':
  saveToDatabase(state.data); // Side effect in reducer!
  return [state, Effect.none()];

// ✅ GOOD: Return Effect.run()
case 'save':
  return [
    state,
    Effect.run(async (dispatch) => {
      await saveToDatabase(state.data);
      dispatch({ type: 'saved' });
    })
  ];
```

**Cause 3: Effect returned but not executed by store**

Check that your store is properly executing effects:

```typescript
// Store should execute effects after state updates
class Store<S, A> {
  async dispatch(action: A) {
    const [newState, effect] = this.reducer(this._state, action, this.deps);
    this._state = newState;

    // Make sure effects are executed!
    if (effect._tag !== 'None') {
      await this._executeEffect(effect);
    }
  }
}
```

### Async Effects Not Dispatching

**Symptoms:**
- Effect runs but follow-up actions never fire
- Promise resolves but nothing happens

**Cause: Forgetting to call dispatch in async effect**

```typescript
// ❌ BAD: Effect runs but doesn't dispatch result
Effect.run(async (dispatch) => {
  const data = await api.fetch();
  // Forgot to dispatch!
})

// ✅ GOOD: Dispatch the result
Effect.run(async (dispatch) => {
  const data = await api.fetch();
  dispatch({ type: 'dataLoaded', data });
})
```

### Effect Execution Order Issues

**Symptoms:**
- Effects run in wrong order
- Race conditions between effects
- State updates happen out of sequence

**Cause: Using Effect.batch() with order-dependent effects**

```typescript
// ❌ BAD: Effects may run in parallel
Effect.batch(
  Effect.run(async (d) => {
    await deleteOldData();
    d({ type: 'oldDataDeleted' });
  }),
  Effect.run(async (d) => {
    await insertNewData(); // May run before delete!
    d({ type: 'newDataInserted' });
  })
)

// ✅ GOOD: Chain effects through actions
case 'deleteData':
  return [
    state,
    Effect.run(async (d) => {
      await deleteOldData();
      d({ type: 'oldDataDeleted' });
    })
  ];

case 'oldDataDeleted':
  return [
    state,
    Effect.run(async (d) => {
      await insertNewData();
      d({ type: 'newDataInserted' });
    })
  ];
```

### Effect Memory Leaks

**Symptoms:**
- Memory usage grows over time
- Effects continue running after component unmount
- Multiple subscriptions accumulate

**Cause: Not canceling long-running effects**

```typescript
// ❌ BAD: WebSocket never cleaned up
Effect.run(async (dispatch) => {
  const ws = new WebSocket('ws://...');
  ws.onmessage = (e) => dispatch({ type: 'message', data: e.data });
})

// ✅ GOOD: Use cancellable effect with cleanup
Effect.cancel(
  'websocket-connection',
  Effect.run(async (dispatch, signal) => {
    const ws = new WebSocket('ws://...');
    ws.onmessage = (e) => dispatch({ type: 'message', data: e.data });

    signal.addEventListener('abort', () => {
      ws.close();
    });
  })
)

// Cancel when component unmounts
onDestroy(() => {
  store.dispatch({ type: 'cancelWebSocket' });
});
```

---

## Navigation Problems

### Navigation Not Working

**Symptoms:**
- Modal/sheet doesn't appear
- State changes but nothing renders
- Component shows but is empty

**Cause 1: State/action type mismatch**

```typescript
// ❌ BAD: State type doesn't match what component expects
interface State {
  modal: { show: boolean }; // Wrong shape
}

// ✅ GOOD: Use nullable destination state
interface State {
  modal: ModalState | null; // Correct pattern
}

interface ModalState {
  title: string;
  content: string;
}
```

**Cause 2: Missing PresentationAction wrapper**

```typescript
// ❌ BAD: Child action not wrapped
type Action =
  | { type: 'showModal' }
  | { type: 'modalAction'; action: ModalAction }; // Missing PresentationAction

// ✅ GOOD: Use PresentationAction wrapper
type Action =
  | { type: 'showModal' }
  | { type: 'modal'; action: PresentationAction<ModalAction> };
```

**Cause 3: ifLet() not properly integrated**

```typescript
// ❌ BAD: ifLet result not used
const result = ifLet(
  (s) => s.modal,
  // ... operators
  modalReducer
)(state, action, deps);
// Result thrown away!
return [state, Effect.none()];

// ✅ GOOD: Return ifLet result
return ifLet(
  (s) => s.modal,
  (s, m) => ({ ...s, modal: m }),
  (a) => a.type === 'modal' ? a.action : null,
  (ma) => ({ type: 'modal', action: ma }),
  modalReducer
)(state, action, deps);
```

### Dismiss Not Working

**Symptoms:**
- Modal/sheet stays open
- Dismiss action fires but nothing happens
- State becomes null but component still renders

**Cause 1: Not handling dismiss action**

```typescript
// ❌ BAD: Dismiss action ignored
case 'modal':
  return ifLet(
    (s) => s.modal,
    (s, m) => ({ ...s, modal: m }),
    (a) => a.type === 'modal' ? a.action : null,
    (ma) => ({ type: 'modal', action: ma }),
    modalReducer
  )(state, action, deps);
  // PresentationAction.dismiss not handled!

// ✅ GOOD: Handle dismiss in ifLet
case 'modal':
  if (action.action.type === 'dismiss') {
    return [{ ...state, modal: null }, Effect.none()];
  }
  return ifLet(
    (s) => s.modal,
    (s, m) => ({ ...s, modal: m }),
    (a) => a.type === 'modal' && a.action.type === 'presented' ? a.action.action : null,
    (ma) => ({ type: 'modal', action: { type: 'presented', action: ma } }),
    modalReducer
  )(state, action, deps);
```

**Cause 2: deps.dismiss() not provided**

```typescript
// ❌ BAD: Missing dismiss in dependencies
const deps = {
  apiClient: new ApiClient()
};

// ✅ GOOD: Include dismiss callback
const deps = {
  apiClient: new ApiClient(),
  dismiss: () => store.dispatch({ type: 'modal', action: { type: 'dismiss' } })
};
```

### Scoped Store Issues

**Symptoms:**
- Child component receives wrong store
- Store state is undefined
- Type errors when using scopeTo()

**Cause: Incorrect scoping path**

```typescript
// ❌ BAD: Wrong field name
const childStore = scopeTo(store).into('wrongField').build();

// ✅ GOOD: Correct field name matching state
const childStore = scopeTo(store).into('modal').build();

// ❌ BAD: Wrong case name
const editStore = scopeTo(store).into('destination').case('wrongCase').build();

// ✅ GOOD: Correct case matching union type
const editStore = scopeTo(store).into('destination').case('editItem').build();
```

---

## Test Failures

### TestStore Assertions Failing

**Symptoms:**
- Error: "Expected to receive action but none received"
- Error: "Received unexpected action"
- Assertions on state fail

**Cause 1: Not awaiting async test operations**

```typescript
// ❌ BAD: Missing await
test('loads data', () => {
  store.send({ type: 'load' }); // Returns promise!
  store.receive({ type: 'dataLoaded' }); // Fails immediately
});

// ✅ GOOD: Await all operations
test('loads data', async () => {
  await store.send({ type: 'load' });
  await store.receive({ type: 'dataLoaded' });
});
```

**Cause 2: Wrong action order in test**

```typescript
// ❌ BAD: Expecting actions in wrong order
await store.send({ type: 'load' });
await store.receive({ type: 'loadComplete' }); // This comes second
await store.receive({ type: 'dataLoaded' });   // This comes first!

// ✅ GOOD: Correct order
await store.send({ type: 'load' });
await store.receive({ type: 'dataLoaded' });
await store.receive({ type: 'loadComplete' });
```

**Cause 3: Missing effect actions**

```typescript
// ❌ BAD: Effect dispatches action but test doesn't expect it
await store.send({ type: 'save' });
// save effect dispatches 'saved' action but we don't test it

// ✅ GOOD: Test all dispatched actions
await store.send({ type: 'save' });
await store.receive({ type: 'saved' }, (state) => {
  expect(state.lastSaved).toBeDefined();
});
```

### TestStore Timeout Errors

**Symptoms:**
- Tests hang and timeout
- Error: "Test exceeded timeout"

**Cause: Effect never completes or dispatches**

```typescript
// ❌ BAD: Effect never dispatches follow-up action
case 'load':
  return [
    { ...state, loading: true },
    Effect.run(async (dispatch) => {
      await api.fetch();
      // Forgot to dispatch!
    })
  ];

// ✅ GOOD: Always dispatch completion action
case 'load':
  return [
    { ...state, loading: true },
    Effect.run(async (dispatch) => {
      const data = await api.fetch();
      dispatch({ type: 'dataLoaded', data });
    })
  ];
```

### Exhaustiveness Test Failures

**Symptoms:**
- Test fails on unexpected code path
- Error: "Reached unreachable code"

**Cause: Missing case in switch statement**

```typescript
// ❌ BAD: Missing 'delete' case
function reducer(state: State, action: Action): [State, Effect<Action>] {
  switch (action.type) {
    case 'add':
      return [{ ...state, items: [...state.items, action.item] }, Effect.none()];
    case 'edit':
      return [{ ...state, items: state.items.map(i => i.id === action.id ? action.item : i) }, Effect.none()];
    default:
      const _exhaustive: never = action; // Fails because 'delete' not handled
      return [state, Effect.none()];
  }
}

// ✅ GOOD: Handle all cases
function reducer(state: State, action: Action): [State, Effect<Action>] {
  switch (action.type) {
    case 'add':
      return [{ ...state, items: [...state.items, action.item] }, Effect.none()];
    case 'edit':
      return [{ ...state, items: state.items.map(i => i.id === action.id ? action.item : i) }, Effect.none()];
    case 'delete':
      return [{ ...state, items: state.items.filter(i => i.id !== action.id) }, Effect.none()];
    default:
      const _exhaustive: never = action;
      return [state, Effect.none()];
  }
}
```

---

## Performance Issues

### Slow State Updates

**Symptoms:**
- UI lags when dispatching actions
- Slow rendering after state changes
- High CPU usage

**Cause 1: Deep object cloning in reducer**

```typescript
// ❌ BAD: Deep clone entire state
case 'updateItem':
  return [JSON.parse(JSON.stringify(state)), Effect.none()]; // Slow!

// ✅ GOOD: Shallow clone with structural sharing
case 'updateItem':
  return [
    {
      ...state,
      items: state.items.map(item =>
        item.id === action.id ? { ...item, ...action.updates } : item
      )
    },
    Effect.none()
  ];
```

**Cause 2: Creating new objects unnecessarily**

```typescript
// ❌ BAD: Always creates new state even when nothing changed
case 'noop':
  return [{ ...state }, Effect.none()];

// ✅ GOOD: Return same state object when unchanged
case 'noop':
  return [state, Effect.none()];
```

**Cause 3: Large state objects**

```typescript
// ❌ BAD: Massive arrays in state
interface State {
  allItems: Item[]; // 10,000+ items
  displayedItems: Item[];
}

// ✅ GOOD: Use pagination or virtual scrolling
interface State {
  itemIds: string[]; // Just IDs
  itemsById: Record<string, Item>;
  currentPage: number;
  pageSize: number;
}
```

### Too Many Re-renders

**Symptoms:**
- Component renders multiple times for single action
- Console shows repeated render logs
- Performance profiler shows excessive renders

**Cause: Not using $derived or memoization**

```typescript
// ❌ BAD: Compute on every render
{#each store.state.items.filter(i => i.active).sort((a, b) => a.name.localeCompare(b.name)) as item}
  <ItemRow {item} />
{/each}

// ✅ GOOD: Use $derived
<script>
  let { store } = $props();

  const sortedActiveItems = $derived(
    store.state.items
      .filter(i => i.active)
      .sort((a, b) => a.name.localeCompare(b.name))
  );
</script>

{#each sortedActiveItems as item}
  <ItemRow {item} />
{/each}
```

### Memory Leaks

**Symptoms:**
- Memory usage grows over time
- Browser tab becomes slow
- App crashes after extended use

**Cause: Not cleaning up subscriptions**

```typescript
// ❌ BAD: Store subscription never cleaned up
onMount(() => {
  store.subscribe((state) => {
    updateUI(state);
  });
});

// ✅ GOOD: Clean up on destroy
onMount(() => {
  const unsubscribe = store.subscribe((state) => {
    updateUI(state);
  });

  return unsubscribe; // or use onDestroy(unsubscribe)
});
```

---

## SSR Issues

### ReferenceError: window is not defined

**Symptoms:**
- Server crashes with "window is not defined"
- Build fails during SSR
- Error mentions browser APIs

**Cause: Using browser-only APIs in server context**

```typescript
// ❌ BAD: Unconditional browser API usage
const reducer = (state: State, action: Action): [State, Effect<Action>] => {
  case 'init':
    const theme = localStorage.getItem('theme'); // Crashes on server
    return [{ ...state, theme }, Effect.none()];
};

// ✅ GOOD: Check for browser context
import { browser } from '$app/environment';

const reducer = (state: State, action: Action): [State, Effect<Action>] => {
  case 'init':
    const theme = browser ? localStorage.getItem('theme') : null;
    return [{ ...state, theme }, Effect.none()];
};
```

**Solution: Create browser-safe effect**

```typescript
// Create effect that only runs in browser
const Effect = {
  // ... other methods

  browser<A>(effect: Effect<A>): Effect<A> {
    if (typeof window === 'undefined') {
      return Effect.none();
    }
    return effect;
  }
};

// Usage
case 'loadTheme':
  return [
    state,
    Effect.browser(
      Effect.run(async (dispatch) => {
        const theme = localStorage.getItem('theme');
        dispatch({ type: 'themeLoaded', theme });
      })
    )
  ];
```

### Hydration Mismatch

**Symptoms:**
- Warning: "Hydration mismatch"
- Content flashes or changes after load
- Different content on server vs client

**Cause: Different initial state on server vs client**

```typescript
// ❌ BAD: Initial state depends on browser API
const initialState: State = {
  timestamp: Date.now(), // Different on server vs client
  theme: localStorage.getItem('theme') // Not available on server
};

// ✅ GOOD: Consistent initial state
const initialState: State = {
  timestamp: 0,
  theme: null
};

// Load browser-specific data after hydration
onMount(() => {
  store.dispatch({ type: 'hydrated' });
});

case 'hydrated':
  return [
    state,
    Effect.run(async (dispatch) => {
      const theme = localStorage.getItem('theme');
      dispatch({ type: 'themeLoaded', theme });
    })
  ];
```

---

## Build and Bundle Issues

### Bundle Size Too Large

**Symptoms:**
- Large bundle size reported by build tool
- Slow initial page load
- Large vendor chunks

**Cause 1: Not tree-shaking properly**

```typescript
// ❌ BAD: Import entire library
import * as Effects from '@composable-svelte/core';

// ✅ GOOD: Import only what you need
import { Effect } from '@composable-svelte/core';
```

**Cause 2: Including dev-only code in production**

```typescript
// ❌ BAD: Debug code in production
const reducer = (state: State, action: Action): [State, Effect<Action>] => {
  console.log('Action:', action); // Always included
  console.log('State:', state);
  // ...
};

// ✅ GOOD: Remove debug code in production
const reducer = (state: State, action: Action): [State, Effect<Action>] => {
  if (import.meta.env.DEV) {
    console.log('Action:', action);
    console.log('State:', state);
  }
  // ...
};
```

### TypeScript Build Errors

**Symptoms:**
- Build fails with type errors
- Errors that don't appear in IDE
- Declaration file generation fails

**Cause: tsconfig.json misconfiguration**

```json
// ✅ GOOD: Proper tsconfig for Composable Svelte
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": false,
    "declaration": true,
    "declarationMap": true
  }
}
```

---

## Component Rendering Issues

### Component Not Reactive

**Symptoms:**
- Component doesn't update when state changes
- Need to manually refresh to see changes
- Store state updates but UI doesn't

**Cause: Not using store.state reactively**

```typescript
// ❌ BAD: Accessing state non-reactively
<script>
  let { store } = $props();
  const count = store.state.count; // Not reactive!
</script>

<div>Count: {count}</div>

// ✅ GOOD: Access state in template or use $derived
<script>
  let { store } = $props();
</script>

<div>Count: {store.state.count}</div>

// OR with $derived
<script>
  let { store } = $props();
  const count = $derived(store.state.count);
</script>

<div>Count: {count}</div>
```

---

## Dependency Injection Issues

### Dependencies Not Available

**Symptoms:**
- Error: "Cannot read property 'X' of undefined"
- deps parameter is undefined
- Dependency methods throw errors

**Cause: Not passing dependencies to store**

```typescript
// ❌ BAD: No dependencies provided
const store = createStore({
  initialState,
  reducer
});

// ✅ GOOD: Provide dependencies
const store = createStore({
  initialState,
  reducer,
  dependencies: {
    apiClient: new ApiClient(),
    clock: Clock.live,
    dismiss: () => {}
  }
});
```

---

## Animation Issues

### Animation Not Starting

**Symptoms:**
- Modal appears instantly without animation
- No transition effects
- PresentationState stuck in 'presenting'

**Cause 1: Missing presentation state update**

```typescript
// ❌ BAD: Only set destination
case 'showModal':
  return [
    { ...state, destination: { type: 'modal', state: modalState } },
    Effect.none()
  ];

// ✅ GOOD: Set both destination and presentation
case 'showModal':
  return [
    {
      ...state,
      destination: { type: 'modal', state: modalState },
      presentation: {
        status: 'presenting',
        content: { type: 'modal', state: modalState },
        duration: 300
      }
    },
    Effect.afterDelay(300, (d) => d({ type: 'presentationCompleted' }))
  ];
```

**Cause 2: Not handling presentationCompleted**

```typescript
// ❌ BAD: No handler for completion
case 'showModal':
  return [
    {
      ...state,
      destination: { type: 'modal', state: modalState },
      presentation: { status: 'presenting', content: { type: 'modal', state: modalState }, duration: 300 }
    },
    Effect.afterDelay(300, (d) => d({ type: 'presentationCompleted' }))
  ];
  // presentationCompleted not handled!

// ✅ GOOD: Handle completion
case 'presentationCompleted':
  return [
    {
      ...state,
      presentation: {
        ...state.presentation,
        status: 'presented'
      }
    },
    Effect.none()
  ];
```

### Animation Stuck/Never Completes

**Symptoms:**
- Modal stays in presenting state forever
- Cannot interact with modal
- Timeout never fires

**Solution: Add timeout fallback**

```typescript
case 'showModal':
  const duration = 300;
  return [
    {
      ...state,
      destination: { type: 'modal', state: modalState },
      presentation: {
        status: 'presenting',
        content: { type: 'modal', state: modalState },
        duration
      }
    },
    Effect.batch(
      Effect.afterDelay(duration, (d) => d({ type: 'presentationCompleted' })),
      Effect.afterDelay(duration * 2, (d) => d({ type: 'presentationTimeout' })) // Fallback
    )
  ];

case 'presentationTimeout':
  console.warn('Presentation animation timed out');
  return [
    {
      ...state,
      presentation: {
        ...state.presentation,
        status: 'presented'
      }
    },
    Effect.none()
  ];
```

---

## Getting Help

If you encounter issues not covered in this guide:

1. Check the [API documentation](/packages/core/docs/api)
2. Review [examples](/packages/core/examples)
3. Search existing GitHub issues
4. Create a new issue with:
   - Minimal reproduction
   - Expected vs actual behavior
   - Environment details (Svelte version, browser, etc.)
   - Relevant code snippets

## Common Debugging Techniques

### Enable Debug Logging

```typescript
// Add to store creation
const store = createStore({
  initialState,
  reducer: (state, action, deps) => {
    if (import.meta.env.DEV) {
      console.group(`Action: ${action.type}`);
      console.log('Previous state:', state);
    }

    const [newState, effect] = reducer(state, action, deps);

    if (import.meta.env.DEV) {
      console.log('New state:', newState);
      console.log('Effect:', effect);
      console.groupEnd();
    }

    return [newState, effect];
  },
  dependencies
});
```

### Use TestStore for Debugging

Even outside tests, TestStore can help debug issues:

```typescript
const testStore = new TestStore({
  initialState,
  reducer,
  dependencies
});

// Step through actions
await testStore.send({ type: 'load' });
console.log('State after load:', testStore.state);

await testStore.receive({ type: 'dataLoaded' });
console.log('State after receive:', testStore.state);
```

### Type-check Reducers

Extract reducer to separate function for better type checking:

```typescript
// Explicit return type catches issues
function myReducer(
  state: State,
  action: Action,
  deps: Dependencies
): [State, Effect<Action>] {
  // TypeScript will error if return type doesn't match
  switch (action.type) {
    // ...
  }
}
```
