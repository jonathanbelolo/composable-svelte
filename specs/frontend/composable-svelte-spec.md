# Composable Svelte Specification

**Version:** 1.0.0
**Date:** 2025-10-25
**Status:** Draft

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Background Knowledge](#background-knowledge)
3. [Motivation](#motivation)
4. [Core Concepts](#core-concepts)
5. [Architecture Overview](#architecture-overview)
6. [Type System](#type-system)
7. [Core API Specification](#core-api-specification)
8. [Composition Patterns](#composition-patterns)
9. [Dependency Injection](#dependency-injection)
10. [Testing Framework](#testing-framework)
11. [Integration with Svelte 5](#integration-with-svelte-5)
12. [Implementation Examples](#implementation-examples)
13. [Best Practices](#best-practices)
14. [Advanced Features](#advanced-features)
15. [Migration Guide](#migration-guide)

---

## 1. Executive Summary

**Composable Svelte** is an architectural framework for building Svelte 5 applications using principles from:
- **Event-Driven Architecture (EDA)**
- **Command Query Responsibility Segregation (CQRS)**
- **Functional Programming (FP)**
- **The Composable Architecture (TCA)** from Swift

The framework provides:
- Predictable state management through pure reducers
- Unidirectional data flow via actions (events)
- Type-safe feature composition
- First-class testing support
- Declarative side effect handling
- Full integration with Svelte 5's reactivity system

---

## 2. Background Knowledge

### 2.1 Event-Driven Architecture (EDA)

**Definition:** A software architecture paradigm where the flow of the program is determined by events - occurrences or changes in state.

**Key Concepts:**
- **Events:** Notifications that something has happened (past tense)
- **Event Producers:** Components that generate events
- **Event Consumers:** Components that react to events
- **Event Flow:** Unidirectional flow from producer to consumer

**Example:**
```typescript
// Event: Something that happened
type UserClickedButton = { type: 'buttonClicked'; timestamp: number };

// Producer: User interaction
button.addEventListener('click', () => {
  emit({ type: 'buttonClicked', timestamp: Date.now() });
});

// Consumer: State update
function handleEvent(event: UserClickedButton) {
  updateState(event);
}
```

**Benefits:**
- Loose coupling between components
- Easy to add new event handlers
- Clear audit trail of what happened
- Supports event sourcing and replay

### 2.2 Command Query Responsibility Segregation (CQRS)

**Definition:** A pattern that separates read operations (queries) from write operations (commands).

**Key Concepts:**

**Commands (Write Side):**
- Express intent to change state
- Validated before execution
- May fail or succeed
- Often result in events being raised

**Queries (Read Side):**
- Retrieve data without side effects
- Can be optimized independently
- Read-only access to state
- May use different data models than writes

**Example:**
```typescript
// Command: Intent to change state
type IncrementCounter = { type: 'increment'; amount: number };

// Command Handler: Validates and executes
function handleCommand(state: State, cmd: IncrementCounter): [State, Event] {
  if (cmd.amount < 0) throw new Error('Invalid amount');
  const newState = { ...state, count: state.count + cmd.amount };
  return [newState, { type: 'counterIncremented', amount: cmd.amount }];
}

// Query: Read-only access
function getCount(state: State): number {
  return state.count; // No mutations
}
```

**Benefits:**
- Clear separation of concerns
- Optimized read and write paths
- Prevents accidental mutations during reads
- Easier to reason about data flow

### 2.3 Functional Programming (FP)

**Definition:** A programming paradigm that treats computation as the evaluation of mathematical functions and avoids changing state and mutable data.

**Key Concepts:**

**Pure Functions:**
Functions that:
- Always return the same output for the same input
- Have no side effects
- Don't mutate external state

```typescript
// Pure: Same input always produces same output
function add(a: number, b: number): number {
  return a + b;
}

// Impure: Depends on external state
let total = 0;
function addToTotal(value: number): number {
  total += value; // Side effect: mutation
  return total;
}
```

**Immutability:**
Data that cannot be changed after creation.

```typescript
// Mutable (avoid)
const state = { count: 0 };
state.count++; // Mutation

// Immutable (preferred)
const state = { count: 0 };
const newState = { ...state, count: state.count + 1 }; // New object
```

**Higher-Order Functions:**
Functions that take functions as arguments or return functions.

```typescript
function map<A, B>(arr: A[], fn: (a: A) => B): B[] {
  return arr.map(fn);
}

const numbers = [1, 2, 3];
const doubled = map(numbers, n => n * 2); // [2, 4, 6]
```

**Function Composition:**
Combining simple functions to build complex operations.

```typescript
const addOne = (x: number) => x + 1;
const double = (x: number) => x * 2;
const compose = (f, g) => (x) => f(g(x));

const addOneThenDouble = compose(double, addOne);
addOneThenDouble(3); // 8 (3 + 1 = 4, 4 * 2 = 8)
```

**Benefits:**
- Easier to test (pure functions)
- Easier to reason about (no hidden state)
- Supports parallel execution (no shared state)
- Enables time-travel debugging (immutable history)

### 2.4 The Composable Architecture (TCA)

**Definition:** A Swift library for building applications with consistency, testability, and composability as core principles.

**Key Concepts:**

**State:**
A type describing the data needed for a feature.

```swift
struct CounterState: Equatable {
  var count: Int = 0
  var isLoading: Bool = false
}
```

**Action:**
An enum representing all possible events.

```swift
enum CounterAction {
  case increment
  case decrement
  case loadData
  case dataLoaded(Result<Data, Error>)
}
```

**Reducer:**
A pure function that transforms state based on actions.

```swift
let reducer = Reducer<CounterState, CounterAction, Environment> {
  state, action, environment in

  switch action {
  case .increment:
    state.count += 1
    return .none

  case .loadData:
    return environment.apiClient.fetch()
      .map(CounterAction.dataLoaded)
      .eraseToEffect()
  }
}
```

**Store:**
The runtime that drives the feature.

```swift
let store = Store(
  initialState: CounterState(),
  reducer: reducer,
  environment: Environment.live
)
```

**Effect:**
A declarative description of work to be done.

```swift
return Effect.run { send in
  let data = try await apiClient.fetch()
  await send(.dataLoaded(.success(data)))
}
```

**Benefits:**
- Features compose at all scales
- Comprehensive testing support
- Clear separation of logic and side effects
- Type-safe composition
- Predictable state management

---

## 3. Motivation

### 3.1 Problems with Traditional Svelte State Management

**1. Implicit Reactivity:**
In traditional Svelte, any assignment triggers reactivity. This makes it hard to:
- Track when and why state changed
- Test state transitions in isolation
- Implement undo/redo or time-travel debugging
- Audit state changes for compliance

```svelte
<script>
  let count = 0;

  // Hard to test: Where did this mutation come from?
  // Hard to audit: No record of state changes
  function increment() {
    count++; // Implicit reactivity
  }
</script>
```

**2. Scattered Business Logic:**
State mutations can happen anywhere in the component tree:
- Hard to find where state changes
- Difficult to enforce validation rules
- Complex to coordinate multiple state updates
- No single source of truth for business logic

**3. Testing Challenges:**
- Components tightly coupled to UI
- Hard to test business logic in isolation
- Side effects (API calls, timers) hard to mock
- Async testing is complex and flaky

**4. Composition Difficulties:**
- No standard pattern for composing features
- Parent-child communication via props and events is verbose
- Shared state requires stores or context (global state)
- Hard to split large features into smaller modules

### 3.2 What Composable Svelte Solves

**1. Explicit State Changes:**
All state changes go through actions, creating a clear audit trail.

```typescript
// Clear: Every state change has an explicit action
dispatch({ type: 'increment' });
dispatch({ type: 'userLoggedIn', userId: '123' });
```

**2. Centralized Business Logic:**
All business logic lives in reducers - pure, testable functions.

```typescript
// Single source of truth for business logic
const reducer = (state, action) => {
  switch (action.type) {
    case 'increment':
      return [{ ...state, count: state.count + 1 }, Effect.none()];
  }
};
```

**3. First-Class Testing:**
TestStore enables comprehensive, deterministic testing.

```typescript
const store = new TestStore({ initialState, reducer });
await store.send({ type: 'increment' }, (state) => {
  expect(state.count).toBe(1);
});
```

**4. Type-Safe Composition:**
Features compose predictably with full type safety.

```typescript
// Child features compose into parent features
const appReducer = combineReducers({
  counter: counterReducer,
  todos: todosReducer
});
```

**5. Declarative Side Effects:**
Effects are values, not executions - easy to test and compose.

```typescript
// Effect is a value describing work to do
return Effect.run(async (dispatch) => {
  const data = await api.fetch();
  dispatch({ type: 'dataLoaded', data });
});
```

### 3.3 Design Goals

1. **Leverage Svelte 5 Reactivity:** Don't fight Svelte - integrate with $state and $derived
2. **Type Safety:** Full TypeScript support with discriminated unions
3. **Minimal Boilerplate:** Keep it concise while maintaining structure
4. **Developer Experience:** Great IDE support, clear error messages
5. **Performance:** Leverage Svelte's compiler for optimal runtime performance
6. **Testing-First:** Make testing easy and comprehensive
7. **Functional Core, Imperative Shell:** Pure logic core, side effects at the edges

---

## 4. Core Concepts

### 4.1 State

**Definition:** An immutable value type describing all data needed for a feature to perform its logic and render its UI.

**Requirements:**
- MUST be a plain TypeScript interface or type
- MUST be serializable to JSON (no functions, classes with methods, etc.)
- SHOULD use primitive types when possible
- SHOULD be Equatable for optimization

**Example:**
```typescript
interface CounterState {
  count: number;
  isLoading: boolean;
  error: string | null;
  fact: string | null;
  lastUpdated: string; // ISO timestamp
}

const initialState: CounterState = {
  count: 0,
  isLoading: false,
  error: null,
  fact: null,
  lastUpdated: new Date().toISOString()
};
```

**Best Practices:**
- Keep state flat when possible
- Use nullable types for optional data
- Avoid nested arrays of objects (use normalized structure)
- Use discriminated unions for complex states

```typescript
// Bad: Nested, hard to update
interface BadState {
  users: {
    id: string;
    profile: {
      name: string;
      settings: {
        theme: string;
      }
    }
  }[];
}

// Good: Flat, normalized
interface GoodState {
  userIds: string[];
  usersById: Record<string, User>;
  profilesById: Record<string, Profile>;
  settingsById: Record<string, Settings>;
}
```

### 4.2 Action

**Definition:** A discriminated union type representing all possible events that can occur in a feature.

**Requirements:**
- MUST use discriminated unions with a `type` field
- MUST use past tense for events ("clicked", "loaded", "failed")
- SHOULD carry minimal data (use IDs, not full objects)
- MUST be serializable to JSON

**Example:**
```typescript
type CounterAction =
  | { type: 'incrementTapped' }
  | { type: 'decrementTapped' }
  | { type: 'resetTapped' }
  | { type: 'setCount'; value: number }
  | { type: 'loadFactTapped' }
  | { type: 'factLoaded'; fact: string }
  | { type: 'factLoadFailed'; error: string };
```

**Naming Conventions:**
- User interactions without ambiguity: `[verb]Tapped` (e.g., `incrementTapped`, `decrementTapped`, `resetTapped`)
- User interactions with specific UI element: `[element][Verb]Tapped` (e.g., `addButtonTapped`, `closeButtonTapped`, `saveButtonTapped`)
- User interactions on domain objects: `[verb][Noun]Tapped` (e.g., `loadFactTapped`, `addTodoTapped`, `removeTodoTapped`)
- System events: `[noun][Verb]ed` (e.g., `dataLoaded`, `timerFired`, `factLoaded`)
- State changes: `[noun][Verb]ed` (e.g., `todoToggled`, `filterChanged`, `textChanged`)

**Best Practices:**
- Group related actions with a common prefix
- Use literal types for the discriminator
- Include context needed for the reducer

```typescript
// Good: Clear, grouped, contextual
type TodoAction =
  | { type: 'todo/addTapped'; text: string }
  | { type: 'todo/removed'; id: string }
  | { type: 'todo/toggled'; id: string }
  | { type: 'todo/textChanged'; id: string; text: string }
  | { type: 'todos/loaded'; todos: Todo[] }
  | { type: 'todos/loadFailed'; error: string };
```

### 4.3 Reducer

**Definition:** A pure function that takes the current state and an action, and returns a tuple of new state and an effect.

**Type Signature:**
```typescript
type Reducer<State, Action, Dependencies = any> = (
  state: State,
  action: Action,
  dependencies: Dependencies
) => readonly [State, Effect<Action>];
```

**Requirements:**
- MUST be pure (no side effects)
- MUST NOT mutate the input state
- MUST return a new state object (or same reference if unchanged)
- MUST return an Effect (even if Effect.none())
- SHOULD handle all action types exhaustively

**Example:**
```typescript
const counterReducer: Reducer<CounterState, CounterAction> = (state, action) => {
  switch (action.type) {
    case 'incrementTapped':
      return [
        { ...state, count: state.count + 1 },
        Effect.none()
      ];

    case 'decrementTapped':
      return [
        { ...state, count: state.count - 1 },
        Effect.none()
      ];

    case 'loadFactTapped':
      return [
        { ...state, isLoading: true, error: null },
        Effect.run(async (dispatch) => {
          try {
            const response = await fetch(`/api/fact/${state.count}`);
            const fact = await response.text();
            dispatch({ type: 'factLoaded', fact });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            dispatch({ type: 'factLoadFailed', error: message });
          }
        })
      ];

    case 'factLoaded':
      return [
        { ...state, isLoading: false, fact: action.fact },
        Effect.none()
      ];

    case 'factLoadFailed':
      return [
        { ...state, isLoading: false, error: action.error },
        Effect.none()
      ];

    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = action;
      return [state, Effect.none()];
  }
};
```

**Best Practices:**
- Use switch statements for exhaustiveness checking
- Keep reducers focused (one concern)
- Extract complex logic into helper functions
- Return the same state reference if nothing changed (optimization)

```typescript
// Optimization: Return same reference if no change
case 'setCount':
  if (state.count === action.value) {
    return [state, Effect.none()]; // Same reference
  }
  return [
    { ...state, count: action.value },
    Effect.none()
  ];
```

### 4.4 Effect

**Definition:** A declarative, type-safe description of side effects to execute. Effects are values, not executions.

**Key Principle:** Effects describe WHAT to do, not HOW or WHEN. The Store executes them.

**Types of Effects:**

**1. None:** No side effects
```typescript
Effect.none()
```

**2. Run:** Execute async work and dispatch actions
```typescript
Effect.run(async (dispatch) => {
  const data = await api.fetch();
  dispatch({ type: 'dataLoaded', data });
})
```

**3. Batch:** Execute multiple effects
```typescript
Effect.batch(
  Effect.run(async (dispatch) => { /* ... */ }),
  Effect.run(async (dispatch) => { /* ... */ })
)
```

**4. Cancellable:** Effect that can be cancelled by ID
```typescript
Effect.cancellable('fetch-user', async (dispatch) => {
  const user = await api.fetchUser();
  dispatch({ type: 'userLoaded', user });
})
```

**5. Debounced:** Effect that debounces by ID
```typescript
Effect.debounced('search', 300, async (dispatch) => {
  const results = await api.search(query);
  dispatch({ type: 'resultsLoaded', results });
})
```

**6. Throttled:** Effect that throttles by ID
```typescript
Effect.throttled('scroll', 100, async (dispatch) => {
  dispatch({ type: 'scrollPositionUpdated', position: window.scrollY });
})
```

**7. AfterDelay:** Effect that executes after a delay
```typescript
Effect.afterDelay(300, (dispatch) => {
  dispatch({ type: 'animationCompleted' });
})
```

**Requirements:**
- MUST NOT execute immediately (declarative, not imperative)
- MUST be serializable for testing
- SHOULD have a unique ID for cancellation/deduplication
- MUST dispatch actions (not mutate state directly)

### 4.5 Store

**Definition:** The runtime that manages state, processes actions, and executes effects.

**Responsibilities:**
1. Hold the current state
2. Accept actions via dispatch
3. Run reducers to compute new state
4. Execute effects
5. Notify subscribers of state changes
6. Maintain action history for debugging

**Type Signature:**
```typescript
interface Store<State, Action> {
  readonly state: State;
  dispatch(action: Action): void;
  select<T>(selector: (state: State) => T): T;
  subscribe(listener: (state: State) => void): () => void;
  destroy(): void;
}
```

**Example:**
```typescript
const store = createStore({
  initialState,
  reducer: counterReducer,
  dependencies: {
    apiClient: liveAPIClient
  }
});

// Dispatch actions
store.dispatch({ type: 'incrementTapped' });

// Read state
console.log(store.state.count);

// Subscribe to changes
const unsubscribe = store.subscribe((state) => {
  console.log('State changed:', state);
});
```

---

## 5. Architecture Overview

### 5.1 Data Flow

```
User Interaction
      ↓
   Action (Event)
      ↓
    Store.dispatch()
      ↓
   Reducer (Pure Function)
      ↓
  [New State, Effect]
      ↓
  ├─→ State Update (Svelte reactivity)
  │        ↓
  │    UI Re-render
  │
  └─→ Effect Execution
           ↓
      Side Effects (API, timers, etc.)
           ↓
      New Actions Dispatched
           ↓
      (Loop back to Store.dispatch)
```

### 5.2 Layer Architecture

```
┌─────────────────────────────────────────────┐
│           Presentation Layer                 │
│         (Svelte Components)                  │
│  - UI rendering                              │
│  - Event handlers → dispatch actions         │
│  - Subscribe to state                        │
└─────────────────────────────────────────────┘
                    ↓ ↑
┌─────────────────────────────────────────────┐
│              Store Layer                     │
│  - Manage state lifecycle                    │
│  - Process actions through reducers          │
│  - Execute effects                           │
│  - Notify subscribers                        │
└─────────────────────────────────────────────┘
                    ↓ ↑
┌─────────────────────────────────────────────┐
│           Business Logic Layer               │
│            (Reducers)                        │
│  - Pure state transformations                │
│  - Validation logic                          │
│  - Effect descriptions                       │
└─────────────────────────────────────────────┘
                    ↓ ↑
┌─────────────────────────────────────────────┐
│         Side Effects Layer                   │
│           (Effects)                          │
│  - API calls                                 │
│  - Browser APIs                              │
│  - Timers, intervals                         │
│  - Local storage                             │
└─────────────────────────────────────────────┘
                    ↓ ↑
┌─────────────────────────────────────────────┐
│         Infrastructure Layer                 │
│         (Dependencies)                       │
│  - HTTP clients                              │
│  - WebSocket connections                     │
│  - Database clients                          │
│  - External services                         │
└─────────────────────────────────────────────┘
```

### 5.3 Module Organization

```
src/
├── lib/
│   └── composable/              # Core framework
│       ├── store.svelte.ts      # Store implementation with Svelte 5 $state
│       ├── effect.ts            # Effect types and constructors
│       ├── reducer.ts           # Reducer utilities
│       ├── scope.ts             # Composition helpers
│       ├── combine.ts           # Reducer combination utilities
│       ├── dependencies.ts      # Dependency injection system
│       ├── test.ts              # TestStore for testing
│       ├── middleware.ts        # Middleware support (logging, etc.)
│       └── types.ts             # Core type definitions
│
├── features/                    # Feature modules
│   ├── counter/
│   │   ├── state.ts            # State type and initial state
│   │   ├── actions.ts          # Action types
│   │   ├── reducer.ts          # Business logic
│   │   ├── reducer.test.ts     # Unit tests
│   │   ├── effects.ts          # Effect builders (optional)
│   │   └── Counter.svelte      # UI component
│   │
│   ├── todos/
│   │   ├── state.ts
│   │   ├── actions.ts
│   │   ├── reducer.ts
│   │   ├── reducer.test.ts
│   │   └── Todos.svelte
│   │
│   └── app/                    # Root feature (composition)
│       ├── state.ts            # Composed state
│       ├── actions.ts          # Composed actions
│       ├── reducer.ts          # Root reducer
│       └── App.svelte          # Root component
│
├── dependencies/               # Dependency implementations
│   ├── api-client.ts          # HTTP client
│   ├── storage.ts             # Local storage wrapper
│   ├── uuid.ts                # UUID generator
│   └── date.ts                # Date/time utilities
│
└── routes/                    # SvelteKit routes
    └── +page.svelte
```

---

## 6. Type System

### 6.1 Core Types

```typescript
// types.ts

/**
 * A function that transforms state based on an action.
 * MUST be pure (no side effects).
 * Returns [newState, effect].
 */
export type Reducer<State, Action, Dependencies = any> = (
  state: State,
  action: Action,
  dependencies: Dependencies
) => readonly [State, Effect<Action>];

/**
 * A function that dispatches an action.
 */
export type Dispatch<Action> = (action: Action) => void;

/**
 * A function that selects a value from state.
 */
export type Selector<State, Value> = (state: State) => Value;

/**
 * Configuration for creating a Store.
 */
export interface StoreConfig<State, Action, Dependencies = any> {
  initialState: State;
  reducer: Reducer<State, Action, Dependencies>;
  dependencies?: Dependencies;
  middleware?: Middleware<State, Action>[];
  devTools?: boolean;
}

/**
 * The Store interface - runtime for a feature.
 */
export interface Store<State, Action> {
  /**
   * Current state (read-only).
   * In Svelte 5, this uses $state for reactivity.
   */
  readonly state: State;

  /**
   * Dispatch an action to update state.
   */
  dispatch(action: Action): void;

  /**
   * Select a derived value from state (non-reactive).
   * Returns the current value but does NOT track changes.
   *
   * In Svelte 5 components, use $derived directly for reactive values:
   * const value = $derived(store.state.count);
   *
   * This method is primarily useful for:
   * - Selecting values in effects/callbacks
   * - One-time value extraction
   * - Testing
   */
  select<T>(selector: Selector<State, T>): T;

  /**
   * Subscribe to state changes.
   * Returns unsubscribe function.
   */
  subscribe(listener: (state: State) => void): () => void;

  /**
   * Subscribe to action dispatches.
   * Listener receives the action and the resulting state after reduction.
   * Required for Destination.on() reactive subscriptions.
   * Returns unsubscribe function.
   */
  subscribeToActions?(listener: (action: Action, state: State) => void): () => void;

  /**
   * Get action history (for debugging).
   */
  readonly history: ReadonlyArray<Action>;

  /**
   * Clean up resources.
   */
  destroy(): void;
}

/**
 * Middleware function for intercepting actions.
 */
export type Middleware<State, Action> = (
  store: MiddlewareAPI<State, Action>
) => (
  next: Dispatch<Action>
) => Dispatch<Action>;

export interface MiddlewareAPI<State, Action> {
  getState(): State;
  dispatch: Dispatch<Action>;
}
```

### 6.2 Effect Types

```typescript
// effect.ts

/**
 * Discriminated union of effect types.
 */
export type Effect<Action> =
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Run'; readonly execute: EffectExecutor<Action> }
  | { readonly _tag: 'Batch'; readonly effects: ReadonlyArray<Effect<Action>> }
  | { readonly _tag: 'Cancellable'; readonly id: string; readonly execute: EffectExecutor<Action> }
  | { readonly _tag: 'Debounced'; readonly id: string; readonly ms: number; readonly execute: EffectExecutor<Action> }
  | { readonly _tag: 'Throttled'; readonly id: string; readonly ms: number; readonly execute: EffectExecutor<Action> }
  | { readonly _tag: 'AfterDelay'; readonly ms: number; readonly execute: EffectExecutor<Action> }
  | { readonly _tag: 'FireAndForget'; readonly execute: () => void | Promise<void> };

/**
 * Function that executes an effect.
 * Can dispatch actions back to the store.
 */
export type EffectExecutor<Action> = (
  dispatch: Dispatch<Action>
) => void | Promise<void>;

/**
 * Result of an effect execution.
 */
export interface EffectResult {
  readonly id?: string;
  readonly cancel?: () => void;
}
```

### 6.3 Composition Types

```typescript
// scope.ts

/**
 * Lens for extracting child state from parent state.
 */
export type StateLens<ParentState, ChildState> = (
  parent: ParentState
) => ChildState;

/**
 * Function to update parent state with new child state.
 */
export type StateUpdater<ParentState, ChildState> = (
  parent: ParentState,
  child: ChildState
) => ParentState;

/**
 * Prism for extracting child action from parent action.
 */
export type ActionPrism<ParentAction, ChildAction> = (
  parent: ParentAction
) => ChildAction | null;

/**
 * Function to embed child action in parent action.
 */
export type ActionEmbedder<ParentAction, ChildAction> = (
  child: ChildAction
) => ParentAction;
```

### 6.4 Testing Types

```typescript
// test.ts

/**
 * Configuration for TestStore.
 */
export interface TestStoreConfig<State, Action, Dependencies = any> {
  initialState: State;
  reducer: Reducer<State, Action, Dependencies>;
  dependencies?: Dependencies;
}

/**
 * Assertion function for state.
 */
export type StateAssertion<State> = (state: State) => void | Promise<void>;

/**
 * Partial action matcher for receive assertions.
 */
export type PartialAction<Action> = Partial<Action> & { type: string };

/**
 * TestStore for testing reducers and effects.
 */
export interface TestStore<State, Action> {
  /**
   * Send an action and optionally assert state changes.
   */
  send(action: Action, assert?: StateAssertion<State>): Promise<void>;

  /**
   * Wait for and assert an action was received.
   */
  receive(action: PartialAction<Action>, assert?: StateAssertion<State>): Promise<void>;

  /**
   * Assert that no actions are pending.
   */
  assertNoPendingActions(): void;

  /**
   * Get current state.
   */
  getState(): State;

  /**
   * Get action history.
   */
  getHistory(): ReadonlyArray<Action>;

  /**
   * Advance virtual time (for testing timeouts/intervals).
   * Note: Requires fake timer implementation (e.g., vi.useFakeTimers() in Vitest)
   * to properly control debounced/throttled effects.
   */
  advanceTime(ms: number): Promise<void>;

  /**
   * Control exhaustiveness checking for received actions.
   * - 'on' (default): Fail test if actions are received but not asserted
   * - 'off': Allow unasserted actions (useful for testing partial flows)
   */
  exhaustivity: 'on' | 'off';
}
```

---

## 7. Core API Specification

### 7.1 Effect Constructors

```typescript
// effect.ts

export const Effect = {
  /**
   * No side effects.
   */
  none<A>(): Effect<A> {
    return { _tag: 'None' };
  },

  /**
   * Execute async work and dispatch actions.
   *
   * @example
   * Effect.run(async (dispatch) => {
   *   const data = await api.fetch();
   *   dispatch({ type: 'dataLoaded', data });
   * })
   */
  run<A>(execute: EffectExecutor<A>): Effect<A> {
    return { _tag: 'Run', execute };
  },

  /**
   * Execute multiple effects.
   *
   * @example
   * Effect.batch(
   *   Effect.run(async (d) => { ... }),
   *   Effect.run(async (d) => { ... })
   * )
   */
  batch<A>(...effects: Effect<A>[]): Effect<A> {
    return { _tag: 'Batch', effects };
  },

  /**
   * Execute effect that can be cancelled by ID.
   * Cancels any in-flight effect with same ID.
   *
   * @example
   * Effect.cancellable('fetch-user', async (dispatch) => {
   *   const user = await api.fetchUser();
   *   dispatch({ type: 'userLoaded', user });
   * })
   */
  cancellable<A>(id: string, execute: EffectExecutor<A>): Effect<A> {
    return { _tag: 'Cancellable', id, execute };
  },

  /**
   * Execute effect after debounce delay.
   * Resets timer if called again with same ID.
   *
   * @example
   * Effect.debounced('search', 300, async (dispatch) => {
   *   const results = await api.search(query);
   *   dispatch({ type: 'resultsLoaded', results });
   * })
   */
  debounced<A>(id: string, ms: number, execute: EffectExecutor<A>): Effect<A> {
    return { _tag: 'Debounced', id, ms, execute };
  },

  /**
   * Execute effect at most once per time period.
   *
   * @example
   * Effect.throttled('scroll', 100, async (dispatch) => {
   *   dispatch({ type: 'scrolled', y: window.scrollY });
   * })
   */
  throttled<A>(id: string, ms: number, execute: EffectExecutor<A>): Effect<A> {
    return { _tag: 'Throttled', id, ms, execute };
  },

  /**
   * Execute effect after a delay.
   * Useful for animations and timed transitions.
   *
   * @example
   * Effect.afterDelay(300, (dispatch) => {
   *   dispatch({ type: 'animationCompleted' });
   * })
   */
  afterDelay<A>(ms: number, create: (dispatch: Dispatch<A>) => void): Effect<A> {
    return { _tag: 'AfterDelay', ms, execute: create };
  },

  /**
   * Execute effect without waiting for completion.
   * No actions can be dispatched.
   *
   * @example
   * Effect.fireAndForget(() => {
   *   analytics.track('button_clicked');
   * })
   */
  fireAndForget<A>(execute: () => void | Promise<void>): Effect<A> {
    return { _tag: 'FireAndForget', execute };
  },

  /**
   * Map effect actions (for composition).
   *
   * @example
   * const childEffect: Effect<ChildAction> = ...;
   * const parentEffect: Effect<ParentAction> = Effect.map(
   *   childEffect,
   *   (childAction) => ({ type: 'child', action: childAction })
   * );
   */
  map<A, B>(effect: Effect<A>, f: (a: A) => B): Effect<B> {
    switch (effect._tag) {
      case 'None':
        return Effect.none();

      case 'Run':
        return Effect.run(async (dispatch) => {
          await effect.execute((a) => dispatch(f(a)));
        });

      case 'Batch':
        return Effect.batch(...effect.effects.map(e => Effect.map(e, f)));

      case 'Cancellable':
        return Effect.cancellable(effect.id, async (dispatch) => {
          await effect.execute((a) => dispatch(f(a)));
        });

      case 'Debounced':
        return Effect.debounced(effect.id, effect.ms, async (dispatch) => {
          await effect.execute((a) => dispatch(f(a)));
        });

      case 'Throttled':
        return Effect.throttled(effect.id, effect.ms, async (dispatch) => {
          await effect.execute((a) => dispatch(f(a)));
        });

      case 'AfterDelay':
        return Effect.afterDelay(effect.ms, (dispatch) => {
          effect.execute((a) => dispatch(f(a)));
        });

      case 'FireAndForget':
        return Effect.fireAndForget(effect.execute);
    }
  }
};
```

### 7.2 Store Creation

```typescript
// store.svelte.ts

/**
 * Create a Store for a feature.
 *
 * @example
 * const store = createStore({
 *   initialState: { count: 0 },
 *   reducer: counterReducer,
 *   dependencies: { apiClient }
 * });
 */
export function createStore<State, Action, Dependencies = any>(
  config: StoreConfig<State, Action, Dependencies>
): Store<State, Action> {
  // Use Svelte 5 $state for reactivity
  let state = $state<State>(config.initialState);

  // Action history for debugging/time-travel
  const actionHistory: Action[] = [];

  // In-flight effects for cancellation
  const inFlightEffects = new Map<string, AbortController>();

  // Debounce timers
  const debounceTimers = new Map<string, number>();

  // Throttle state
  const throttleState = new Map<string, { lastRun: number; timeout?: number }>();

  // Subscribers
  const subscribers = new Set<(state: State) => void>();

  function dispatchCore(action: Action): void {
    // Record action
    actionHistory.push(action);

    // Run reducer (pure function)
    const [newState, effect] = config.reducer(
      state,
      action,
      config.dependencies
    );

    // Update state (Svelte reactivity kicks in)
    const stateChanged = !Object.is(state, newState);
    if (stateChanged) {
      state = newState;

      // Notify subscribers
      subscribers.forEach(listener => listener(state));
    }

    // Execute effect
    executeEffect(effect);
  }

  // Create dispatch with middleware
  // Use a definite assignment assertion as dispatch will be assigned before use
  let dispatch: Dispatch<Action> = undefined!;

  if (config.middleware) {
    const middlewareAPI: MiddlewareAPI<State, Action> = {
      getState: () => state,
      dispatch: (action: Action) => dispatch(action) // Closure captures final dispatch
    };

    // Compose middleware chain
    dispatch = config.middleware.reduceRight(
      (next, middleware) => middleware(middlewareAPI)(next),
      dispatchCore
    );
  } else {
    dispatch = dispatchCore;
  }

  function executeEffect(effect: Effect<Action>): void {
    switch (effect._tag) {
      case 'None':
        break;

      case 'Run':
        Promise.resolve(effect.execute(dispatch)).catch(error => {
          console.error('Effect error:', error);
        });
        break;

      case 'Batch':
        effect.effects.forEach(executeEffect);
        break;

      case 'Cancellable':
        // Cancel existing effect with same id
        inFlightEffects.get(effect.id)?.abort();

        const controller = new AbortController();
        inFlightEffects.set(effect.id, controller);

        Promise.resolve(effect.execute(dispatch))
          .catch(error => {
            if (error.name !== 'AbortError') {
              console.error('Effect error:', error);
            }
          })
          .finally(() => {
            inFlightEffects.delete(effect.id);
          });
        break;

      case 'Debounced':
        // Clear existing timer
        const existingTimer = debounceTimers.get(effect.id);
        if (existingTimer !== undefined) {
          clearTimeout(existingTimer);
        }

        // Set new timer
        const timer = setTimeout(() => {
          debounceTimers.delete(effect.id);
          Promise.resolve(effect.execute(dispatch)).catch(error => {
            console.error('Effect error:', error);
          });
        }, effect.ms);

        debounceTimers.set(effect.id, timer as unknown as number);
        break;

      case 'Throttled':
        const now = Date.now();
        const throttle = throttleState.get(effect.id);

        if (!throttle || now - throttle.lastRun >= effect.ms) {
          // Execute immediately
          throttleState.set(effect.id, { lastRun: now });
          Promise.resolve(effect.execute(dispatch)).catch(error => {
            console.error('Effect error:', error);
          });
        } else if (!throttle.timeout) {
          // Schedule for later
          const delay = effect.ms - (now - throttle.lastRun);
          const timeout = setTimeout(() => {
            throttleState.set(effect.id, { lastRun: Date.now() });
            Promise.resolve(effect.execute(dispatch)).catch(error => {
              console.error('Effect error:', error);
            });
          }, delay);

          throttleState.set(effect.id, { ...throttle, timeout: timeout as unknown as number });
        }
        break;

      case 'AfterDelay':
        setTimeout(() => {
          Promise.resolve(effect.execute(dispatch)).catch(error => {
            console.error('Effect error:', error);
          });
        }, effect.ms);
        break;

      case 'FireAndForget':
        Promise.resolve(effect.execute()).catch(error => {
          console.error('Effect error:', error);
        });
        break;
    }
  }

  function select<T>(selector: Selector<State, T>): T {
    // Non-reactive selector - just extracts current value
    // For reactive values in components, use: $derived(store.state.field)
    return selector(state);
  }

  function subscribe(listener: (state: State) => void): () => void {
    subscribers.add(listener);
    return () => {
      subscribers.delete(listener);
    };
  }

  function destroy(): void {
    // Cancel all in-flight effects
    inFlightEffects.forEach(controller => controller.abort());
    inFlightEffects.clear();

    // Clear all timers
    debounceTimers.forEach(timer => clearTimeout(timer));
    debounceTimers.clear();

    throttleState.forEach(t => {
      if (t.timeout) clearTimeout(t.timeout);
    });
    throttleState.clear();

    // Clear subscribers
    subscribers.clear();
  }

  return {
    get state() {
      return state;
    },
    dispatch,
    select,
    subscribe,
    get history() {
      return actionHistory;
    },
    destroy
  };
}
```

### 7.3 Reducer Utilities

```typescript
// reducer.ts

/**
 * Combine multiple reducers into one.
 * Each reducer handles its slice of state.
 *
 * @example
 * const appReducer = combineReducers({
 *   counter: counterReducer,
 *   todos: todosReducer
 * });
 */
export function combineReducers<State extends Record<string, any>, Action>(
  reducers: {
    [K in keyof State]: Reducer<State[K], Action>;
  }
): Reducer<State, Action> {
  return (state, action, dependencies) => {
    let hasChanged = false;
    const effects: Effect<Action>[] = [];
    const nextState = {} as State;

    for (const key in reducers) {
      const reducer = reducers[key];
      const previousStateForKey = state[key];
      const [nextStateForKey, effect] = reducer(previousStateForKey, action, dependencies);

      nextState[key] = nextStateForKey;
      hasChanged = hasChanged || nextStateForKey !== previousStateForKey;

      if (effect._tag !== 'None') {
        effects.push(effect);
      }
    }

    return [
      hasChanged ? nextState : state,
      effects.length === 0 ? Effect.none() : Effect.batch(...effects)
    ];
  };
}

/**
 * Create a reducer that only handles specific action types.
 *
 * @example
 * const reducer = createReducer<State, Action>({
 *   increment: (state) => [{ ...state, count: state.count + 1 }, Effect.none()],
 *   decrement: (state) => [{ ...state, count: state.count - 1 }, Effect.none()]
 * });
 */
export function createReducer<State, Action extends { type: string }>(
  handlers: {
    [K in Action['type']]?: (
      state: State,
      action: Extract<Action, { type: K }>,
      dependencies?: any
    ) => readonly [State, Effect<Action>];
  }
): Reducer<State, Action> {
  return (state, action, dependencies) => {
    const handler = handlers[action.type];
    if (handler) {
      return handler(state, action as any, dependencies);
    }
    return [state, Effect.none()];
  };
}
```

### 7.4 Scope (Composition)

```typescript
// scope.ts

/**
 * Scope a child reducer to work with parent state and actions.
 * This is the core composition primitive.
 *
 * @example
 * const parentReducer = scope(
 *   (parent: AppState) => parent.counter,
 *   (parent, child) => ({ ...parent, counter: child }),
 *   (action: AppAction) => action.type === 'counter' ? action.action : null,
 *   (childAction) => ({ type: 'counter', action: childAction }),
 *   counterReducer
 * );
 */
export function scope<ParentState, ParentAction, ChildState, ChildAction>(
  toChildState: StateLens<ParentState, ChildState>,
  fromChildState: StateUpdater<ParentState, ChildState>,
  toChildAction: ActionPrism<ParentAction, ChildAction>,
  fromChildAction: ActionEmbedder<ParentAction, ChildAction>,
  childReducer: Reducer<ChildState, ChildAction>
): Reducer<ParentState, ParentAction> {
  return (parentState, parentAction, dependencies) => {
    const childAction = toChildAction(parentAction);

    // Parent action doesn't apply to child
    if (childAction === null) {
      return [parentState, Effect.none()];
    }

    // Extract child state
    const childState = toChildState(parentState);

    // Run child reducer
    const [newChildState, childEffect] = childReducer(childState, childAction, dependencies);

    // Update parent state with new child state
    const newParentState = fromChildState(parentState, newChildState);

    // Map child effects to parent actions
    const parentEffect = Effect.map(childEffect, fromChildAction);

    return [newParentState, parentEffect];
  };
}

/**
 * Helper for common case where child actions are embedded in parent actions.
 *
 * @example
 * type AppAction = { type: 'counter'; action: CounterAction } | ...;
 *
 * const parentReducer = scopeAction(
 *   (parent: AppState) => parent.counter,
 *   (parent, child) => ({ ...parent, counter: child }),
 *   'counter',
 *   counterReducer
 * );
 */
export function scopeAction<
  ParentState,
  ParentAction extends { type: string },
  ChildState,
  ChildAction
>(
  toChildState: StateLens<ParentState, ChildState>,
  fromChildState: StateUpdater<ParentState, ChildState>,
  actionType: string,
  childReducer: Reducer<ChildState, ChildAction>
): Reducer<ParentState, ParentAction> {
  return scope(
    toChildState,
    fromChildState,
    (action) => (action.type === actionType && 'action' in action ? (action as any).action : null),
    (childAction) => ({ type: actionType, action: childAction } as any),
    childReducer
  );
}
```

---

## 8. Composition Patterns

### 8.1 Parent-Child Composition

**Scenario:** A parent feature contains multiple child features.

**Example:** App contains Counter and Todos

```typescript
// Parent State
interface AppState {
  counter: CounterState;
  todos: TodosState;
}

// Parent Action
type AppAction =
  | { type: 'counter'; action: CounterAction }
  | { type: 'todos'; action: TodosAction }
  | { type: 'reset' };

// Parent Reducer
const appReducer: Reducer<AppState, AppAction> = (state, action, deps) => {
  switch (action.type) {
    case 'counter': {
      const [counterState, counterEffect] = counterReducer(
        state.counter,
        action.action,
        deps
      );

      return [
        { ...state, counter: counterState },
        Effect.map(counterEffect, (a) => ({ type: 'counter', action: a }))
      ];
    }

    case 'todos': {
      const [todosState, todosEffect] = todosReducer(
        state.todos,
        action.action,
        deps
      );

      return [
        { ...state, todos: todosState },
        Effect.map(todosEffect, (a) => ({ type: 'todos', action: a }))
      ];
    }

    case 'reset':
      return [
        {
          counter: initialCounterState,
          todos: initialTodosState
        },
        Effect.none()
      ];

    default:
      const _exhaustive: never = action;
      return [state, Effect.none()];
  }
};

// Using scope helper
const appReducer = combineReducers({
  counter: scopeAction(
    (s: AppState) => s.counter,
    (s, c) => ({ ...s, counter: c }),
    'counter',
    counterReducer
  ),
  todos: scopeAction(
    (s: AppState) => s.todos,
    (s, t) => ({ ...s, todos: t }),
    'todos',
    todosReducer
  )
});
```

### 8.2 Sibling Communication

**Scenario:** One child feature needs to react to another child's actions.

```typescript
const appReducer: Reducer<AppState, AppAction> = (state, action, deps) => {
  // Handle child features first
  const [stateAfterChildren, childEffects] = childrenReducer(state, action, deps);

  // Then handle cross-cutting concerns
  switch (action.type) {
    case 'counter': {
      if (action.action.type === 'incrementTapped') {
        // When counter increments, clear todos
        return [
          { ...stateAfterChildren, todos: initialTodosState },
          childEffects
        ];
      }
      break;
    }

    case 'todos': {
      if (action.action.type === 'allCompleted') {
        // When all todos complete, increment counter
        return [
          stateAfterChildren,
          Effect.batch(
            childEffects,
            Effect.run(async (dispatch) => {
              dispatch({ type: 'counter', action: { type: 'incrementTapped' } });
            })
          )
        ];
      }
      break;
    }
  }

  return [stateAfterChildren, childEffects];
};
```

### 8.3 Optional Child Features

**Scenario:** A child feature that may or may not be present.

```typescript
interface AppState {
  counter: CounterState;
  detail: CounterDetailState | null; // Optional
}

type AppAction =
  | { type: 'counter'; action: CounterAction }
  | { type: 'detail'; action: CounterDetailAction }
  | { type: 'showDetail' }
  | { type: 'hideDetail' };

const appReducer: Reducer<AppState, AppAction> = (state, action, deps) => {
  switch (action.type) {
    case 'detail': {
      if (state.detail === null) {
        return [state, Effect.none()];
      }

      const [detailState, detailEffect] = detailReducer(
        state.detail,
        action.action,
        deps
      );

      return [
        { ...state, detail: detailState },
        Effect.map(detailEffect, (a) => ({ type: 'detail', action: a }))
      ];
    }

    case 'showDetail':
      return [
        { ...state, detail: initialDetailState },
        Effect.none()
      ];

    case 'hideDetail':
      return [
        { ...state, detail: null },
        Effect.none()
      ];
  }

  return [state, Effect.none()];
};
```

### 8.4 Collection of Features

**Scenario:** Managing a dynamic list of identical features.

This pattern allows each item in a collection to have its own reducer and state.

```typescript
// Example: Each todo item has its own state and reducer
interface TodoItemState {
  id: string;
  text: string;
  completed: boolean;
}

interface TodosState {
  ids: string[];
  byId: Record<string, TodoItemState>;
}

// TodoItemAction represents actions for an individual todo item
type TodoItemAction =
  | { type: 'toggle' }
  | { type: 'textChanged'; text: string };

type TodosAction =
  | { type: 'item'; id: string; action: TodoItemAction }
  | { type: 'addTodo'; text: string }
  | { type: 'removeTodo'; id: string };

// Reducer for a single todo item
const todoItemReducer: Reducer<TodoItemState, TodoItemAction> = (state, action) => {
  switch (action.type) {
    case 'toggle':
      return [{ ...state, completed: !state.completed }, Effect.none()];
    case 'textChanged':
      return [{ ...state, text: action.text }, Effect.none()];
    default:
      return [state, Effect.none()];
  }
};

// Reducer for the collection of todos
const todosReducer: Reducer<TodosState, TodosAction> = (state, action, deps) => {
  switch (action.type) {
    case 'item': {
      const item = state.byId[action.id];
      if (!item) {
        return [state, Effect.none()];
      }

      const [newItem, itemEffect] = todoItemReducer(item, action.action, deps);

      return [
        {
          ...state,
          byId: { ...state.byId, [action.id]: newItem }
        },
        Effect.map(itemEffect, (a) => ({ type: 'item', id: action.id, action: a }))
      ];
    }

    case 'addTodo': {
      const id = deps.uuid();
      return [
        {
          ids: [...state.ids, id],
          byId: {
            ...state.byId,
            [id]: { id, text: action.text, completed: false }
          }
        },
        Effect.none()
      ];
    }

    case 'removeTodo': {
      const { [action.id]: removed, ...rest } = state.byId;
      return [
        {
          ids: state.ids.filter(id => id !== action.id),
          byId: rest
        },
        Effect.none()
      ];
    }

    default:
      const _exhaustive: never = action;
      return [state, Effect.none()];
  }
};
```

---

## 9. Dependency Injection

### 9.1 Dependency Definition

```typescript
// dependencies/types.ts

export interface Dependencies {
  apiClient: APIClient;
  uuid: () => string;
  now: () => Date;
  storage: Storage;
  analytics: Analytics;
}

export interface APIClient {
  fetch<T>(url: string, options?: RequestInit): Promise<T>;
  post<T>(url: string, body: any, options?: RequestInit): Promise<T>;
}

export interface Storage {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
  clear(): void;
}

export interface Analytics {
  track(event: string, properties?: Record<string, any>): void;
  identify(userId: string, traits?: Record<string, any>): void;
}
```

### 9.2 Live Dependencies

```typescript
// dependencies/live.ts

export const liveAPIClient: APIClient = {
  async fetch<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  },

  async post<T>(url: string, body: any, options?: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }
};

export const liveStorage: Storage = {
  get<T>(key: string): T | null {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  },

  set<T>(key: string, value: T): void {
    localStorage.setItem(key, JSON.stringify(value));
  },

  remove(key: string): void {
    localStorage.removeItem(key);
  },

  clear(): void {
    localStorage.clear();
  }
};

export const liveAnalytics: Analytics = {
  track(event: string, properties?: Record<string, any>): void {
    // Send to analytics service
    console.log('Analytics:', event, properties);
  },

  identify(userId: string, traits?: Record<string, any>): void {
    // Identify user
    console.log('Identify:', userId, traits);
  }
};

export const liveDependencies: Dependencies = {
  apiClient: liveAPIClient,
  uuid: () => crypto.randomUUID(),
  now: () => new Date(),
  storage: liveStorage,
  analytics: liveAnalytics
};
```

### 9.3 Test Dependencies

```typescript
// dependencies/test.ts

export const testAPIClient: APIClient = {
  async fetch<T>(url: string, options?: RequestInit): Promise<T> {
    throw new Error('Not implemented in test');
  },

  async post<T>(url: string, body: any, options?: RequestInit): Promise<T> {
    throw new Error('Not implemented in test');
  }
};

export function createTestStorage(): Storage {
  const store = new Map<string, any>();

  return {
    get<T>(key: string): T | null {
      return store.get(key) ?? null;
    },

    set<T>(key: string, value: T): void {
      store.set(key, value);
    },

    remove(key: string): void {
      store.delete(key);
    },

    clear(): void {
      store.clear();
    }
  };
}

export const testStorage = createTestStorage();

export const testAnalytics: Analytics = {
  events: [] as Array<{ event: string; properties?: Record<string, any> }>,

  track(event: string, properties?: Record<string, any>): void {
    this.events.push({ event, properties });
  },

  identify(userId: string, traits?: Record<string, any>): void {
    // No-op in tests
  }
};

export const testDependencies: Dependencies = {
  apiClient: testAPIClient,
  uuid: () => 'test-uuid-123',
  now: () => new Date('2025-01-01T00:00:00Z'),
  storage: testStorage,
  analytics: testAnalytics
};
```

### 9.4 Using Dependencies in Reducers

```typescript
const counterReducer: Reducer<CounterState, CounterAction, Dependencies> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'loadFactTapped':
      return [
        { ...state, isLoading: true },
        Effect.run(async (dispatch) => {
          try {
            const fact = await deps.apiClient.fetch<string>(
              `/api/fact/${state.count}`
            );

            dispatch({ type: 'factLoaded', fact });

            deps.analytics.track('fact_loaded', { count: state.count });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            dispatch({ type: 'factLoadFailed', error: message });
          }
        })
      ];

    case 'saveTapped':
      deps.storage.set('counter', state);
      return [state, Effect.none()];

    default:
      return [state, Effect.none()];
  }
};
```

---

## 10. Testing Framework

### 10.1 TestStore Implementation

```typescript
// test.ts

export class TestStore<State, Action, Dependencies = any> {
  private state: State;
  private reducer: Reducer<State, Action, Dependencies>;
  private dependencies: Dependencies;
  private actionHistory: Action[] = [];
  private receivedActions: Action[] = [];
  private pendingEffects: Promise<void>[] = [];
  private virtualTime: number = 0;

  /**
   * Control exhaustiveness checking for received actions.
   * Default is 'on' to catch unhandled actions in tests.
   */
  public exhaustivity: 'on' | 'off' = 'on';

  constructor(config: TestStoreConfig<State, Action, Dependencies>) {
    this.state = config.initialState;
    this.reducer = config.reducer;
    this.dependencies = config.dependencies ?? {} as Dependencies;
  }

  /**
   * Send an action and optionally assert state changes.
   */
  async send(
    action: Action,
    assert?: StateAssertion<State>
  ): Promise<void> {
    this.actionHistory.push(action);

    const [newState, effect] = this.reducer(this.state, action, this.dependencies);
    this.state = newState;

    if (effect._tag !== 'None') {
      this.pendingEffects.push(this.executeEffect(effect));
    }

    if (assert) {
      await assert(this.state);
    }
  }

  /**
   * Wait for and assert an action was received from effects.
   */
  async receive(
    partialAction: PartialAction<Action>,
    assert?: StateAssertion<State>
  ): Promise<void> {
    // Wait for any pending effects (effects may spawn new effects)
    while (this.pendingEffects.length > 0) {
      const pending = [...this.pendingEffects];
      this.pendingEffects = [];
      await Promise.all(pending);
    }

    // Find matching action
    const index = this.receivedActions.findIndex(action =>
      this.matchesPartialAction(action, partialAction)
    );

    if (index === -1) {
      throw new Error(
        `Expected to receive action matching ${JSON.stringify(partialAction)}, ` +
        `but received: ${JSON.stringify(this.receivedActions)}`
      );
    }

    // Remove matched action
    const [matchedAction] = this.receivedActions.splice(index, 1);

    if (assert) {
      await assert(this.state);
    }
  }

  /**
   * Assert no actions are pending.
   * Only fails when exhaustivity is 'on'.
   */
  assertNoPendingActions(): void {
    if (this.exhaustivity === 'on' && this.receivedActions.length > 0) {
      throw new Error(
        `Expected no pending actions, but found: ${JSON.stringify(this.receivedActions)}`
      );
    }
  }

  /**
   * Get current state.
   */
  getState(): State {
    return this.state;
  }

  /**
   * Get action history.
   */
  getHistory(): ReadonlyArray<Action> {
    return this.actionHistory;
  }

  /**
   * Advance virtual time (for testing timeouts/intervals).
   * Note: Only increments virtual time counter. Actual timer control
   * requires fake timer implementation (e.g., vi.useFakeTimers()).
   */
  async advanceTime(ms: number): Promise<void> {
    this.virtualTime += ms;
    // Wait for any scheduled effects to complete
    await Promise.all(this.pendingEffects);
  }

  private async executeEffect(effect: Effect<Action>): Promise<void> {
    const dispatch: Dispatch<Action> = (action: Action) => {
      this.receivedActions.push(action);
      const [newState, newEffect] = this.reducer(this.state, action, this.dependencies);
      this.state = newState;

      if (newEffect._tag !== 'None') {
        this.pendingEffects.push(this.executeEffect(newEffect));
      }
    };

    switch (effect._tag) {
      case 'None':
        break;

      case 'Run':
      case 'Cancellable':
      case 'Debounced':
      case 'Throttled':
      case 'AfterDelay':
        await effect.execute(dispatch);
        break;

      case 'Batch':
        await Promise.all(effect.effects.map(e => this.executeEffect(e)));
        break;

      case 'FireAndForget':
        await effect.execute();
        break;
    }
  }

  private matchesPartialAction(
    action: Action,
    partial: PartialAction<Action>
  ): boolean {
    return Object.entries(partial).every(([key, value]) => {
      return (action as any)[key] === value;
    });
  }
}
```

### 10.2 Test Examples

```typescript
// counter/reducer.test.ts

import { describe, it, expect } from 'vitest';
import { TestStore } from '$lib/composable/test';
import { counterReducer } from './reducer';
import { initialState } from './state';
import type { Dependencies } from '$lib/dependencies/types';

describe('counterReducer', () => {
  it('increments count', async () => {
    const store = new TestStore({
      initialState,
      reducer: counterReducer
    });

    await store.send({ type: 'incrementTapped' }, (state) => {
      expect(state.count).toBe(1);
    });

    await store.send({ type: 'incrementTapped' }, (state) => {
      expect(state.count).toBe(2);
    });
  });

  it('decrements count', async () => {
    const store = new TestStore({
      initialState: { ...initialState, count: 5 },
      reducer: counterReducer
    });

    await store.send({ type: 'decrementTapped' }, (state) => {
      expect(state.count).toBe(4);
    });
  });

  it('loads number fact', async () => {
    const mockDeps: Dependencies = {
      apiClient: {
        fetch: async () => '5 is a great number!',
        post: async () => ({})
      },
      uuid: () => 'test-id',
      now: () => new Date(),
      storage: {} as any,
      analytics: { track: () => {}, identify: () => {} }
    };

    const store = new TestStore({
      initialState: { ...initialState, count: 5 },
      reducer: counterReducer,
      dependencies: mockDeps
    });

    await store.send({ type: 'loadFactTapped' }, (state) => {
      expect(state.isLoading).toBe(true);
      expect(state.error).toBeNull();
    });

    await store.receive({ type: 'factLoaded' }, (state) => {
      expect(state.isLoading).toBe(false);
      expect(state.fact).toBe('5 is a great number!');
    });

    store.assertNoPendingActions();
  });

  it('handles fact load failure', async () => {
    const mockDeps: Dependencies = {
      apiClient: {
        fetch: async () => {
          throw new Error('Network error');
        },
        post: async () => ({})
      },
      uuid: () => 'test-id',
      now: () => new Date(),
      storage: {} as any,
      analytics: { track: () => {}, identify: () => {} }
    };

    const store = new TestStore({
      initialState: { ...initialState, count: 5 },
      reducer: counterReducer,
      dependencies: mockDeps
    });

    await store.send({ type: 'loadFactTapped' });

    await store.receive({ type: 'factLoadFailed' }, (state) => {
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Network error');
    });
  });
});
```

---

## 11. Integration with Svelte 5

### 11.1 Using Store in Components

```svelte
<!-- Counter.svelte -->
<script lang="ts">
  import { createStore } from '$lib/composable/store.svelte';
  import { counterReducer } from './reducer';
  import { initialState } from './state';
  import { liveDependencies } from '$lib/dependencies/live';

  // Create store (uses Svelte 5 $state internally)
  const store = createStore({
    initialState,
    reducer: counterReducer,
    dependencies: liveDependencies
  });

  // Derived state (uses Svelte 5 $derived for reactivity)
  const canDecrement = $derived(store.state.count > 0);
  const displayFact = $derived(
    store.state.isLoading
      ? 'Loading...'
      : store.state.error
        ? `Error: ${store.state.error}`
        : store.state.fact ?? 'No fact yet'
  );

  // Clean up on unmount
  import { onDestroy } from 'svelte';
  onDestroy(() => store.destroy());
</script>

<div class="counter">
  <h2>Count: {store.state.count}</h2>

  <div class="buttons">
    <button
      onclick={() => store.dispatch({ type: 'decrementTapped' })}
      disabled={!canDecrement}
    >
      -
    </button>

    <button onclick={() => store.dispatch({ type: 'incrementTapped' })}>
      +
    </button>

    <button onclick={() => store.dispatch({ type: 'resetTapped' })}>
      Reset
    </button>

    <button
      onclick={() => store.dispatch({ type: 'loadFactTapped' })}
      disabled={store.state.isLoading}
    >
      Get Fact
    </button>
  </div>

  <p class="fact">{displayFact}</p>
</div>

<style>
  .counter {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .buttons {
    display: flex;
    gap: 0.5rem;
  }
</style>
```

### 11.2 Context for Store Sharing

```typescript
// lib/composable/context.svelte.ts

import { getContext, setContext } from 'svelte';
import type { Store } from './types';

const STORE_KEY = Symbol('composable-store');

export function setStoreContext<State, Action>(
  store: Store<State, Action>
): void {
  setContext(STORE_KEY, store);
}

export function getStoreContext<State, Action>(): Store<State, Action> {
  const store = getContext<Store<State, Action>>(STORE_KEY);

  if (!store) {
    throw new Error('Store not found in context');
  }

  return store;
}
```

Usage:

```svelte
<!-- App.svelte -->
<script lang="ts">
  import { setStoreContext } from '$lib/composable/context.svelte';
  import { createStore } from '$lib/composable/store.svelte';
  import { appReducer } from './reducer';
  import { initialState } from './state';
  import Counter from '$features/counter/Counter.svelte';
  import Todos from '$features/todos/Todos.svelte';

  const store = createStore({
    initialState,
    reducer: appReducer
  });

  setStoreContext(store);
</script>

<div class="app">
  <Counter />
  <Todos />
</div>

<!-- Counter.svelte -->
<script lang="ts">
  import { getStoreContext } from '$lib/composable/context.svelte';
  import type { AppState, AppAction } from '$features/app';

  const store = getStoreContext<AppState, AppAction>();

  const counterStore = {
    get state() {
      return store.state.counter;
    },
    dispatch: (action: CounterAction) => {
      store.dispatch({ type: 'counter', action });
    }
  };
</script>

<div class="counter">
  <h2>Count: {counterStore.state.count}</h2>
  <button onclick={() => counterStore.dispatch({ type: 'incrementTapped' })}>
    +
  </button>
</div>
```

### 11.3 Snippets for Render Props

```svelte
<!-- List.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props<T> {
    items: T[];
    renderItem: Snippet<[T]>;
  }

  let { items, renderItem }: Props<T> = $props();
</script>

<ul>
  {#each items as item (item.id)}
    <li>{@render renderItem(item)}</li>
  {/each}
</ul>

<!-- Usage -->
<List items={store.state.todos}>
  {#snippet renderItem(todo)}
    <Todo
      todo={todo}
      onToggle={() => store.dispatch({ type: 'todoToggled', id: todo.id })}
    />
  {/snippet}
</List>
```

---

## 12. Implementation Examples

### 12.1 Complete Feature: Todo List

```typescript
// features/todos/state.ts

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
}

export interface TodosState {
  ids: string[];
  byId: Record<string, Todo>;
  filter: 'all' | 'active' | 'completed';
  isLoading: boolean;
  error: string | null;
}

export const initialState: TodosState = {
  ids: [],
  byId: {},
  filter: 'all',
  isLoading: false,
  error: null
};
```

```typescript
// features/todos/actions.ts

export type TodosAction =
  | { type: 'addTodoTapped'; text: string }
  | { type: 'todoToggled'; id: string }
  | { type: 'todoRemoved'; id: string }
  | { type: 'todoTextChanged'; id: string; text: string }
  | { type: 'filterChanged'; filter: 'all' | 'active' | 'completed' }
  | { type: 'loadTodosTapped' }
  | { type: 'todosLoaded'; todos: Todo[] }
  | { type: 'todosLoadFailed'; error: string }
  | { type: 'clearCompletedTapped' };
```

```typescript
// features/todos/reducer.ts

import { Effect } from '$lib/composable/effect';
import type { Reducer } from '$lib/composable/types';
import type { Dependencies } from '$lib/dependencies/types';
import type { TodosState } from './state';
import type { TodosAction } from './actions';

export const todosReducer: Reducer<TodosState, TodosAction, Dependencies> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'addTodoTapped': {
      const id = deps.uuid();
      const todo = {
        id,
        text: action.text,
        completed: false,
        createdAt: deps.now().toISOString()
      };

      const newState = {
        ...state,
        ids: [...state.ids, id],
        byId: { ...state.byId, [id]: todo }
      };

      return [
        newState,
        Effect.fireAndForget(() => {
          deps.storage.set('todos', newState);
          deps.analytics.track('todo_added', { text: action.text });
        })
      ];
    }

    case 'todoToggled': {
      const todo = state.byId[action.id];
      if (!todo) {
        return [state, Effect.none()];
      }

      const updated = { ...todo, completed: !todo.completed };

      const newState = {
        ...state,
        byId: { ...state.byId, [action.id]: updated }
      };

      return [
        newState,
        Effect.fireAndForget(() => {
          deps.storage.set('todos', newState);
          deps.analytics.track('todo_toggled', {
            id: action.id,
            completed: updated.completed
          });
        })
      ];
    }

    case 'todoRemoved': {
      const { [action.id]: removed, ...rest } = state.byId;

      const newState = {
        ...state,
        ids: state.ids.filter(id => id !== action.id),
        byId: rest
      };

      return [
        newState,
        Effect.fireAndForget(() => {
          deps.storage.set('todos', newState);
        })
      ];
    }

    case 'todoTextChanged': {
      const todo = state.byId[action.id];
      if (!todo) {
        return [state, Effect.none()];
      }

      const newState = {
        ...state,
        byId: {
          ...state.byId,
          [action.id]: { ...todo, text: action.text }
        }
      };

      return [
        newState,
        Effect.debounced('save-todos', 500, async () => {
          deps.storage.set('todos', newState);
        })
      ];
    }

    case 'filterChanged':
      return [
        { ...state, filter: action.filter },
        Effect.none()
      ];

    case 'loadTodosTapped':
      return [
        { ...state, isLoading: true, error: null },
        Effect.run(async (dispatch) => {
          try {
            const todos = await deps.apiClient.fetch<Todo[]>('/api/todos');
            dispatch({ type: 'todosLoaded', todos });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            dispatch({ type: 'todosLoadFailed', error: message });
          }
        })
      ];

    case 'todosLoaded': {
      const byId: Record<string, Todo> = {};
      const ids: string[] = [];

      action.todos.forEach(todo => {
        byId[todo.id] = todo;
        ids.push(todo.id);
      });

      return [
        { ...state, ids, byId, isLoading: false },
        Effect.fireAndForget(() => {
          deps.storage.set('todos', { ids, byId });
        })
      ];
    }

    case 'todosLoadFailed':
      return [
        { ...state, isLoading: false, error: action.error },
        Effect.none()
      ];

    case 'clearCompletedTapped': {
      const completedIds = state.ids.filter(id => state.byId[id].completed);
      const byId = { ...state.byId };
      completedIds.forEach(id => delete byId[id]);

      const newState = {
        ...state,
        ids: state.ids.filter(id => !state.byId[id].completed),
        byId
      };

      return [
        newState,
        Effect.fireAndForget(() => {
          deps.storage.set('todos', newState);
        })
      ];
    }

    default:
      const _exhaustive: never = action;
      return [state, Effect.none()];
  }
};
```

```svelte
<!-- features/todos/Todos.svelte -->
<script lang="ts">
  import { createStore } from '$lib/composable/store.svelte';
  import { todosReducer } from './reducer';
  import { initialState } from './state';
  import { liveDependencies } from '$lib/dependencies/live';
  import TodoItem from './TodoItem.svelte';

  const store = createStore({
    initialState,
    reducer: todosReducer,
    dependencies: liveDependencies
  });

  // Derived state
  const filteredTodos = $derived.by(() => {
    const todos = store.state.ids.map(id => store.state.byId[id]);

    switch (store.state.filter) {
      case 'active':
        return todos.filter(t => !t.completed);
      case 'completed':
        return todos.filter(t => t.completed);
      default:
        return todos;
    }
  });

  const activeCount = $derived(
    store.state.ids.filter(id => !store.state.byId[id].completed).length
  );

  const hasCompleted = $derived(
    store.state.ids.some(id => store.state.byId[id].completed)
  );

  let newTodoText = $state('');

  function handleSubmit(e: Event) {
    e.preventDefault();
    if (newTodoText.trim()) {
      store.dispatch({ type: 'addTodoTapped', text: newTodoText });
      newTodoText = '';
    }
  }

  import { onMount, onDestroy } from 'svelte';

  onMount(() => {
    store.dispatch({ type: 'loadTodosTapped' });
  });

  onDestroy(() => {
    store.destroy();
  });
</script>

<div class="todos">
  <h1>Todos</h1>

  <form onsubmit={handleSubmit}>
    <input
      type="text"
      bind:value={newTodoText}
      placeholder="What needs to be done?"
      disabled={store.state.isLoading}
    />
  </form>

  {#if store.state.error}
    <div class="error">{store.state.error}</div>
  {/if}

  <ul class="todo-list">
    {#each filteredTodos as todo (todo.id)}
      <TodoItem
        {todo}
        onToggle={() => store.dispatch({ type: 'todoToggled', id: todo.id })}
        onRemove={() => store.dispatch({ type: 'todoRemoved', id: todo.id })}
        onTextChange={(text) => store.dispatch({
          type: 'todoTextChanged',
          id: todo.id,
          text
        })}
      />
    {/each}
  </ul>

  <div class="footer">
    <span class="count">
      {activeCount} {activeCount === 1 ? 'item' : 'items'} left
    </span>

    <div class="filters">
      <button
        class:active={store.state.filter === 'all'}
        onclick={() => store.dispatch({ type: 'filterChanged', filter: 'all' })}
      >
        All
      </button>
      <button
        class:active={store.state.filter === 'active'}
        onclick={() => store.dispatch({ type: 'filterChanged', filter: 'active' })}
      >
        Active
      </button>
      <button
        class:active={store.state.filter === 'completed'}
        onclick={() => store.dispatch({ type: 'filterChanged', filter: 'completed' })}
      >
        Completed
      </button>
    </div>

    {#if hasCompleted}
      <button
        class="clear-completed"
        onclick={() => store.dispatch({ type: 'clearCompletedTapped' })}
      >
        Clear completed
      </button>
    {/if}
  </div>
</div>
```

---

## 13. Best Practices

### 13.1 State Design

1. **Keep state flat and normalized**
   ```typescript
   // Bad
   interface State {
     users: Array<{
       id: string;
       posts: Array<{
         id: string;
         comments: Array<Comment>;
       }>;
     }>;
   }

   // Good
   interface State {
     userIds: string[];
     usersById: Record<string, User>;
     postIds: string[];
     postsById: Record<string, Post>;
     commentIds: string[];
     commentsById: Record<string, Comment>;
   }
   ```

2. **Use discriminated unions for complex states**
   ```typescript
   // Bad
   interface State {
     isLoading: boolean;
     data: Data | null;
     error: string | null;
   }

   // Good
   type State =
     | { status: 'idle' }
     | { status: 'loading' }
     | { status: 'loaded'; data: Data }
     | { status: 'failed'; error: string };
   ```

3. **Avoid computed values in state**
   ```typescript
   // Bad
   interface State {
     todos: Todo[];
     completedCount: number; // Derived value
   }

   // Good
   interface State {
     todos: Todo[];
   }

   // Compute in selector
   const completedCount = store.select(s =>
     s.todos.filter(t => t.completed).length
   );
   ```

### 13.2 Action Design

1. **Use past tense for events**
   ```typescript
   // Bad
   type Action =
     | { type: 'INCREMENT' }
     | { type: 'LOAD_DATA' }

   // Good
   type Action =
     | { type: 'incrementTapped' }
     | { type: 'loadDataTapped' }
     | { type: 'dataLoaded' }
   ```

2. **Group related actions**
   ```typescript
   type TodoAction =
     | { type: 'todo/added'; todo: Todo }
     | { type: 'todo/removed'; id: string }
     | { type: 'todo/toggled'; id: string }
     | { type: 'todo/textChanged'; id: string; text: string };
   ```

3. **Carry minimal data**
   ```typescript
   // Bad
   { type: 'userSelected', user: { ...1000 properties } }

   // Good
   { type: 'userSelected', userId: string }
   ```

### 13.3 Reducer Design

1. **Keep reducers focused**
   ```typescript
   // Bad: Doing too much
   case 'submitForm': {
     // Validation
     // API call
     // Update multiple state slices
     // Analytics
   }

   // Good: Separate concerns
   case 'submitFormTapped':
     return validateForm(state);
   case 'formValid':
     return submitToAPI(state);
   case 'submitSucceeded':
     return updateState(state);
   ```

2. **Extract helper functions**
   ```typescript
   function updateTodo(
     state: TodosState,
     id: string,
     update: Partial<Todo>
   ): TodosState {
     const todo = state.byId[id];
     if (!todo) return state;

     return {
       ...state,
       byId: {
         ...state.byId,
         [id]: { ...todo, ...update }
       }
     };
   }

   // Use in reducer
   case 'todoToggled':
     return [
       updateTodo(state, action.id, { completed: !state.byId[action.id].completed }),
       Effect.none()
     ];
   ```

3. **Use exhaustiveness checking**
   ```typescript
   switch (action.type) {
     case 'increment':
       return ...;
     case 'decrement':
       return ...;
     default:
       const _exhaustive: never = action;
       return [state, Effect.none()];
   }
   ```

### 13.4 Effect Design

1. **Keep effects focused**
   ```typescript
   // Bad: Multiple concerns
   Effect.run(async (dispatch) => {
     const user = await api.fetchUser();
     const posts = await api.fetchPosts();
     const comments = await api.fetchComments();
     dispatch({ type: 'allDataLoaded', user, posts, comments });
   })

   // Good: Separate effects
   Effect.batch(
     Effect.run(async (d) => {
       const user = await api.fetchUser();
       d({ type: 'userLoaded', user });
     }),
     Effect.run(async (d) => {
       const posts = await api.fetchPosts();
       d({ type: 'postsLoaded', posts });
     })
   )
   ```

2. **Use cancellation for expensive operations**
   ```typescript
   Effect.cancellable('search', async (dispatch) => {
     const results = await api.search(query);
     dispatch({ type: 'resultsLoaded', results });
   })
   ```

3. **Use debouncing for frequent actions**
   ```typescript
   Effect.debounced('autosave', 1000, async (dispatch) => {
     await api.save(data);
     dispatch({ type: 'saved' });
   })
   ```

### 13.5 Testing

1. **Test business logic, not implementation**
   ```typescript
   // Bad: Testing implementation details
   it('calls apiClient.fetch', async () => {
     const spy = vi.spyOn(apiClient, 'fetch');
     await store.send({ type: 'loadTapped' });
     expect(spy).toHaveBeenCalled();
   });

   // Good: Testing behavior
   it('loads data when load button tapped', async () => {
     await store.send({ type: 'loadTapped' });
     await store.receive({ type: 'dataLoaded' }, (state) => {
       expect(state.data).toBeDefined();
     });
   });
   ```

2. **Test error cases**
   ```typescript
   it('handles load failure', async () => {
     const deps = {
       ...testDeps,
       apiClient: {
         fetch: async () => { throw new Error('Network error'); }
       }
     };

     const store = new TestStore({ initialState, reducer, dependencies: deps });

     await store.send({ type: 'loadTapped' });
     await store.receive({ type: 'loadFailed' }, (state) => {
       expect(state.error).toBe('Network error');
     });
   });
   ```

3. **Test composition**
   ```typescript
   it('child action updates parent state', async () => {
     await store.send({
       type: 'counter',
       action: { type: 'incrementTapped' }
     }, (state) => {
       expect(state.counter.count).toBe(1);
     });
   });
   ```

---

## 14. Advanced Features

### 14.1 Middleware

```typescript
// middleware.ts

export function createLoggerMiddleware<State, Action>(): Middleware<State, Action> {
  return (store) => (next) => (action) => {
    console.group(`Action: ${(action as any).type}`);
    console.log('Previous state:', store.getState());
    console.log('Action:', action);

    next(action);

    console.log('Next state:', store.getState());
    console.groupEnd();
  };
}

export function createAnalyticsMiddleware<State, Action>(
  analytics: Analytics
): Middleware<State, Action> {
  return (store) => (next) => (action) => {
    analytics.track(`action:${(action as any).type}`, action);
    next(action);
  };
}

export function createPersistenceMiddleware<State, Action>(
  storage: Storage,
  key: string
): Middleware<State, Action> {
  return (store) => (next) => (action) => {
    next(action);
    storage.set(key, store.getState());
  };
}

// Usage
const store = createStore({
  initialState,
  reducer,
  middleware: [
    createLoggerMiddleware(),
    createAnalyticsMiddleware(analytics),
    createPersistenceMiddleware(storage, 'app-state')
  ]
});
```

### 14.2 Time-Travel Debugging

```typescript
// devtools.ts

export class DevTools<State, Action> {
  private history: Array<{ action: Action; state: State }> = [];
  private currentIndex: number = -1;

  constructor(
    private store: Store<State, Action>,
    private reducer: Reducer<State, Action>
  ) {
    // Intercept actions
    const originalDispatch = store.dispatch.bind(store);
    store.dispatch = (action: Action) => {
      originalDispatch(action);
      this.history.push({ action, state: store.state });
      this.currentIndex = this.history.length - 1;
    };
  }

  jumpToAction(index: number): void {
    if (index < 0 || index >= this.history.length) {
      throw new Error('Invalid index');
    }

    this.currentIndex = index;
    const entry = this.history[index];

    // Replay actions up to this point
    // (Would need to modify store to support this)
  }

  undo(): void {
    if (this.currentIndex > 0) {
      this.jumpToAction(this.currentIndex - 1);
    }
  }

  redo(): void {
    if (this.currentIndex < this.history.length - 1) {
      this.jumpToAction(this.currentIndex + 1);
    }
  }

  getHistory(): ReadonlyArray<{ action: Action; state: State }> {
    return this.history;
  }
}
```

### 14.3 Persistence and Rehydration

```typescript
// persistence.ts

export function persistStore<State, Action>(
  store: Store<State, Action>,
  storage: Storage,
  key: string
): () => void {
  // Save on every state change
  const unsubscribe = store.subscribe((state) => {
    storage.set(key, state);
  });

  return unsubscribe;
}

export function rehydrateStore<State>(
  storage: Storage,
  key: string,
  initialState: State
): State {
  const persisted = storage.get<State>(key);
  return persisted ?? initialState;
}

// Usage
const persistedState = rehydrateStore(storage, 'app-state', initialState);

const store = createStore({
  initialState: persistedState,
  reducer
});

persistStore(store, storage, 'app-state');
```

### 14.4 Hot Module Replacement

```typescript
// hmr.ts

export function enableHMR<State, Action>(
  store: Store<State, Action>,
  module: any
): void {
  if (import.meta.hot) {
    import.meta.hot.accept((newModule) => {
      // Replace reducer with new version
      if (newModule?.reducer) {
        (store as any).reducer = newModule.reducer;
      }
    });

    import.meta.hot.dispose(() => {
      store.destroy();
    });
  }
}
```

---

## 15. Migration Guide

### 15.1 From Traditional Svelte

**Before:**
```svelte
<script>
  let count = 0;
  let isLoading = false;

  async function loadFact() {
    isLoading = true;
    const response = await fetch(`/api/fact/${count}`);
    const fact = await response.text();
    isLoading = false;
    alert(fact);
  }
</script>

<div>
  <p>Count: {count}</p>
  <button on:click={() => count++}>Increment</button>
  <button on:click={loadFact} disabled={isLoading}>Get Fact</button>
</div>
```

**After:**
```svelte
<script>
  import { createStore } from '$lib/composable/store.svelte';
  import { Effect } from '$lib/composable/effect';

  const store = createStore({
    initialState: { count: 0, isLoading: false },
    reducer: (state, action) => {
      switch (action.type) {
        case 'incrementTapped':
          return [{ ...state, count: state.count + 1 }, Effect.none()];

        case 'loadFactTapped':
          return [
            { ...state, isLoading: true },
            Effect.run(async (dispatch) => {
              const response = await fetch(`/api/fact/${state.count}`);
              const fact = await response.text();
              dispatch({ type: 'factLoaded', fact });
            })
          ];

        case 'factLoaded':
          alert(action.fact);
          return [{ ...state, isLoading: false }, Effect.none()];

        default:
          return [state, Effect.none()];
      }
    }
  });
</script>

<div>
  <p>Count: {store.state.count}</p>
  <button onclick={() => store.dispatch({ type: 'incrementTapped' })}>
    Increment
  </button>
  <button
    onclick={() => store.dispatch({ type: 'loadFactTapped' })}
    disabled={store.state.isLoading}
  >
    Get Fact
  </button>
</div>
```

### 15.2 Interop with Existing Code

```svelte
<!-- Mix Composable Svelte with traditional Svelte -->
<script>
  import { createStore } from '$lib/composable/store.svelte';
  import LegacyComponent from './LegacyComponent.svelte';

  const store = createStore({
    initialState,
    reducer
  });

  // Bridge to legacy component
  let legacyProps = $derived({
    count: store.state.count,
    onIncrement: () => store.dispatch({ type: 'incrementTapped' })
  });
</script>

<div>
  <NewComponent {store} />
  <LegacyComponent {...legacyProps} />
</div>
```

---

## Appendix A: TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  }
}
```

## Appendix B: Glossary

- **Action**: A value describing something that happened
- **Reducer**: A pure function that transforms state based on actions
- **Effect**: A description of side effects to execute
- **Store**: The runtime that manages state and executes effects
- **Dispatch**: Send an action to the store
- **Selector**: Extract a derived value from state
- **Scope**: Compose child reducers into parent reducers
- **Dependencies**: External services injected into reducers
- **Middleware**: Intercept and augment action processing

## Appendix C: Resources

- Swift Composable Architecture: https://github.com/pointfreeco/swift-composable-architecture
- Svelte 5 Documentation: https://svelte.dev/docs
- Redux Documentation: https://redux.js.org
- Elm Architecture: https://guide.elm-lang.org/architecture/

---

**End of Specification**
