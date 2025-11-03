# Migration Guide

This guide helps you migrate existing applications to Composable Svelte from other state management solutions and frameworks.

## Table of Contents

1. [Migration from Redux](#migration-from-redux)
2. [Migration from TCA/Swift](#migration-from-tcaswift)
3. [Migration from Svelte Stores](#migration-from-svelte-stores)
4. [Migration from MobX](#migration-from-mobx)
5. [Version Migration](#version-migration)
6. [Migration Best Practices](#migration-best-practices)

---

## Migration from Redux

### Overview

Composable Svelte shares many concepts with Redux but adds improved composition patterns and first-class effect handling.

### Conceptual Mapping

| Redux | Composable Svelte | Notes |
|-------|-------------------|-------|
| Action | Action | Same concept - discriminated union |
| Reducer | Reducer | Returns `[State, Effect]` instead of just `State` |
| Middleware | Effect | Declarative instead of imperative |
| Redux Thunk | Effect.run() | Async effects as data structures |
| Redux Saga | Effect system | More composable than saga patterns |
| combineReducers | scope(), combineReducers() | More flexible composition |
| Selector | $derived | Svelte's reactive system |
| useSelector | store.state | Direct reactive access |
| useDispatch | store.dispatch | Same API |

### Step-by-Step Migration

#### Step 1: Convert Actions

Redux and Composable Svelte use the same action pattern.

```typescript
// Redux - Already compatible!
type Action =
  | { type: 'INCREMENT'; amount: number }
  | { type: 'DECREMENT'; amount: number };

// Composable Svelte - Use same actions
type Action =
  | { type: 'increment'; amount: number }
  | { type: 'decrement'; amount: number };
```

**Note:** Convert to camelCase for consistency with TypeScript conventions.

#### Step 2: Convert Reducers

Redux reducers return only state. Composable Svelte reducers return state and effects.

```typescript
// ❌ Redux
function counterReducer(state = initialState, action) {
  switch (action.type) {
    case 'INCREMENT':
      return { ...state, count: state.count + action.amount };
    case 'DECREMENT':
      return { ...state, count: state.count - action.amount };
    default:
      return state;
  }
}

// ✅ Composable Svelte
function counterReducer(
  state: CounterState,
  action: CounterAction,
  deps: CounterDependencies
): [CounterState, Effect<CounterAction>] {
  switch (action.type) {
    case 'increment':
      return [
        { ...state, count: state.count + action.amount },
        Effect.none()
      ];
    case 'decrement':
      return [
        { ...state, count: state.count - action.amount },
        Effect.none()
      ];
    default:
      const _exhaustive: never = action;
      return [state, Effect.none()];
  }
}
```

**Key Changes:**
- Add return type annotation: `[State, Effect<Action>]`
- Return tuple instead of just state
- Add `Effect.none()` for actions without side effects
- Add exhaustiveness check in default case
- Add dependencies parameter (even if unused)

#### Step 3: Convert Middleware to Effects

Redux middleware becomes effects in Composable Svelte.

```typescript
// ❌ Redux with redux-thunk
function fetchUser(userId) {
  return async (dispatch) => {
    dispatch({ type: 'FETCH_USER_REQUEST' });
    try {
      const user = await api.getUser(userId);
      dispatch({ type: 'FETCH_USER_SUCCESS', user });
    } catch (error) {
      dispatch({ type: 'FETCH_USER_FAILURE', error });
    }
  };
}

// Usage
dispatch(fetchUser(123));

// ✅ Composable Svelte with effects
function userReducer(
  state: UserState,
  action: UserAction,
  deps: UserDependencies
): [UserState, Effect<UserAction>] {
  switch (action.type) {
    case 'fetchUser':
      return [
        { ...state, loading: true },
        Effect.run(async (dispatch) => {
          try {
            const user = await deps.apiClient.getUser(action.userId);
            dispatch({ type: 'fetchUserSuccess', user });
          } catch (error) {
            dispatch({ type: 'fetchUserFailure', error: error.message });
          }
        })
      ];

    case 'fetchUserSuccess':
      return [
        { ...state, loading: false, user: action.user },
        Effect.none()
      ];

    case 'fetchUserFailure':
      return [
        { ...state, loading: false, error: action.error },
        Effect.none()
      ];

    default:
      const _exhaustive: never = action;
      return [state, Effect.none()];
  }
}

// Usage
store.dispatch({ type: 'fetchUser', userId: 123 });
```

**Key Changes:**
- Async logic moves from thunks into Effect.run()
- Dependencies injected via deps parameter
- Success/failure actions explicit in reducer
- Effects returned as data structures

#### Step 4: Convert Redux Saga to Effects

```typescript
// ❌ Redux Saga
function* watchFetchUser() {
  yield takeEvery('FETCH_USER', fetchUserSaga);
}

function* fetchUserSaga(action) {
  try {
    const user = yield call(api.getUser, action.userId);
    yield put({ type: 'FETCH_USER_SUCCESS', user });
  } catch (error) {
    yield put({ type: 'FETCH_USER_FAILURE', error });
  }
}

// ✅ Composable Svelte
function userReducer(
  state: UserState,
  action: UserAction,
  deps: UserDependencies
): [UserState, Effect<UserAction>] {
  switch (action.type) {
    case 'fetchUser':
      return [
        { ...state, loading: true },
        Effect.run(async (dispatch) => {
          try {
            const user = await deps.apiClient.getUser(action.userId);
            dispatch({ type: 'fetchUserSuccess', user });
          } catch (error) {
            dispatch({ type: 'fetchUserFailure', error: error.message });
          }
        })
      ];
    // ... rest of reducer
  }
}
```

**Key Changes:**
- No generator functions needed
- Regular async/await syntax
- Effects are testable data structures
- No separate saga files to maintain

#### Step 5: Convert combineReducers

```typescript
// ❌ Redux
const rootReducer = combineReducers({
  counter: counterReducer,
  user: userReducer,
  todos: todosReducer
});

// ✅ Composable Svelte
const appReducer = integrate<AppState, AppAction, AppDependencies>()
  .with('counter', counterReducer)
  .with('user', userReducer)
  .with('todos', todosReducer)
  .build();

// Or using combineReducers directly
const appReducer = combineReducers<AppState, AppAction, AppDependencies>({
  counter: {
    get: (s) => s.counter,
    set: (s, c) => ({ ...s, counter: c }),
    extractAction: (a) => a.type === 'counter' ? a.action : null,
    liftAction: (ca) => ({ type: 'counter', action: ca }),
    reducer: counterReducer
  },
  // ... other reducers
});
```

**Key Changes:**
- Use `integrate()` for fluent API
- Or `combineReducers()` for explicit control
- More flexible than Redux's combineReducers
- Type-safe composition

#### Step 6: Update Store Creation

```typescript
// ❌ Redux
import { createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';

const store = createStore(
  rootReducer,
  applyMiddleware(thunk)
);

// ✅ Composable Svelte
import { createStore } from '@composable-svelte/core';

const store = createStore({
  initialState,
  reducer: appReducer,
  dependencies: {
    apiClient: new ApiClient(),
    clock: Clock.live,
    storage: Storage.live
  }
});
```

#### Step 7: Update Component Usage

```typescript
// ❌ Redux with react-redux
import { useSelector, useDispatch } from 'react-redux';

function Counter() {
  const count = useSelector(state => state.counter.count);
  const dispatch = useDispatch();

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => dispatch({ type: 'INCREMENT', amount: 1 })}>
        Increment
      </button>
    </div>
  );
}

// ✅ Composable Svelte
<script lang="ts">
  import { getContext } from 'svelte';
  import type { Store } from '@composable-svelte/core';

  const store = getContext<Store<AppState, AppAction>>('store');
</script>

<div>
  <p>Count: {store.state.counter.count}</p>
  <button onclick={() => store.dispatch({ type: 'counter', action: { type: 'increment', amount: 1 } })}>
    Increment
  </button>
</div>
```

### Migration Checklist

- [ ] Convert action types to camelCase
- [ ] Add Effect return to all reducers
- [ ] Convert thunks/middleware to Effect.run()
- [ ] Add dependency injection
- [ ] Update store creation
- [ ] Convert components to use new store API
- [ ] Add exhaustiveness checks
- [ ] Write tests with TestStore
- [ ] Remove Redux dependencies

---

## Migration from TCA/Swift

### Overview

Composable Svelte is heavily inspired by TCA, but adapted for TypeScript/Svelte instead of Swift/SwiftUI.

### Conceptual Mapping

| TCA (Swift) | Composable Svelte | Notes |
|-------------|-------------------|-------|
| `@Reducer` macro | Manual reducer function | No macro support in TS |
| `Reduce` | Reducer function | Same concept |
| `Effect<Action>` | `Effect<Action>` | Same concept |
| `@Presents` macro | `destination: T \| null` | Manual field |
| `Scope` | `scope()`, `ifLet()` | Similar operators |
| `@Dependency` | `deps` parameter | Manual DI |
| `@Dependency(\.dismiss)` | `deps.dismiss()` | Same pattern |
| `TestStore` | `TestStore` | Very similar API |
| `ViewStore` | `store.state` | Svelte runes for reactivity |
| `.task` modifier | `Effect.run()` | Similar async handling |

### Key Differences

#### No Macros

Swift's macros reduce boilerplate, but TypeScript doesn't have equivalent features.

```swift
// ✅ TCA with macros
@Reducer
struct Counter {
  struct State {
    var count = 0
  }

  enum Action {
    case increment
    case decrement
  }

  var body: some ReducerOf<Self> {
    Reduce { state, action in
      switch action {
      case .increment:
        state.count += 1
        return .none
      case .decrement:
        state.count -= 1
        return .none
      }
    }
  }
}

// ✅ Composable Svelte without macros
interface CounterState {
  count: number;
}

type CounterAction =
  | { type: 'increment' }
  | { type: 'decrement' };

function counterReducer(
  state: CounterState,
  action: CounterAction,
  deps: CounterDependencies
): [CounterState, Effect<CounterAction>] {
  switch (action.type) {
    case 'increment':
      return [{ ...state, count: state.count + 1 }, Effect.none()];
    case 'decrement':
      return [{ ...state, count: state.count - 1 }, Effect.none()];
    default:
      const _exhaustive: never = action;
      return [state, Effect.none()];
  }
}
```

#### Manual @Presents

```swift
// ✅ TCA
@Reducer
struct Parent {
  struct State {
    @Presents var destination: Destination.State?
  }

  enum Action {
    case destination(PresentationAction<Destination.Action>)
  }
}

// ✅ Composable Svelte
interface ParentState {
  destination: DestinationState | null; // Manual field
}

type ParentAction =
  | { type: 'destination'; action: PresentationAction<DestinationAction> };
```

#### Manual Dependency Injection

```swift
// ✅ TCA
@Reducer
struct Feature {
  @Dependency(\.apiClient) var apiClient
  @Dependency(\.dismiss) var dismiss

  // ...
}

// ✅ Composable Svelte
interface FeatureDependencies {
  apiClient: ApiClient;
  dismiss: () => void;
}

function featureReducer(
  state: FeatureState,
  action: FeatureAction,
  deps: FeatureDependencies
): [FeatureState, Effect<FeatureAction>] {
  // Use deps.apiClient, deps.dismiss
}
```

### Migration Steps

#### Step 1: Convert State Structs to Interfaces

```swift
// ❌ TCA
struct AppState {
  var count: Int = 0
  var name: String = ""
}

// ✅ Composable Svelte
interface AppState {
  count: number;
  name: string;
}

const initialState: AppState = {
  count: 0,
  name: ''
};
```

#### Step 2: Convert Enums to Discriminated Unions

```swift
// ❌ TCA
enum Action {
  case increment
  case decrement
  case setName(String)
}

// ✅ Composable Svelte
type Action =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'setName'; name: string };
```

#### Step 3: Convert Reducer Body

```swift
// ❌ TCA
var body: some ReducerOf<Self> {
  Reduce { state, action in
    switch action {
    case .increment:
      state.count += 1
      return .none

    case .fetchUser:
      return .run { send in
        let user = try await apiClient.fetch()
        await send(.userLoaded(user))
      }
    }
  }
}

// ✅ Composable Svelte
function reducer(
  state: State,
  action: Action,
  deps: Dependencies
): [State, Effect<Action>] {
  switch (action.type) {
    case 'increment':
      return [
        { ...state, count: state.count + 1 },
        Effect.none()
      ];

    case 'fetchUser':
      return [
        state,
        Effect.run(async (dispatch) => {
          const user = await deps.apiClient.fetch();
          dispatch({ type: 'userLoaded', user });
        })
      ];

    default:
      const _exhaustive: never = action;
      return [state, Effect.none()];
  }
}
```

**Key Changes:**
- Immutable state updates (spread operator)
- Return tuple instead of just effect
- Use `Effect.run()` instead of `.run`
- Manual dispatch instead of `send`

#### Step 4: Convert Scope Operator

```swift
// ❌ TCA
Scope(state: \.child, action: \.child) {
  ChildReducer()
}

// ✅ Composable Svelte
scope<ParentState, ParentAction, ChildState, ChildAction>(
  (s) => s.child,
  (s, c) => ({ ...s, child: c }),
  (a) => a.type === 'child' ? a.action : null,
  (ca) => ({ type: 'child', action: ca }),
  childReducer
)
```

#### Step 5: Convert @Presents Navigation

```swift
// ❌ TCA
@Reducer
struct Parent {
  struct State {
    @Presents var destination: Destination.State?
  }

  enum Action {
    case showDestination
    case destination(PresentationAction<Destination.Action>)
  }

  var body: some ReducerOf<Self> {
    Reduce { state, action in
      switch action {
      case .showDestination:
        state.destination = Destination.State()
        return .none
      case .destination:
        return .none
      }
    }
    .ifLet(\.$destination, action: \.destination) {
      Destination()
    }
  }
}

// ✅ Composable Svelte
interface ParentState {
  destination: DestinationState | null;
}

type ParentAction =
  | { type: 'showDestination' }
  | { type: 'destination'; action: PresentationAction<DestinationAction> };

function parentReducer(
  state: ParentState,
  action: ParentAction,
  deps: ParentDependencies
): [ParentState, Effect<ParentAction>] {
  switch (action.type) {
    case 'showDestination':
      return [
        { ...state, destination: initialDestinationState },
        Effect.none()
      ];

    case 'destination':
      if (action.action.type === 'dismiss') {
        return [{ ...state, destination: null }, Effect.none()];
      }
      return ifLet(
        (s) => s.destination,
        (s, d) => ({ ...s, destination: d }),
        (a) => a.type === 'destination' && a.action.type === 'presented' ? a.action.action : null,
        (da) => ({ type: 'destination', action: { type: 'presented', action: da } }),
        destinationReducer
      )(state, action, deps);

    default:
      const _exhaustive: never = action;
      return [state, Effect.none()];
  }
}
```

#### Step 6: Convert TestStore

```swift
// ❌ TCA
@Test
func testCounter() async {
  let store = TestStore(initialState: Counter.State()) {
    Counter()
  }

  await store.send(.increment) {
    $0.count = 1
  }

  await store.send(.decrement) {
    $0.count = 0
  }
}

// ✅ Composable Svelte
test('counter', async () => {
  const store = new TestStore({
    initialState: { count: 0 },
    reducer: counterReducer,
    dependencies: {}
  });

  await store.send({ type: 'increment' }, (state) => {
    expect(state.count).toBe(1);
  });

  await store.send({ type: 'decrement' }, (state) => {
    expect(state.count).toBe(0);
  });
});
```

### Migration Checklist

- [ ] Convert Swift structs to TypeScript interfaces
- [ ] Convert Swift enums to discriminated unions
- [ ] Remove @Reducer macro, create manual functions
- [ ] Convert state mutations to immutable updates
- [ ] Add Effect.none() for non-effect actions
- [ ] Replace @Dependency with deps parameter
- [ ] Convert @Presents to nullable fields
- [ ] Update TestStore usage
- [ ] Rewrite SwiftUI views as Svelte components

---

## Migration from Svelte Stores

### Overview

Composable Svelte can coexist with or replace existing Svelte stores.

### Conceptual Mapping

| Svelte Stores | Composable Svelte | Notes |
|---------------|-------------------|-------|
| writable() | createStore() | More structured |
| derived() | $derived | Same concept |
| Custom store | Reducer + Effects | More testable |
| update() | dispatch() | Action-based |
| set() | dispatch() | Action-based |

### Migration Example

```typescript
// ❌ Svelte writable store
import { writable } from 'svelte/store';

const count = writable(0);

export const counter = {
  subscribe: count.subscribe,
  increment: () => count.update(n => n + 1),
  decrement: () => count.update(n => n - 1),
  reset: () => count.set(0)
};

// ✅ Composable Svelte
interface CounterState {
  count: number;
}

type CounterAction =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'reset' };

function counterReducer(
  state: CounterState,
  action: CounterAction,
  deps: {}
): [CounterState, Effect<CounterAction>] {
  switch (action.type) {
    case 'increment':
      return [{ ...state, count: state.count + 1 }, Effect.none()];
    case 'decrement':
      return [{ ...state, count: state.count - 1 }, Effect.none()];
    case 'reset':
      return [{ ...state, count: 0 }, Effect.none()];
    default:
      const _exhaustive: never = action;
      return [state, Effect.none()];
  }
}

export const counter = createStore({
  initialState: { count: 0 },
  reducer: counterReducer,
  dependencies: {}
});
```

**Benefits:**
- Type-safe actions
- Testable with TestStore
- Clear action history
- Effect handling

---

## Migration from MobX

### Key Differences

| MobX | Composable Svelte |
|------|-------------------|
| Observable classes | Plain objects |
| @action methods | Actions as data |
| autorun | $effect |
| computed | $derived |
| Mutations anywhere | Only in reducer |

### Migration Example

```typescript
// ❌ MobX
class TodoStore {
  @observable todos = [];

  @action
  addTodo(text) {
    this.todos.push({ id: Date.now(), text, completed: false });
  }

  @action
  toggleTodo(id) {
    const todo = this.todos.find(t => t.id === id);
    if (todo) todo.completed = !todo.completed;
  }

  @computed
  get completedCount() {
    return this.todos.filter(t => t.completed).length;
  }
}

// ✅ Composable Svelte
interface TodoState {
  todos: Todo[];
}

type TodoAction =
  | { type: 'addTodo'; text: string }
  | { type: 'toggleTodo'; id: number };

function todoReducer(
  state: TodoState,
  action: TodoAction,
  deps: {}
): [TodoState, Effect<TodoAction>] {
  switch (action.type) {
    case 'addTodo':
      return [
        {
          ...state,
          todos: [
            ...state.todos,
            { id: Date.now(), text: action.text, completed: false }
          ]
        },
        Effect.none()
      ];

    case 'toggleTodo':
      return [
        {
          ...state,
          todos: state.todos.map(t =>
            t.id === action.id ? { ...t, completed: !t.completed } : t
          )
        },
        Effect.none()
      ];

    default:
      const _exhaustive: never = action;
      return [state, Effect.none()];
  }
}

// In component
const completedCount = $derived(
  store.state.todos.filter(t => t.completed).length
);
```

---

## Version Migration

### Future Breaking Changes

When breaking changes are introduced, this section will document migration paths between versions.

Currently at v1.0.0 - no prior versions to migrate from.

---

## Migration Best Practices

### Incremental Migration Strategy

1. **Start Small**: Migrate one feature at a time
2. **Coexist**: Run old and new state management side-by-side
3. **Test First**: Write tests before migrating
4. **Document**: Keep track of what's migrated

### Testing During Migration

```typescript
// Keep old implementation for comparison
describe('Counter (migration verification)', () => {
  test('new implementation matches old', async () => {
    // Old implementation
    const oldStore = createOldStore();
    oldStore.increment();
    oldStore.increment();
    const oldValue = oldStore.getCount();

    // New implementation
    const newStore = new TestStore({
      initialState: { count: 0 },
      reducer: counterReducer,
      dependencies: {}
    });
    await newStore.send({ type: 'increment' });
    await newStore.send({ type: 'increment' });
    const newValue = newStore.state.count;

    expect(newValue).toBe(oldValue);
  });
});
```

### Refactoring Patterns

#### Extract Reducer from Complex Component

```typescript
// Before: Logic in component
<script>
  let count = $state(0);
  let loading = $state(false);

  async function increment() {
    loading = true;
    await api.recordIncrement();
    count += 1;
    loading = false;
  }
</script>

// After: Logic in reducer
<script>
  const store = createStore({
    initialState: { count: 0, loading: false },
    reducer: counterReducer,
    dependencies: { apiClient }
  });
</script>

<button
  disabled={store.state.loading}
  onclick={() => store.dispatch({ type: 'increment' })}
>
  Count: {store.state.count}
</button>
```

### Common Pitfalls

#### Don't Mix Paradigms

```typescript
// ❌ BAD: Mixing mutable and immutable updates
case 'addItem':
  state.items.push(action.item); // Mutation!
  return [state, Effect.none()];

// ✅ GOOD: Fully immutable
case 'addItem':
  return [
    { ...state, items: [...state.items, action.item] },
    Effect.none()
  ];
```

#### Don't Put Side Effects in Reducers

```typescript
// ❌ BAD: Side effect in reducer
case 'save':
  localStorage.setItem('data', JSON.stringify(state.data));
  return [state, Effect.none()];

// ✅ GOOD: Side effect in Effect
case 'save':
  return [
    state,
    Effect.run(async (dispatch) => {
      localStorage.setItem('data', JSON.stringify(state.data));
      dispatch({ type: 'saved' });
    })
  ];
```

### Migration Timeline Template

```markdown
## Phase 1: Setup (Week 1)
- [ ] Install @composable-svelte/core
- [ ] Add TypeScript if not present
- [ ] Create basic store structure
- [ ] Write first test

## Phase 2: Core Features (Weeks 2-4)
- [ ] Migrate authentication
- [ ] Migrate data fetching
- [ ] Migrate form handling
- [ ] Add effect handling

## Phase 3: Navigation (Weeks 5-6)
- [ ] Convert modals to navigation pattern
- [ ] Convert sheets/drawers
- [ ] Add animations

## Phase 4: Cleanup (Week 7)
- [ ] Remove old dependencies
- [ ] Update documentation
- [ ] Full test coverage
- [ ] Performance audit
```

---

## Getting Help

For migration assistance:

1. Review [examples](/packages/core/examples) showing common patterns
2. Check [troubleshooting guide](/packages/core/docs/troubleshooting.md)
3. Join community discussions
4. File issues with "migration" label

## Additional Resources

- [Core Concepts](/packages/core/docs/core-concepts)
- [API Reference](/packages/core/docs/api)
- [Testing Guide](/packages/core/docs/core-concepts/testing.md)
- [Examples](/packages/core/examples)
