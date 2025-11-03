# API Reference

Complete API reference for `@composable-svelte/core`.

**Version**: 1.0.0
**License**: MIT

---

## Table of Contents

- [Core Types](#core-types)
- [Store](#store)
- [Effect](#effect)
- [Composition](#composition)
- [Navigation](#navigation)
- [Dependencies](#dependencies)
- [Testing](#testing)

---

## Core Types

### Reducer

Pure function that transforms state based on actions.

```typescript
type Reducer<State, Action, Dependencies = any> = (
  state: State,
  action: Action,
  dependencies: Dependencies
) => readonly [State, Effect<Action>]
```

**Parameters:**
- `state` - Current state (immutable)
- `action` - The action that occurred
- `dependencies` - Injected dependencies (API clients, clock, etc.)

**Returns:** Tuple of `[newState, effect]`

**Requirements:**
- MUST be pure (no side effects)
- MUST NOT mutate input state
- MUST return new state object (or same reference if unchanged)
- MUST return an Effect (even if `Effect.none()`)

**Example:**

```typescript
const counterReducer: Reducer<CounterState, CounterAction> = (state, action) => {
  switch (action.type) {
    case 'incrementTapped':
      return [{ ...state, count: state.count + 1 }, Effect.none()];
    case 'decrementTapped':
      return [{ ...state, count: state.count - 1 }, Effect.none()];
    default:
      return [state, Effect.none()];
  }
};
```

---

### Dispatch

Function that dispatches an action to the store.

```typescript
type Dispatch<Action> = (action: Action) => void
```

**Parameters:**
- `action` - The action to dispatch

**Usage:**

```typescript
store.dispatch({ type: 'incrementTapped' });
```

---

### Selector

Function that extracts a value from state (non-reactive).

```typescript
type Selector<State, Value> = (state: State) => Value
```

**Note:** Does NOT establish reactivity. Use `$derived` in Svelte components for reactive values.

**Example:**

```typescript
const selectCount: Selector<AppState, number> = (state) => state.count;
const count = store.select(selectCount);
```

---

### EffectExecutor

Function that executes an effect and may dispatch actions.

```typescript
type EffectExecutor<Action> = (
  dispatch: Dispatch<Action>
) => void | Promise<void>
```

**Example:**

```typescript
const executor: EffectExecutor<MyAction> = async (dispatch) => {
  const data = await api.fetch();
  dispatch({ type: 'dataLoaded', data });
};
```

---

### EffectType

Discriminated union representing all possible effect types.

```typescript
type EffectType<Action> =
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Run'; readonly execute: EffectExecutor<Action> }
  | { readonly _tag: 'FireAndForget'; readonly execute: () => void | Promise<void> }
  | { readonly _tag: 'Batch'; readonly effects: readonly Effect<Action>[] }
  | { readonly _tag: 'Cancellable'; readonly id: string; readonly execute: EffectExecutor<Action> }
  | { readonly _tag: 'Debounced'; readonly id: string; readonly ms: number; readonly execute: EffectExecutor<Action> }
  | { readonly _tag: 'Throttled'; readonly id: string; readonly ms: number; readonly execute: EffectExecutor<Action> }
  | { readonly _tag: 'AfterDelay'; readonly ms: number; readonly execute: EffectExecutor<Action> }
  | { readonly _tag: 'Subscription'; readonly id: string; readonly setup: SubscriptionSetup<Action> }
```

**Note:** Most users won't need to import `EffectType` explicitly. TypeScript infers effect types from `Effect.none()`, `Effect.run()`, etc.

---

### StoreConfig

Configuration for creating a Store.

```typescript
interface StoreConfig<State, Action, Dependencies = any> {
  initialState: State;
  reducer: Reducer<State, Action, Dependencies>;
  dependencies?: Dependencies;
  maxHistorySize?: number;
}
```

**Fields:**
- `initialState` - Initial state of the store
- `reducer` - The reducer that processes actions
- `dependencies` - Optional dependencies to inject (default: `{}`)
- `maxHistorySize` - Maximum actions to keep in history (default: unlimited, set to 0 to disable)

---

### Store

The Store interface - runtime for a feature.

```typescript
interface Store<State, Action> {
  readonly state: State;
  dispatch(action: Action): void;
  select<T>(selector: Selector<State, T>): T;
  subscribe(listener: (state: State) => void): () => void;
  subscribeToActions?(listener: (action: Action, state: State) => void): () => void;
  readonly history: ReadonlyArray<Action>;
  destroy(): void;
}
```

**Properties:**

- `state` - Current state (read-only, reactive via Svelte 5 `$state`)
- `history` - Action history for debugging/time-travel

**Methods:**

- `dispatch(action)` - Dispatch an action to update state
- `select(selector)` - Select derived value from state (non-reactive)
- `subscribe(listener)` - Subscribe to state changes, returns unsubscribe function
- `subscribeToActions(listener)` - Subscribe to action dispatches (optional, for Destination.on())
- `destroy()` - Clean up resources (cancels effects, clears subscriptions)

---

## Store

### createStore

Create a Store for a feature.

```typescript
function createStore<State, Action, Dependencies = any>(
  config: StoreConfig<State, Action, Dependencies>
): Store<State, Action>
```

**Parameters:**
- `config` - Store configuration

**Returns:** Store instance

**Example:**

```typescript
interface CounterState {
  count: number;
}

type CounterAction =
  | { type: 'incrementTapped' }
  | { type: 'decrementTapped' };

const store = createStore({
  initialState: { count: 0 },
  reducer: counterReducer,
  dependencies: { apiClient }
});

// In Svelte component
const count = $derived(store.state.count);

<button onclick={() => store.dispatch({ type: 'incrementTapped' })}>
  Count: {count}
</button>
```

**Store Lifecycle:**

```typescript
// Create store
const store = createStore({ initialState, reducer });

// Use in components
const value = $derived(store.state.someField);

// Subscribe programmatically
const unsubscribe = store.subscribe((state) => {
  console.log('State changed:', state);
});

// Clean up when done
store.destroy();
unsubscribe();
```

---

## Effect

The `Effect` namespace contains all effect constructors.

### Effect.none

No side effects.

```typescript
function none<A>(): EffectType<A>
```

**Example:**

```typescript
case 'reset':
  return [initialState, Effect.none()];
```

---

### Effect.run

Execute async work and dispatch actions.

```typescript
function run<A>(execute: EffectExecutor<A>): EffectType<A>
```

**Parameters:**
- `execute` - Function that performs async work and dispatches actions

**Use for:** API calls, timers, any async operation that needs to dispatch actions.

**Example:**

```typescript
case 'loadData':
  return [
    { ...state, isLoading: true },
    Effect.run(async (dispatch) => {
      const data = await api.fetch();
      dispatch({ type: 'dataLoaded', data });
    })
  ];
```

---

### Effect.fireAndForget

Execute effect without waiting for completion. No actions can be dispatched.

```typescript
function fireAndForget<A>(execute: () => void | Promise<void>): EffectType<A>
```

**Parameters:**
- `execute` - Function that performs work without dispatching

**Use for:** Fire-and-forget operations like analytics tracking or logging.

**Example:**

```typescript
case 'buttonClicked':
  return [
    state,
    Effect.fireAndForget(() => {
      analytics.track('button_clicked', { id: state.id });
    })
  ];
```

---

### Effect.batch

Execute multiple effects in parallel.

```typescript
function batch<A>(...effects: EffectType<A>[]): EffectType<A>
```

**Parameters:**
- `effects` - Effects to execute in parallel

**Returns:** Single effect that executes all provided effects

**Optimizations:**
- Returns `Effect.none()` for empty batches
- Returns single effect directly if batch has only one effect
- Filters out `Effect.none()` from batch

**Example:**

```typescript
case 'saveData':
  return [
    state,
    Effect.batch(
      Effect.run(async (d) => {
        await api.save(state.data);
        d({ type: 'dataSaved' });
      }),
      Effect.fireAndForget(() => analytics.track('save')),
      Effect.afterDelay(5000, (d) => d({ type: 'autoSaveTimeout' }))
    )
  ];
```

---

### Effect.cancellable

Execute effect that can be cancelled by ID.

```typescript
function cancellable<A>(id: string, execute: EffectExecutor<A>): EffectType<A>
```

**Parameters:**
- `id` - Unique identifier for cancellation
- `execute` - Function that performs async work

**Behavior:** Cancels any in-flight effect with the same ID.

**Use for:** Operations that should be cancelled when superseded (e.g., API requests).

**Example:**

```typescript
case 'searchQueryChanged':
  return [
    { ...state, query: action.query },
    Effect.cancellable('search', async (dispatch) => {
      const results = await api.search(action.query);
      dispatch({ type: 'searchResultsLoaded', results });
    })
  ];
```

---

### Effect.debounced

Execute effect after debounce delay. Resets timer if called again with same ID.

```typescript
function debounced<A>(id: string, ms: number, execute: EffectExecutor<A>): EffectType<A>
```

**Parameters:**
- `id` - Unique identifier for debouncing
- `ms` - Delay in milliseconds (must be non-negative)
- `execute` - Function that performs async work

**Use for:** Search-as-you-type, autosave, operations where you want to wait until user stops.

**Throws:** `TypeError` if `ms` is negative

**Example:**

```typescript
case 'searchQueryChanged':
  return [
    { ...state, query: action.query },
    Effect.debounced('search', 300, async (dispatch) => {
      const results = await api.search(action.query);
      dispatch({ type: 'searchResultsLoaded', results });
    })
  ];
```

---

### Effect.throttled

Execute effect at most once per time period.

```typescript
function throttled<A>(id: string, ms: number, execute: EffectExecutor<A>): EffectType<A>
```

**Parameters:**
- `id` - Unique identifier for throttling
- `ms` - Minimum interval between executions in milliseconds (must be non-negative)
- `execute` - Function that performs async work

**Use for:** Scroll handlers, resize handlers, high-frequency events.

**Throws:** `TypeError` if `ms` is negative

**Example:**

```typescript
case 'scrolled':
  return [
    { ...state, scrollY: action.y },
    Effect.throttled('scroll-tracker', 100, async (dispatch) => {
      dispatch({ type: 'scrollPositionRecorded', y: action.y });
    })
  ];
```

---

### Effect.afterDelay

Execute effect after a delay.

```typescript
function afterDelay<A>(ms: number, create: EffectExecutor<A>): EffectType<A>
```

**Parameters:**
- `ms` - Delay in milliseconds (must be non-negative)
- `create` - Function that creates the dispatch call after delay

**Use for:** Animations, timed transitions, delays.

**Throws:** `TypeError` if `ms` is negative

**Example:**

```typescript
case 'showTooltip':
  return [
    { ...state, isShowing: true },
    Effect.afterDelay(300, (dispatch) => {
      dispatch({ type: 'tooltipVisible' });
    })
  ];
```

---

### Effect.subscription

Create a long-running subscription with automatic cleanup.

```typescript
function subscription<A>(
  id: string,
  setup: (dispatch: Dispatch<A>) => (() => void | Promise<void>)
): EffectType<A>
```

**Parameters:**
- `id` - Unique identifier for subscription (used for cancellation)
- `setup` - Function that sets up subscription and returns cleanup function

**Use for:** WebSocket connections, event listeners, persistent resources.

**Cleanup:** Called automatically when subscription is cancelled or store is destroyed.

**Example:**

```typescript
// WebSocket subscription
case 'connect':
  return [
    { ...state, isConnected: true },
    Effect.subscription('websocket', (dispatch) => {
      const socket = new WebSocket('wss://example.com');

      socket.onmessage = (event) => {
        dispatch({ type: 'messageReceived', data: event.data });
      };

      socket.onerror = (error) => {
        dispatch({ type: 'connectionError', error });
      };

      // Return cleanup function
      return () => {
        socket.close();
      };
    })
  ];
```

**Example:** Event listener subscription

```typescript
case 'startListening':
  return [
    state,
    Effect.subscription('window-resize', (dispatch) => {
      const handler = () => {
        dispatch({ type: 'windowResized', width: window.innerWidth });
      };

      window.addEventListener('resize', handler);

      return () => {
        window.removeEventListener('resize', handler);
      };
    })
  ];
```

---

### Effect.cancel

Cancel all in-flight effects with the given ID.

```typescript
function cancel<A>(id: string): EffectType<A>
```

**Parameters:**
- `id` - The ID of the effect(s) to cancel

**Cancels:**
- `Effect.cancellable()`
- `Effect.subscription()` (triggers cleanup function)
- `Effect.debounced()`
- `Effect.throttled()`

**Example:**

```typescript
case 'disconnect':
  return [
    { ...state, isConnected: false },
    Effect.cancel('websocket')
  ];
```

---

### Effect.animated

Create an effect that coordinates with animation lifecycle.

```typescript
function animated<A>(config: {
  duration: number;
  onComplete: A;
}): EffectType<A>
```

**Parameters:**
- `config.duration` - Animation duration in milliseconds (must be non-negative)
- `config.onComplete` - Action to dispatch when animation completes

**Use for:** Fixed-duration animations (CSS transitions, Svelte transitions).

**Don't use for:** Variable-duration animations (use callback from animation library).

**Throws:** `TypeError` if `duration` is negative

**Example:**

```typescript
case 'addButtonTapped':
  return [
    {
      ...state,
      presentation: { status: 'presenting', content: destination }
    },
    Effect.animated({
      duration: 300,
      onComplete: {
        type: 'presentation',
        event: { type: 'presentationCompleted' }
      }
    })
  ];
```

**With timeout fallback:**

```typescript
case 'addButtonTapped':
  return [
    {
      ...state,
      presentation: { status: 'presenting', content: destination }
    },
    Effect.batch(
      Effect.animated({
        duration: 300,
        onComplete: {
          type: 'presentation',
          event: { type: 'presentationCompleted' }
        }
      }),
      Effect.animated({
        duration: 600,  // 2x expected duration
        onComplete: {
          type: 'presentation',
          event: { type: 'presentationTimeout' }
        }
      })
    )
  ];
```

---

### Effect.transition

Create a presentation effect with automatic lifecycle management.

```typescript
function transition<A>(config: {
  presentDuration?: number;
  dismissDuration?: number;
  createPresentationEvent: (event: {
    type: 'presentationCompleted' | 'dismissalCompleted'
  }) => A;
}): {
  present: EffectType<A>;
  dismiss: EffectType<A>;
}
```

**Parameters:**
- `config.presentDuration` - Duration for presentation animation (default: 300ms)
- `config.dismissDuration` - Duration for dismissal animation (default: 200ms)
- `config.createPresentationEvent` - Function to create action from event

**Returns:** Object with `present` and `dismiss` effects

**Benefits:**
- DRY: Define animation durations once
- Type-safe: Action creator ensures correct event structure
- Consistent: Both animations use same pattern

**Throws:** `TypeError` if duration is negative

**Example:**

```typescript
// Define transition once
const transition = Effect.transition({
  presentDuration: 300,
  dismissDuration: 200,
  createPresentationEvent: (event) => ({
    type: 'presentation',
    event
  })
});

// Use in reducer
case 'addButtonTapped':
  return [
    { ...state, presentation: { status: 'presenting', content: destination } },
    transition.present
  ];

case 'closeButtonTapped':
  return [
    { ...state, presentation: { status: 'dismissing', content: state.presentation.content } },
    transition.dismiss
  ];
```

---

### Effect.map

Map effect actions to parent actions (for composition).

```typescript
function map<A, B>(effect: EffectType<A>, f: (a: A) => B): EffectType<B>
```

**Parameters:**
- `effect` - The child effect
- `f` - Function to transform child action to parent action

**Returns:** Effect that dispatches parent actions

**Use for:** Reducer composition (transforming child effects to parent actions).

**Example:**

```typescript
const childEffect: Effect<ChildAction> = Effect.run(async (d) => {
  d({ type: 'childActionFired' });
});

const parentEffect: Effect<ParentAction> = Effect.map(
  childEffect,
  (childAction) => ({ type: 'child', action: childAction })
);
```

---

## Composition

Utilities for composing reducers.

### scope

Scope a child reducer to work with parent state and actions.

```typescript
function scope<ParentState, ParentAction, ChildState, ChildAction, Dependencies = any>(
  toChildState: StateLens<ParentState, ChildState>,
  fromChildState: StateUpdater<ParentState, ChildState>,
  toChildAction: ActionPrism<ParentAction, ChildAction>,
  fromChildAction: ActionEmbedder<ParentAction, ChildAction>,
  childReducer: Reducer<ChildState, ChildAction, Dependencies>
): Reducer<ParentState, ParentAction, Dependencies>
```

**Parameters:**
- `toChildState` - Extract child state from parent state
- `fromChildState` - Embed child state back into parent state
- `toChildAction` - Extract child action from parent action (returns null if not applicable)
- `fromChildAction` - Wrap child action into parent action
- `childReducer` - The child reducer to compose

**Returns:** Parent reducer that delegates to child

**Use for:** Permanent child features (always present in state).

**Example:**

```typescript
interface AppState {
  counter: CounterState;
  todos: TodosState;
}

type AppAction =
  | { type: 'counter'; action: CounterAction }
  | { type: 'todos'; action: TodosAction };

const appReducer: Reducer<AppState, AppAction> = (state, action, deps) => {
  // Delegate counter actions to counter reducer
  if (action.type === 'counter') {
    return scope(
      (s) => s.counter,
      (s, c) => ({ ...s, counter: c }),
      (a) => a.type === 'counter' ? a.action : null,
      (ca) => ({ type: 'counter', action: ca }),
      counterReducer
    )(state, action, deps);
  }

  // Handle other actions...
  return [state, Effect.none()];
};
```

---

### scopeAction

Helper for common case where child actions are embedded in parent actions.

```typescript
function scopeAction<ParentState, ParentAction extends { type: string }, ChildState, ChildAction, Dependencies = any>(
  toChildState: StateLens<ParentState, ChildState>,
  fromChildState: StateUpdater<ParentState, ChildState>,
  actionType: string,
  childReducer: Reducer<ChildState, ChildAction, Dependencies>
): Reducer<ParentState, ParentAction, Dependencies>
```

**Parameters:**
- `toChildState` - Extract child state from parent state
- `fromChildState` - Embed child state back into parent state
- `actionType` - The action type string to match
- `childReducer` - The child reducer to compose

**Returns:** Parent reducer

**Example:**

```typescript
type AppAction = { type: 'counter'; action: CounterAction } | ...;

const parentReducer: Reducer<AppState, AppAction> = (state, action, deps) => {
  if (action.type === 'counter') {
    return scopeAction(
      (s) => s.counter,
      (s, c) => ({ ...s, counter: c }),
      'counter',
      counterReducer
    )(state, action, deps);
  }

  return [state, Effect.none()];
};
```

---

### combineReducers

Combine multiple slice reducers into a single reducer.

```typescript
function combineReducers<State, Action, Dependencies = any>(
  slices: {
    [K in keyof State]: Reducer<State[K], Action, Dependencies>
  }
): Reducer<State, Action, Dependencies>
```

**Parameters:**
- `slices` - Map of state keys to slice reducers

**Returns:** Combined reducer

**Use for:** Redux-style slice reducers where each slice handles all actions.

**Example:**

```typescript
interface AppState {
  counter: CounterState;
  todos: TodosState;
}

const appReducer = combineReducers<AppState, AppAction>({
  counter: counterReducer,
  todos: todosReducer
});

// Equivalent to:
const appReducer: Reducer<AppState, AppAction> = (state, action, deps) => {
  const [newCounter, counterEffect] = counterReducer(state.counter, action, deps);
  const [newTodos, todosEffect] = todosReducer(state.todos, action, deps);

  return [
    { counter: newCounter, todos: newTodos },
    Effect.batch(counterEffect, todosEffect)
  ];
};
```

---

### Type Aliases

#### StateLens

Lens for extracting child state from parent state.

```typescript
type StateLens<ParentState, ChildState> = (parent: ParentState) => ChildState
```

---

#### StateUpdater

Function to update parent state with new child state.

```typescript
type StateUpdater<ParentState, ChildState> = (
  parent: ParentState,
  child: ChildState
) => ParentState
```

---

#### ActionPrism

Prism for extracting child action from parent action. Returns null if not applicable.

```typescript
type ActionPrism<ParentAction, ChildAction> = (
  parent: ParentAction
) => ChildAction | null
```

---

#### ActionEmbedder

Function to embed child action in parent action.

```typescript
type ActionEmbedder<ParentAction, ChildAction> = (
  child: ChildAction
) => ParentAction
```

---

## Navigation

State-driven navigation system with tree-based patterns.

### PresentationAction

Action type for managing presentation lifecycle of child features.

```typescript
type PresentationAction<T> =
  | { readonly type: 'presented'; readonly action: T }
  | { readonly type: 'dismiss' }
```

**Usage:**
- `{ type: 'presented', action }` - Child feature dispatched an action
- `{ type: 'dismiss' }` - Child requested dismissal (via `deps.dismiss()`)

**Helpers:**

```typescript
PresentationAction.presented<T>(action: T): PresentationAction<T>
PresentationAction.dismiss<T>(): PresentationAction<T>
```

**Example:**

```typescript
type ParentAction =
  | { type: 'addButtonTapped' }
  | { type: 'destination'; action: PresentationAction<AddItemAction> };

const reducer: Reducer<ParentState, ParentAction> = (state, action, deps) => {
  switch (action.type) {
    case 'addButtonTapped':
      return [{ ...state, destination: { /* initial state */ } }, Effect.none()];

    case 'destination':
      if (action.action.type === 'dismiss') {
        return [{ ...state, destination: null }, Effect.none()];
      }
      // Handle child's 'presented' actions via ifLet()
      return ifLet(...)(state, action, deps);
  }
};
```

---

### StackAction

Action type for managing navigation stacks.

```typescript
type StackAction<T> =
  | { readonly type: 'push'; readonly state: unknown }
  | { readonly type: 'pop' }
  | { readonly type: 'popToRoot' }
  | { readonly type: 'setPath'; readonly path: readonly unknown[] }
  | { readonly type: 'screen'; readonly index: number; readonly action: PresentationAction<T> }
```

**Helpers:**

```typescript
StackAction.push<T>(state: unknown): StackAction<T>
StackAction.pop<T>(): StackAction<T>
StackAction.popToRoot<T>(): StackAction<T>
StackAction.setPath<T>(path: readonly unknown[]): StackAction<T>
StackAction.screen<T>(index: number, action: PresentationAction<T>): StackAction<T>
```

**Example:**

```typescript
type WizardAction =
  | { type: 'nextButtonTapped' }
  | { type: 'backButtonTapped' }
  | { type: 'stack'; action: StackAction<ScreenAction> };

const reducer: Reducer<WizardState, WizardAction> = (state, action, deps) => {
  switch (action.type) {
    case 'nextButtonTapped':
      return push(state.stack, nextScreenState);

    case 'backButtonTapped':
      return pop(state.stack);

    case 'stack':
      return handleStackAction(state, action, deps, screenReducer);
  }
};
```

---

### ifLet

Compose a child reducer that operates on optional state.

```typescript
function ifLet<ParentState, ParentAction, ChildState, ChildAction, Dependencies = any>(
  toChildState: StateLens<ParentState, ChildState | null>,
  fromChildState: StateUpdater<ParentState, ChildState | null>,
  toChildAction: ActionPrism<ParentAction, ChildAction>,
  fromChildAction: ActionEmbedder<ParentAction, ChildAction>,
  childReducer: Reducer<ChildState, ChildAction, Dependencies>
): Reducer<ParentState, ParentAction, Dependencies>
```

**Parameters:**
- `toChildState` - Extract optional child state from parent state
- `fromChildState` - Update parent with new child state (or null to dismiss)
- `toChildAction` - Extract child action from parent action (returns null if not applicable)
- `fromChildAction` - Wrap child action into parent action
- `childReducer` - The child reducer to compose

**Returns:** Parent reducer that handles optional child state

**Use for:** Navigation scenarios (modal, drawer, sheet) where child may or may not exist.

**Pattern:**
- Non-null child state → child feature is presented
- Null child state → child feature is dismissed

**Example:**

```typescript
interface ParentState {
  destination: AddItemState | null;
}

type ParentAction =
  | { type: 'addButtonTapped' }
  | { type: 'destination'; action: PresentationAction<AddItemAction> };

const reducer: Reducer<ParentState, ParentAction> = (state, action, deps) => {
  switch (action.type) {
    case 'addButtonTapped':
      return [{ ...state, destination: { item: '', quantity: 0 } }, Effect.none()];

    case 'destination':
      if (action.action.type === 'dismiss') {
        return [{ ...state, destination: null }, Effect.none()];
      }

      return ifLet(
        (s) => s.destination,
        (s, d) => ({ ...s, destination: d }),
        (a) => a.type === 'destination' && a.action.type === 'presented' ? a.action.action : null,
        (ca) => ({ type: 'destination', action: PresentationAction.presented(ca) }),
        addItemReducer
      )(state, action, deps);
  }
};
```

---

### ifLetPresentation

Helper for common case where child actions are wrapped in PresentationAction.

```typescript
function ifLetPresentation<ParentState, ParentAction, ChildState, ChildAction, ActionType extends string, Dependencies = any>(
  toChildState: StateLens<ParentState, ChildState | null>,
  fromChildState: StateUpdater<ParentState, ChildState | null>,
  actionType: ActionType,
  fromChildAction: (action: ChildAction) => ParentAction,
  childReducer: Reducer<ChildState, ChildAction, Dependencies>
): Reducer<ParentState, ParentAction, Dependencies>
```

**Parameters:**
- `toChildState` - Extract optional child state from parent state
- `fromChildState` - Update parent with new child state (or null to dismiss)
- `actionType` - The parent action type string to match
- `fromChildAction` - Wrap child action into parent action
- `childReducer` - The child reducer to compose

**Returns:** Parent reducer

**Benefits:** Automatically unwraps `PresentationAction.presented` and handles `PresentationAction.dismiss`.

**Example:**

```typescript
const reducer = ifLetPresentation(
  (s) => s.destination,
  (s, d) => ({ ...s, destination: d }),
  'destination',
  (ca) => ({ type: 'destination', action: { type: 'presented', action: ca } }),
  addItemReducer
);
```

---

### createDestinationReducer

Create a reducer that routes actions to destination cases.

```typescript
function createDestinationReducer<State extends { type: string; state: any }, Action, Dependencies = any>(
  cases: {
    [K in State['type']]: Reducer<
      Extract<State, { type: K }>['state'],
      Action,
      Dependencies
    >
  }
): Reducer<State, Action, Dependencies>
```

**Parameters:**
- `cases` - Map of case types to reducers

**Returns:** Destination reducer

**Example:**

```typescript
type DestinationState =
  | { type: 'addItem'; state: AddItemState }
  | { type: 'editItem'; state: EditItemState };

const destinationReducer = createDestinationReducer<
  DestinationState,
  PresentationAction<AddItemAction | EditItemAction>
>({
  addItem: (state, action) => addItemReducer(state, action, deps),
  editItem: (state, action) => editItemReducer(state, action, deps)
});
```

---

### createDestination

Create a destination builder from a map of child reducers (DSL).

```typescript
function createDestination<Reducers extends Record<string, Reducer<any, any, any>>>(
  reducers: Reducers
): Destination<Reducers>
```

**Parameters:**
- `reducers` - Map of case types to their reducers

**Returns:** Destination object with reducer and helper methods

**Benefits:**
- 85% less boilerplate than manual pattern
- Full type inference
- Type-safe matcher APIs with autocomplete

**Example:**

```typescript
// 1. Define child reducers
const addItemReducer: Reducer<AddItemState, AddItemAction> = ...;
const editItemReducer: Reducer<EditItemState, EditItemAction> = ...;

// 2. Create destination (types inferred automatically!)
const Destination = createDestination({
  addItem: addItemReducer,
  editItem: editItemReducer
});

// 3. Use generated reducer in parent
const parentReducer: Reducer<ParentState, ParentAction> = (state, action, deps) => {
  switch (action.type) {
    case 'destination':
      return ifLetPresentation(
        (s) => s.destination,
        (s, d) => ({ ...s, destination: d }),
        'destination',
        (ca) => ({ type: 'destination', action: ca }),
        Destination.reducer  // Auto-generated!
      )(state, action, deps);
  }
};

// 4. Use helpers
const initial = Destination.initial('addItem', { name: '', quantity: 0 });
const addState = Destination.extract(state.destination, 'addItem');
```

**Destination Methods:**

```typescript
interface Destination<Reducers> {
  // Auto-generated reducer
  readonly reducer: Reducer<DestinationState<Reducers>, DestinationAction<Reducers>, any>;

  // Create initial destination state
  initial<K extends keyof Reducers>(
    caseType: K,
    state: ExtractState<Reducers[K]>
  ): DestinationState<Reducers>;

  // Extract child state by case type
  extract<K extends keyof Reducers>(
    state: DestinationState<Reducers> | null,
    caseType: K
  ): ExtractState<Reducers[K]> | null;

  // Check if action matches case path
  is(action: unknown, casePath: string): boolean;

  // Atomic match + extract
  matchCase<K extends keyof Reducers>(
    action: unknown,
    state: DestinationState<Reducers> | null,
    casePath: string
  ): ExtractState<Reducers[K]> | null;

  // Multi-case matching with handlers
  match<T>(
    action: unknown,
    state: DestinationState<Reducers> | null,
    handlers: Record<string, (childState: any) => T>
  ): { matched: true; value: T } | { matched: false };
}
```

---

### Navigation Helpers

#### isDestinationType

Check if destination state matches a specific case type.

```typescript
function isDestinationType<State extends { type: string }>(
  state: State | null,
  type: State['type']
): boolean
```

---

#### extractDestinationState

Extract child state by case type.

```typescript
function extractDestinationState<State extends { type: string; state: any }, CaseType extends State['type']>(
  state: State | null,
  caseType: CaseType
): Extract<State, { type: CaseType }>['state'] | null
```

---

#### matchPresentationAction

Match presentation action and extract child action.

```typescript
function matchPresentationAction<T>(
  action: PresentationAction<T>
): T | null
```

---

#### isActionAtPath

Check if action matches a case path.

```typescript
function isActionAtPath(action: unknown, casePath: string): boolean
```

---

#### matchPaths

Match action against multiple case paths.

```typescript
function matchPaths<T>(
  action: unknown,
  handlers: Record<string, () => T>
): { matched: true; value: T } | { matched: false }
```

---

#### extractDestinationOnAction

Extract destination state when action matches.

```typescript
function extractDestinationOnAction<State extends { type: string; state: any }>(
  action: unknown,
  state: State | null,
  casePath: string
): State['state'] | null
```

---

### Stack Helpers

#### push

Push a new screen onto the stack.

```typescript
function push<T>(stack: T[], screen: T): [T[], Effect<any>]
```

---

#### pop

Pop the top screen from the stack.

```typescript
function pop<T>(stack: T[]): [T[], Effect<any>]
```

---

#### popToRoot

Pop all screens except the root.

```typescript
function popToRoot<T>(stack: T[]): [T[], Effect<any>]
```

---

#### setPath

Replace the entire stack path.

```typescript
function setPath<T>(stack: T[], path: T[]): [T[], Effect<any>]
```

---

#### handleStackAction

Handle stack actions in reducer.

```typescript
function handleStackAction<State, ScreenState, ScreenAction, Dependencies>(
  state: State & { stack: ScreenState[] },
  action: { type: 'stack'; action: StackAction<ScreenAction> },
  dependencies: Dependencies,
  screenReducer: Reducer<ScreenState, ScreenAction, Dependencies>
): [State, Effect<any>]
```

---

#### topScreen

Get the top screen from the stack.

```typescript
function topScreen<T>(stack: T[]): T | null
```

---

#### rootScreen

Get the root screen from the stack.

```typescript
function rootScreen<T>(stack: T[]): T | null
```

---

#### canGoBack

Check if stack can go back.

```typescript
function canGoBack<T>(stack: T[]): boolean
```

---

#### stackDepth

Get the depth of the stack.

```typescript
function stackDepth<T>(stack: T[]): number
```

---

### Scoped Store Helpers

#### scopeToDestination

Create a scoped store for a specific destination case.

```typescript
function scopeToDestination<State, Action, DestState extends { type: string; state: any }, CaseType extends DestState['type']>(
  store: Store<State, Action>,
  toDestination: (state: State) => DestState | null,
  caseType: CaseType
): Store<Extract<DestState, { type: CaseType }>['state'] | null, Action>
```

---

#### scopeToOptional

Create a scoped store for optional state.

```typescript
function scopeToOptional<State, Action, ChildState>(
  store: Store<State, Action>,
  toChild: (state: State) => ChildState | null
): Store<ChildState | null, Action>
```

---

### Dismiss Dependency

#### createDismissDependency

Create a dismiss dependency for child features.

```typescript
function createDismissDependency<Action>(
  createDismissAction: () => Action
): DismissDependency<Action>
```

**Returns:** Object with `dismiss()` method

**Example:**

```typescript
const dismissDep = createDismissDependency(() => ({
  type: 'destination',
  action: PresentationAction.dismiss()
}));

// In child reducer
const childReducer: Reducer<ChildState, ChildAction, { dismiss: DismissDependency }> = (state, action, deps) => {
  switch (action.type) {
    case 'cancelButtonTapped':
      return [state, Effect.run(async (dispatch) => {
        deps.dismiss.dismiss(dispatch);
      })];
  }
};
```

---

#### createDismissDependencyWithCleanup

Create a dismiss dependency with cleanup effect.

```typescript
function createDismissDependencyWithCleanup<Action>(
  createDismissAction: () => Action,
  cleanupEffect: Effect<Action>
): DismissDependency<Action>
```

---

#### dismissDependency

Pre-configured dismiss dependency constant.

```typescript
const dismissDependency: DismissDependency<PresentationAction<any>>
```

---

### Type Definitions

#### PresentationState

Presentation lifecycle state for animated presentations.

```typescript
type PresentationState<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'presenting'; readonly content: T; readonly duration?: number }
  | { readonly status: 'presented'; readonly content: T }
  | { readonly status: 'dismissing'; readonly content: T; readonly duration?: number }
```

**States:**
- `idle` - Nothing is being presented
- `presenting` - Animation in progress (animating IN)
- `presented` - Animation complete, content fully visible
- `dismissing` - Animation in progress (animating OUT)

---

#### PresentationEvent

Events for presentation lifecycle transitions.

```typescript
type PresentationEvent =
  | { readonly type: 'presentationStarted' }
  | { readonly type: 'presentationCompleted' }
  | { readonly type: 'dismissalStarted' }
  | { readonly type: 'dismissalCompleted' }
  | { readonly type: 'presentationTimeout' }
  | { readonly type: 'dismissalTimeout' }
```

---

#### DestinationState

Extract state union from a map of reducers.

```typescript
type DestinationState<Reducers extends Record<string, (s: any, a: any, d: any) => any>> = {
  [K in keyof Reducers]: {
    readonly type: K;
    readonly state: Reducers[K] extends (s: infer S, a: any, d: any) => any ? S : never;
  };
}[keyof Reducers]
```

---

#### DestinationAction

Extract action union from a map of reducers.

```typescript
type DestinationAction<Reducers extends Record<string, (s: any, a: any, d: any) => any>> = {
  [K in keyof Reducers]: {
    readonly type: K;
    readonly action: PresentationAction<Reducers[K] extends (s: any, a: infer A, d: any) => any ? A : never>;
  };
}[keyof Reducers]
```

---

#### CasePath

Extract all valid case paths from a destination state union.

```typescript
type CasePath<State extends { type: string }> = string  // Template literal paths like "addItem.saveButtonTapped"
```

---

## Dependencies

Injectable dependencies for reducers.

### Clock

Time operations interface.

```typescript
interface Clock {
  now(): Date;
  setTimeout(callback: () => void, ms: number): number;
  clearTimeout(id: number): void;
}
```

---

### createSystemClock

Create a clock that uses system time.

```typescript
function createSystemClock(): Clock
```

**Example:**

```typescript
const clock = createSystemClock();
const now = clock.now();
const timerId = clock.setTimeout(() => console.log('Done'), 1000);
```

---

### createMockClock

Create a mock clock for testing.

```typescript
function createMockClock(initialTime?: Date): MockClock
```

**Returns:** MockClock with additional control methods

**Example:**

```typescript
const clock = createMockClock(new Date('2024-01-01'));

// Advance time
clock.advance(1000);  // +1 second

// Run pending timers
clock.runAll();

// Check current time
expect(clock.now()).toEqual(new Date('2024-01-01T00:00:01Z'));
```

---

### Storage

Async storage interface.

```typescript
interface Storage<T = any> {
  getItem(key: string): Promise<T | null>;
  setItem(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
  subscribe(listener: StorageEventListener<T>): Unsubscribe;
}
```

---

### createLocalStorage

Create localStorage wrapper.

```typescript
function createLocalStorage<T = any>(config?: StorageConfig<T>): Storage<T>
```

**Config:**
- `prefix` - Key prefix (default: '')
- `serialize` - Custom serializer (default: JSON.stringify)
- `deserialize` - Custom deserializer (default: JSON.parse)
- `validate` - Schema validator

**Example:**

```typescript
const storage = createLocalStorage<UserData>({
  prefix: 'app:',
  validate: (data) => {
    if (!data.id || !data.name) {
      throw new Error('Invalid user data');
    }
  }
});

await storage.setItem('user', { id: 1, name: 'Alice' });
const user = await storage.getItem('user');
```

---

### createSessionStorage

Create sessionStorage wrapper.

```typescript
function createSessionStorage<T = any>(config?: StorageConfig<T>): Storage<T>
```

**Usage:** Same as `createLocalStorage` but uses sessionStorage.

---

### createNoopStorage

Create a no-op storage (for SSR or testing).

```typescript
function createNoopStorage<T = any>(): Storage<T>
```

---

### CookieStorage

Cookie storage interface.

```typescript
interface CookieStorage<T = any> extends Storage<T> {
  getItem(key: string): Promise<T | null>;
  setItem(key: string, value: T, options?: CookieOptions): Promise<void>;
}
```

---

### createCookieStorage

Create cookie storage wrapper.

```typescript
function createCookieStorage<T = any>(config?: CookieConfig<T>): CookieStorage<T>
```

**Config:**
- `prefix` - Cookie name prefix (default: '')
- `serialize` - Custom serializer (default: JSON.stringify)
- `deserialize` - Custom deserializer (default: JSON.parse)
- `defaultOptions` - Default cookie options (path, domain, secure, etc.)

**Example:**

```typescript
const storage = createCookieStorage<UserPrefs>({
  prefix: 'app:',
  defaultOptions: {
    path: '/',
    secure: true,
    sameSite: 'strict',
    maxAge: 86400  // 1 day
  }
});

await storage.setItem('prefs', { theme: 'dark' });
const prefs = await storage.getItem('prefs');
```

---

### createMockCookieStorage

Create mock cookie storage for testing.

```typescript
function createMockCookieStorage<T = any>(): CookieStorage<T>
```

---

### Utility Functions

#### isBrowser

Check if running in browser environment.

```typescript
function isBrowser(): boolean
```

---

#### getStorageQuota

Get storage quota information.

```typescript
function getStorageQuota(): Promise<{
  usage: number;
  quota: number;
  percentUsed: number;
}>
```

---

#### getByteSize

Get byte size of a value.

```typescript
function getByteSize(value: any): number
```

---

#### isStorageAvailable

Check if storage is available.

```typescript
function isStorageAvailable(type: 'localStorage' | 'sessionStorage'): boolean
```

---

### Error Classes

#### DependencyError

Base error for dependency-related errors.

```typescript
class DependencyError extends Error {
  constructor(message: string, options?: { cause?: unknown })
}
```

---

#### StorageQuotaExceededError

Thrown when storage quota is exceeded.

```typescript
class StorageQuotaExceededError extends DependencyError
```

---

#### InvalidJSONError

Thrown when JSON parsing fails.

```typescript
class InvalidJSONError extends DependencyError
```

---

#### SchemaValidationError

Thrown when schema validation fails.

```typescript
class SchemaValidationError extends DependencyError
```

---

#### CookieSizeExceededError

Thrown when cookie size exceeds limit (4KB).

```typescript
class CookieSizeExceededError extends DependencyError
```

---

#### EnvironmentNotSupportedError

Thrown when environment doesn't support required features.

```typescript
class EnvironmentNotSupportedError extends DependencyError
```

---

## Testing

### TestStore

Specialized store for testing reducers and effects.

```typescript
class TestStore<State, Action, Dependencies = any> {
  exhaustivity: 'on' | 'off';

  constructor(config: TestStoreConfig<State, Action, Dependencies>);

  send(action: Action, assert?: StateAssertion<State>): Promise<void>;
  receive(partialAction: PartialAction<Action>, assert?: StateAssertion<State>, timeout?: number): Promise<void>;
  assertNoPendingActions(): void;
  finish(): Promise<void>;
  getState(): State;
  getHistory(): ReadonlyArray<Action>;
  advanceTime(ms: number): Promise<void>;
}
```

**Features:**
- send/receive pattern for asserting effect-dispatched actions
- Exhaustiveness checking (ensures all actions are asserted)
- Synchronous and async action handling
- Fake timer support for testing time-based effects

**Example:**

```typescript
const store = createTestStore({
  initialState: { count: 0 },
  reducer: counterReducer
});

// Send user action
await store.send({ type: 'incrementTapped' }, (state) => {
  expect(state.count).toBe(1);
});

// Receive effect-dispatched action
await store.receive({ type: 'animationCompleted' }, (state) => {
  expect(state.isAnimating).toBe(false);
});

// Assert all actions handled
store.assertNoPendingActions();
```

---

### createTestStore

Create a TestStore (convenience function).

```typescript
function createTestStore<State, Action, Dependencies = any>(
  config: TestStoreConfig<State, Action, Dependencies>
): TestStore<State, Action, Dependencies>
```

**Config:**
- `initialState` - Initial state
- `reducer` - The reducer to test
- `dependencies` - Optional dependencies to inject

**Example:**

```typescript
const store = createTestStore({
  initialState: initialState,
  reducer: myReducer,
  dependencies: { apiClient: mockApiClient }
});
```

---

### Testing Time-Based Effects

TestStore integrates with Vitest's fake timers.

**Setup:**

```typescript
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
});
```

**Example:**

```typescript
it('shows tooltip after delay', async () => {
  const store = createTestStore({
    initialState: initialTooltipState,
    reducer: tooltipReducer,
    dependencies: { hoverDelay: 300 }
  });

  // User hovers
  await store.send({ type: 'hoverStarted', content: 'Save' }, (state) => {
    expect(state.isWaitingToShow).toBe(true);
  });

  // Advance time to trigger delay effect
  await store.advanceTime(300);

  // Delay effect fires delayCompleted action
  await store.receive({ type: 'delayCompleted' }, (state) => {
    expect(state.isWaitingToShow).toBe(false);
    expect(state.presentation.status).toBe('presenting');
  });

  // Advance time for animation duration
  await store.advanceTime(150);

  await store.receive({
    type: 'presentation',
    event: { type: 'presentationCompleted' }
  }, (state) => {
    expect(state.presentation.status).toBe('presented');
  });

  await store.finish(); // Verify no pending actions
});
```

---

### Type Definitions

#### TestStoreConfig

Configuration for TestStore.

```typescript
interface TestStoreConfig<State, Action, Dependencies = any> {
  initialState: State;
  reducer: Reducer<State, Action, Dependencies>;
  dependencies?: Dependencies;
}
```

---

#### StateAssertion

Assertion function for state.

```typescript
type StateAssertion<State> = (state: State) => void | Promise<void>
```

---

#### PartialAction

Partial action matcher for receive assertions.

```typescript
type PartialAction<Action> = Partial<Action> & { type: string }
```

**Note:** Partial matching with nested objects works best with type-only matching. For complex nested structures, prefer state assertions:

```typescript
// Recommended
await store.receive({ type: 'actionName' });
expect(store.getState().someField).toBe(expectedValue);

// Avoid (may not work reliably in browser tests)
await store.receive({ type: 'actionName', nested: { field: 'value' } });
```

---

## Additional Resources

- **GitHub**: https://github.com/[your-org]/composable-svelte
- **Documentation**: https://composable-svelte.dev
- **Examples**: https://github.com/[your-org]/composable-svelte/tree/main/examples

---

## License

MIT © [Your Name]
