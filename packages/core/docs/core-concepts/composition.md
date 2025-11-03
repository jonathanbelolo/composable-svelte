# Reducer Composition

Learn how to build complex applications from simple, reusable reducers using Composable Svelte's composition primitives.

## Table of Contents

1. [Overview](#overview)
2. [The scope() Operator](#the-scope-operator)
3. [The scopeAction() Helper](#the-scopeaction-helper)
4. [The combineReducers() Function](#the-combinereducers-function)
5. [Composition Patterns](#composition-patterns)
6. [Real-World Examples](#real-world-examples)
7. [Testing Composed Reducers](#testing-composed-reducers)
8. [Best Practices](#best-practices)
9. [Common Pitfalls](#common-pitfalls)

## Overview

Reducer composition is the process of combining smaller, focused reducers into larger, more complex ones. This enables you to:

- **Build features independently** and compose them together
- **Reuse reducers** across different parts of your application
- **Maintain clear boundaries** between different domains
- **Test components in isolation** before integration

### The Composition Principle

In Composable Svelte, reducers compose like Lego blocks. A parent reducer can embed child reducers, each managing a slice of state:

```
┌─────────────────────────────────────┐
│         App Reducer (Parent)        │
│  ┌─────────────┐  ┌─────────────┐  │
│  │   Counter   │  │    Todos    │  │
│  │  (Child)    │  │   (Child)   │  │
│  └─────────────┘  └─────────────┘  │
└─────────────────────────────────────┘
```

### Key Concepts

- **Parent Reducer**: A reducer that manages overall application state
- **Child Reducer**: A smaller reducer focused on a specific domain
- **Scoping**: The process of embedding a child reducer into a parent
- **Lifting**: Transforming child actions/effects into parent actions/effects

## The scope() Operator

The `scope()` function is the fundamental composition primitive. It embeds a child reducer into a parent reducer by bridging the gap between their different state and action types.

### Function Signature

```typescript
function scope<ParentState, ParentAction, ChildState, ChildAction, Dependencies>(
  toChildState: (parent: ParentState) => ChildState,
  fromChildState: (parent: ParentState, child: ChildState) => ParentState,
  toChildAction: (parent: ParentAction) => ChildAction | null,
  fromChildAction: (child: ChildAction) => ParentAction,
  childReducer: Reducer<ChildState, ChildAction, Dependencies>
): Reducer<ParentState, ParentAction, Dependencies>
```

### Parameters

1. **`toChildState`** - Extract child state from parent state
   - Type: `(parent: ParentState) => ChildState`
   - Example: `(s) => s.counter`

2. **`fromChildState`** - Embed child state back into parent state
   - Type: `(parent: ParentState, child: ChildState) => ParentState`
   - Example: `(s, c) => ({ ...s, counter: c })`

3. **`toChildAction`** - Extract child action from parent action (or return null)
   - Type: `(parent: ParentAction) => ChildAction | null`
   - Example: `(a) => a.type === 'counter' ? a.action : null`

4. **`fromChildAction`** - Wrap child action into parent action
   - Type: `(child: ChildAction) => ParentAction`
   - Example: `(ca) => ({ type: 'counter', action: ca })`

5. **`childReducer`** - The child reducer to compose
   - Type: `Reducer<ChildState, ChildAction, Dependencies>`

### How It Works

The `scope()` operator follows these steps:

```typescript
// 1. Extract child action from parent action
const childAction = toChildAction(parentAction);

// 2. If no child action, return unchanged state
if (childAction === null) {
  return [parentState, Effect.none()];
}

// 3. Extract child state from parent state
const childState = toChildState(parentState);

// 4. Run child reducer
const [newChildState, childEffect] = childReducer(childState, childAction, deps);

// 5. Embed new child state back into parent state
const newParentState = fromChildState(parentState, newChildState);

// 6. Lift child effects to parent actions
const parentEffect = Effect.map(childEffect, fromChildAction);

// 7. Return updated parent state and lifted effect
return [newParentState, parentEffect];
```

### Basic Example

Let's compose a counter reducer into an app reducer:

```typescript
import { scope, Effect } from '@composable-svelte/core';
import type { Reducer } from '@composable-svelte/core';

// ============================================================================
// Child Feature: Counter
// ============================================================================

interface CounterState {
  count: number;
}

type CounterAction =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'reset' };

const counterReducer: Reducer<CounterState, CounterAction> = (state, action) => {
  switch (action.type) {
    case 'increment':
      return [{ ...state, count: state.count + 1 }, Effect.none()];
    case 'decrement':
      return [{ ...state, count: state.count - 1 }, Effect.none()];
    case 'reset':
      return [{ ...state, count: 0 }, Effect.none()];
    default:
      return [state, Effect.none()];
  }
};

// ============================================================================
// Parent Feature: App
// ============================================================================

interface AppState {
  counter: CounterState;
  user: string;
}

type AppAction =
  | { type: 'counter'; action: CounterAction }
  | { type: 'setUser'; name: string };

// Compose counter into app
const counterInApp = scope(
  // 1. Extract counter state
  (s: AppState) => s.counter,

  // 2. Embed counter state back
  (s, c) => ({ ...s, counter: c }),

  // 3. Extract counter action (or null)
  (a: AppAction) => (a.type === 'counter' ? a.action : null),

  // 4. Wrap counter action
  (ca) => ({ type: 'counter', action: ca }),

  // 5. The child reducer
  counterReducer
);

// Create full app reducer
const appReducer: Reducer<AppState, AppAction> = (state, action, deps) => {
  // Handle app-specific actions
  if (action.type === 'setUser') {
    return [{ ...state, user: action.name }, Effect.none()];
  }

  // Delegate to scoped counter
  return counterInApp(state, action, deps);
};

// Usage
const initialState: AppState = {
  counter: { count: 0 },
  user: 'Alice'
};

const [newState, effect] = appReducer(
  initialState,
  { type: 'counter', action: { type: 'increment' } },
  {}
);

console.log(newState.counter.count); // 1
console.log(newState.user); // 'Alice'
```

### Effect Lifting

When a child reducer returns an effect, `scope()` automatically lifts it to parent actions:

```typescript
const asyncCounterReducer: Reducer<CounterState, CounterAction> = (state, action) => {
  if (action.type === 'increment') {
    return [
      { ...state, count: state.count + 1 },
      Effect.run(async (dispatch) => {
        await new Promise(r => setTimeout(r, 1000));
        dispatch({ type: 'decrement' }); // Child action
      })
    ];
  }
  return [state, Effect.none()];
};

const counterInApp = scope(
  (s: AppState) => s.counter,
  (s, c) => ({ ...s, counter: c }),
  (a: AppAction) => (a.type === 'counter' ? a.action : null),
  (ca) => ({ type: 'counter', action: ca }), // Effect will dispatch parent action!
  asyncCounterReducer
);

// When child dispatches { type: 'decrement' }
// Parent receives { type: 'counter', action: { type: 'decrement' } }
```

## The scopeAction() Helper

For the common pattern where child actions are wrapped in a parent action with an `action` field, use `scopeAction()` to reduce boilerplate.

### Function Signature

```typescript
function scopeAction<ParentState, ParentAction extends { type: string }, ChildState, ChildAction, Dependencies>(
  toChildState: (parent: ParentState) => ChildState,
  fromChildState: (parent: ParentState, child: ChildState) => ParentState,
  actionType: string,
  childReducer: Reducer<ChildState, ChildAction, Dependencies>
): Reducer<ParentState, ParentAction, Dependencies>
```

### Comparison

```typescript
// Using scope() - explicit
const counterInApp = scope(
  (s: AppState) => s.counter,
  (s, c) => ({ ...s, counter: c }),
  (a: AppAction) => (a.type === 'counter' ? a.action : null),
  (ca) => ({ type: 'counter', action: ca }),
  counterReducer
);

// Using scopeAction() - shorter
const counterInApp = scopeAction(
  (s: AppState) => s.counter,
  (s, c) => ({ ...s, counter: c }),
  'counter',
  counterReducer
);
```

Both produce identical results. Use `scopeAction()` when your parent actions follow the `{ type: string; action: T }` pattern.

### Example

```typescript
import { scopeAction } from '@composable-svelte/core';

type AppAction =
  | { type: 'counter'; action: CounterAction }
  | { type: 'todos'; action: TodosAction }
  | { type: 'user'; action: UserAction };

const appReducer = (state: AppState, action: AppAction, deps) => {
  // Compose all children using scopeAction
  const counterScope = scopeAction(
    s => s.counter,
    (s, c) => ({ ...s, counter: c }),
    'counter',
    counterReducer
  );

  const todosScope = scopeAction(
    s => s.todos,
    (s, t) => ({ ...s, todos: t }),
    'todos',
    todosReducer
  );

  // Try each scope in turn
  const [afterCounter, counterEffect] = counterScope(state, action, deps);
  if (counterEffect._tag !== 'None') {
    return [afterCounter, counterEffect];
  }

  const [afterTodos, todosEffect] = todosScope(afterCounter, action, deps);
  if (todosEffect._tag !== 'None') {
    return [afterTodos, todosEffect];
  }

  return [state, Effect.none()];
};
```

## The combineReducers() Function

The `combineReducers()` function is a Redux-style utility for combining multiple slice reducers that each handle the same action type.

### Function Signature

```typescript
function combineReducers<State extends Record<string, any>, Action, Dependencies>(
  reducers: {
    [K in keyof State]: Reducer<State[K], Action, Dependencies>;
  }
): Reducer<State, Action, Dependencies>
```

### How It Works

```typescript
// 1. For each slice of state:
//    a. Call the corresponding reducer
//    b. Update that slice in the new state
//    c. Collect any effects

// 2. Return combined state and batched effects
```

### When to Use

Use `combineReducers()` when:

- Multiple reducers need to handle the **same action**
- Each reducer manages a **different slice** of state
- You want Redux-style slice reducers

### Example

```typescript
import { combineReducers } from '@composable-svelte/core';

interface AppState {
  counter: CounterState;
  todos: TodosState;
  user: UserState;
}

type AppAction =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'addTodo'; text: string }
  | { type: 'setUser'; name: string };

// Counter only cares about increment/decrement
const counterReducer: Reducer<CounterState, AppAction> = (state, action) => {
  switch (action.type) {
    case 'increment':
      return [{ ...state, count: state.count + 1 }, Effect.none()];
    case 'decrement':
      return [{ ...state, count: state.count - 1 }, Effect.none()];
    default:
      return [state, Effect.none()]; // Ignore other actions
  }
};

// Todos only care about addTodo
const todosReducer: Reducer<TodosState, AppAction> = (state, action) => {
  switch (action.type) {
    case 'addTodo':
      return [
        { ...state, items: [...state.items, action.text] },
        Effect.none()
      ];
    default:
      return [state, Effect.none()];
  }
};

// User only cares about setUser
const userReducer: Reducer<UserState, AppAction> = (state, action) => {
  switch (action.type) {
    case 'setUser':
      return [{ ...state, name: action.name }, Effect.none()];
    default:
      return [state, Effect.none()];
  }
};

// Combine all slices
const appReducer = combineReducers({
  counter: counterReducer,
  todos: todosReducer,
  user: userReducer
});

// Usage
const initialState: AppState = {
  counter: { count: 0 },
  todos: { items: [] },
  user: { name: 'Alice' }
};

// Only counter updates
const [state1] = appReducer(initialState, { type: 'increment' }, {});
console.log(state1.counter.count); // 1
console.log(state1.todos.items); // []

// Only todos updates
const [state2] = appReducer(state1, { type: 'addTodo', text: 'Buy milk' }, {});
console.log(state2.counter.count); // 1
console.log(state2.todos.items); // ['Buy milk']
```

### Effect Batching

If multiple reducers return effects, they are automatically batched:

```typescript
const counterReducer: Reducer<CounterState, AppAction> = (state, action) => {
  if (action.type === 'increment') {
    return [
      { count: state.count + 1 },
      Effect.fireAndForget(async () => console.log('Counter incremented'))
    ];
  }
  return [state, Effect.none()];
};

const todosReducer: Reducer<TodosState, AppAction> = (state, action) => {
  if (action.type === 'increment') {
    return [
      state,
      Effect.fireAndForget(async () => console.log('Todos saw increment'))
    ];
  }
  return [state, Effect.none()];
};

const appReducer = combineReducers({
  counter: counterReducer,
  todos: todosReducer
});

// Both effects execute!
const [state, effect] = appReducer(initialState, { type: 'increment' }, {});
// effect._tag === 'Batch'
// Logs: "Counter incremented" and "Todos saw increment"
```

### Performance Optimization

`combineReducers()` only creates a new state object if at least one slice changed:

```typescript
const [newState] = appReducer(state, { type: 'unknownAction' }, {});

// If no reducer handled the action
newState === state; // true (same reference)
```

## Composition Patterns

### Pattern 1: Parent-Child Composition

A parent feature embeds a single child feature:

```typescript
interface ParentState {
  child: ChildState;
  parentData: string;
}

type ParentAction =
  | { type: 'child'; action: ChildAction }
  | { type: 'parentAction' };

const parentReducer = (state: ParentState, action: ParentAction, deps) => {
  // Handle parent actions
  if (action.type === 'parentAction') {
    return [{ ...state, parentData: 'updated' }, Effect.none()];
  }

  // Delegate to child
  const childScope = scopeAction(
    s => s.child,
    (s, c) => ({ ...s, child: c }),
    'child',
    childReducer
  );

  return childScope(state, action, deps);
};
```

### Pattern 2: Sibling Composition

Multiple independent children managed by a parent:

```typescript
interface AppState {
  featureA: FeatureAState;
  featureB: FeatureBState;
  featureC: FeatureCState;
}

type AppAction =
  | { type: 'featureA'; action: FeatureAAction }
  | { type: 'featureB'; action: FeatureBAction }
  | { type: 'featureC'; action: FeatureCAction };

const appReducer = combineReducers({
  featureA: scopeAction(
    s => s,
    (_, c) => c,
    'featureA',
    featureAReducer
  ),
  featureB: scopeAction(
    s => s,
    (_, c) => c,
    'featureB',
    featureBReducer
  ),
  featureC: scopeAction(
    s => s,
    (_, c) => c,
    'featureC',
    featureCReducer
  )
});
```

### Pattern 3: Nested Composition

Deep nesting of features:

```typescript
interface AppState {
  features: {
    dashboard: DashboardState;
    settings: SettingsState;
  };
  ui: UIState;
}

// Compose dashboard into features
const dashboardInFeatures = scopeAction(
  s => s.dashboard,
  (s, d) => ({ ...s, dashboard: d }),
  'dashboard',
  dashboardReducer
);

// Compose features into app
const featuresInApp = scope(
  s => s.features,
  (s, f) => ({ ...s, features: f }),
  a => a.type === 'features' ? a.action : null,
  action => ({ type: 'features', action }),
  dashboardInFeatures // Nested!
);
```

### Pattern 4: Optional Children (Navigation)

Compose reducers for optional/nullable state (common in navigation):

```typescript
interface ParentState {
  destination: ChildState | null;
}

type ParentAction =
  | { type: 'showChild' }
  | { type: 'destination'; action: PresentationAction<ChildAction> };

const parentReducer = (state: ParentState, action: ParentAction, deps) => {
  switch (action.type) {
    case 'showChild':
      return [
        { ...state, destination: { /* initial child state */ } },
        Effect.none()
      ];

    case 'destination':
      // Only process if child is present
      if (state.destination === null) {
        return [state, Effect.none()];
      }

      // Handle dismiss
      if (action.action.type === 'dismiss') {
        return [{ ...state, destination: null }, Effect.none()];
      }

      // Delegate to child
      const [newChild, effect] = childReducer(
        state.destination,
        action.action.action,
        deps
      );

      return [
        { ...state, destination: newChild },
        Effect.map(effect, ca => ({
          type: 'destination',
          action: { type: 'presented', action: ca }
        }))
      ];
  }

  return [state, Effect.none()];
};
```

### Pattern 5: Multiple Composition Strategies

Combining `scope()` and `combineReducers()`:

```typescript
interface AppState {
  // Managed by combineReducers
  slices: {
    counter: CounterState;
    todos: TodosState;
  };
  // Managed by scope
  settings: SettingsState;
}

// Combine slices
const slicesReducer = combineReducers({
  counter: counterReducer,
  todos: todosReducer
});

// Scope slices into app
const slicesInApp = scope(
  s => s.slices,
  (s, slices) => ({ ...s, slices }),
  a => a.type === 'slices' ? a.action : null,
  action => ({ type: 'slices', action }),
  slicesReducer
);

// Scope settings into app
const settingsInApp = scopeAction(
  s => s.settings,
  (s, settings) => ({ ...s, settings }),
  'settings',
  settingsReducer
);

// Combine both scopes
const appReducer = (state: AppState, action: AppAction, deps) => {
  const [afterSlices, slicesEffect] = slicesInApp(state, action, deps);
  if (slicesEffect._tag !== 'None') {
    return [afterSlices, slicesEffect];
  }

  return settingsInApp(afterSlices, action, deps);
};
```

## Real-World Examples

### Example 1: Todo App with Categories

```typescript
import { scope, combineReducers, Effect } from '@composable-svelte/core';
import type { Reducer } from '@composable-svelte/core';

// ============================================================================
// Todos Feature
// ============================================================================

interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

interface TodosState {
  items: Todo[];
  filter: 'all' | 'active' | 'completed';
}

type TodosAction =
  | { type: 'addTodo'; text: string }
  | { type: 'toggleTodo'; id: string }
  | { type: 'setFilter'; filter: 'all' | 'active' | 'completed' };

const todosReducer: Reducer<TodosState, TodosAction> = (state, action) => {
  switch (action.type) {
    case 'addTodo':
      return [
        {
          ...state,
          items: [
            ...state.items,
            { id: crypto.randomUUID(), text: action.text, completed: false }
          ]
        },
        Effect.none()
      ];

    case 'toggleTodo':
      return [
        {
          ...state,
          items: state.items.map(todo =>
            todo.id === action.id ? { ...todo, completed: !todo.completed } : todo
          )
        },
        Effect.none()
      ];

    case 'setFilter':
      return [{ ...state, filter: action.filter }, Effect.none()];

    default:
      return [state, Effect.none()];
  }
};

// ============================================================================
// Categories Feature
// ============================================================================

interface Category {
  id: string;
  name: string;
  color: string;
}

interface CategoriesState {
  items: Category[];
  selected: string | null;
}

type CategoriesAction =
  | { type: 'addCategory'; name: string; color: string }
  | { type: 'selectCategory'; id: string };

const categoriesReducer: Reducer<CategoriesState, CategoriesAction> = (state, action) => {
  switch (action.type) {
    case 'addCategory':
      return [
        {
          ...state,
          items: [
            ...state.items,
            { id: crypto.randomUUID(), name: action.name, color: action.color }
          ]
        },
        Effect.none()
      ];

    case 'selectCategory':
      return [{ ...state, selected: action.id }, Effect.none()];

    default:
      return [state, Effect.none()];
  }
};

// ============================================================================
// App (Compose Features)
// ============================================================================

interface AppState {
  todos: TodosState;
  categories: CategoriesState;
}

type AppAction =
  | { type: 'todos'; action: TodosAction }
  | { type: 'categories'; action: CategoriesAction };

const appReducer = combineReducers({
  todos: scopeAction(
    s => s,
    (_, c) => c,
    'todos',
    todosReducer
  ),
  categories: scopeAction(
    s => s,
    (_, c) => c,
    'categories',
    categoriesReducer
  )
});

// Usage
const store = createStore({
  initialState: {
    todos: { items: [], filter: 'all' },
    categories: { items: [], selected: null }
  },
  reducer: appReducer,
  dependencies: {}
});

// Add todo
store.dispatch({
  type: 'todos',
  action: { type: 'addTodo', text: 'Learn composition' }
});

// Add category
store.dispatch({
  type: 'categories',
  action: { type: 'addCategory', name: 'Work', color: 'blue' }
});
```

### Example 2: E-commerce Cart with Sync

```typescript
// ============================================================================
// Cart Feature
// ============================================================================

interface CartItem {
  productId: string;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  syncing: boolean;
}

type CartAction =
  | { type: 'addItem'; productId: string }
  | { type: 'removeItem'; productId: string }
  | { type: 'syncStarted' }
  | { type: 'syncCompleted' };

interface CartDependencies {
  api: {
    syncCart: (items: CartItem[]) => Promise<void>;
  };
}

const cartReducer: Reducer<CartState, CartAction, CartDependencies> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'addItem':
      const newItems = state.items.some(i => i.productId === action.productId)
        ? state.items.map(i =>
            i.productId === action.productId
              ? { ...i, quantity: i.quantity + 1 }
              : i
          )
        : [...state.items, { productId: action.productId, quantity: 1 }];

      return [
        { ...state, items: newItems, syncing: true },
        Effect.batch(
          Effect.run(async (dispatch) => {
            dispatch({ type: 'syncStarted' });
            await deps.api.syncCart(newItems);
            dispatch({ type: 'syncCompleted' });
          })
        )
      ];

    case 'removeItem':
      const filtered = state.items.filter(i => i.productId !== action.productId);

      return [
        { ...state, items: filtered, syncing: true },
        Effect.run(async (dispatch) => {
          await deps.api.syncCart(filtered);
          dispatch({ type: 'syncCompleted' });
        })
      ];

    case 'syncStarted':
      return [{ ...state, syncing: true }, Effect.none()];

    case 'syncCompleted':
      return [{ ...state, syncing: false }, Effect.none()];

    default:
      return [state, Effect.none()];
  }
};

// ============================================================================
// Products Feature
// ============================================================================

interface Product {
  id: string;
  name: string;
  price: number;
}

interface ProductsState {
  items: Product[];
  loading: boolean;
}

type ProductsAction =
  | { type: 'loadProducts' }
  | { type: 'productsLoaded'; products: Product[] };

interface ProductsDependencies {
  api: {
    fetchProducts: () => Promise<Product[]>;
  };
}

const productsReducer: Reducer<ProductsState, ProductsAction, ProductsDependencies> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'loadProducts':
      return [
        { ...state, loading: true },
        Effect.run(async (dispatch) => {
          const products = await deps.api.fetchProducts();
          dispatch({ type: 'productsLoaded', products });
        })
      ];

    case 'productsLoaded':
      return [
        { items: action.products, loading: false },
        Effect.none()
      ];

    default:
      return [state, Effect.none()];
  }
};

// ============================================================================
// App (Compose)
// ============================================================================

interface AppState {
  cart: CartState;
  products: ProductsState;
}

type AppAction =
  | { type: 'cart'; action: CartAction }
  | { type: 'products'; action: ProductsAction };

interface AppDependencies {
  api: {
    syncCart: (items: CartItem[]) => Promise<void>;
    fetchProducts: () => Promise<Product[]>;
  };
}

const appReducer = combineReducers({
  cart: scopeAction(
    s => s,
    (_, c) => c,
    'cart',
    cartReducer
  ),
  products: scopeAction(
    s => s,
    (_, c) => c,
    'products',
    productsReducer
  )
});

// Create store
const store = createStore({
  initialState: {
    cart: { items: [], syncing: false },
    products: { items: [], loading: false }
  },
  reducer: appReducer,
  dependencies: {
    api: {
      syncCart: async (items) => {
        await fetch('/api/cart', {
          method: 'POST',
          body: JSON.stringify(items)
        });
      },
      fetchProducts: async () => {
        const res = await fetch('/api/products');
        return res.json();
      }
    }
  }
});
```

### Example 3: Nested Settings UI

```typescript
// ============================================================================
// Notification Settings (Leaf)
// ============================================================================

interface NotificationSettings {
  email: boolean;
  push: boolean;
  sms: boolean;
}

type NotificationAction =
  | { type: 'toggleEmail' }
  | { type: 'togglePush' }
  | { type: 'toggleSMS' };

const notificationReducer: Reducer<NotificationSettings, NotificationAction> = (
  state,
  action
) => {
  switch (action.type) {
    case 'toggleEmail':
      return [{ ...state, email: !state.email }, Effect.none()];
    case 'togglePush':
      return [{ ...state, push: !state.push }, Effect.none()];
    case 'toggleSMS':
      return [{ ...state, sms: !state.sms }, Effect.none()];
    default:
      return [state, Effect.none()];
  }
};

// ============================================================================
// Privacy Settings (Leaf)
// ============================================================================

interface PrivacySettings {
  profilePublic: boolean;
  showEmail: boolean;
  allowMessages: boolean;
}

type PrivacyAction =
  | { type: 'toggleProfilePublic' }
  | { type: 'toggleShowEmail' }
  | { type: 'toggleAllowMessages' };

const privacyReducer: Reducer<PrivacySettings, PrivacyAction> = (state, action) => {
  switch (action.type) {
    case 'toggleProfilePublic':
      return [{ ...state, profilePublic: !state.profilePublic }, Effect.none()];
    case 'toggleShowEmail':
      return [{ ...state, showEmail: !state.showEmail }, Effect.none()];
    case 'toggleAllowMessages':
      return [{ ...state, allowMessages: !state.allowMessages }, Effect.none()];
    default:
      return [state, Effect.none()];
  }
};

// ============================================================================
// Settings (Compose Leaves)
// ============================================================================

interface SettingsState {
  notifications: NotificationSettings;
  privacy: PrivacySettings;
}

type SettingsAction =
  | { type: 'notifications'; action: NotificationAction }
  | { type: 'privacy'; action: PrivacyAction };

const settingsReducer = combineReducers({
  notifications: scopeAction(
    s => s,
    (_, c) => c,
    'notifications',
    notificationReducer
  ),
  privacy: scopeAction(
    s => s,
    (_, c) => c,
    'privacy',
    privacyReducer
  )
});

// ============================================================================
// App (Compose Settings)
// ============================================================================

interface AppState {
  user: string;
  settings: SettingsState;
}

type AppAction =
  | { type: 'setUser'; name: string }
  | { type: 'settings'; action: SettingsAction };

const appReducer = (state: AppState, action: AppAction, deps) => {
  if (action.type === 'setUser') {
    return [{ ...state, user: action.name }, Effect.none()];
  }

  const settingsScope = scopeAction(
    s => s.settings,
    (s, settings) => ({ ...s, settings }),
    'settings',
    settingsReducer
  );

  return settingsScope(state, action, deps);
};

// Usage - deeply nested action!
store.dispatch({
  type: 'settings',
  action: {
    type: 'notifications',
    action: { type: 'toggleEmail' }
  }
});
// Path: app.settings.notifications.email
```

## Testing Composed Reducers

### Testing Child Reducers in Isolation

Test child reducers independently before composing:

```typescript
import { describe, it, expect } from 'vitest';

describe('counterReducer', () => {
  it('increments count', () => {
    const initialState: CounterState = { count: 0 };
    const [newState] = counterReducer(
      initialState,
      { type: 'increment' },
      {}
    );

    expect(newState.count).toBe(1);
  });

  it('decrements count', () => {
    const initialState: CounterState = { count: 5 };
    const [newState] = counterReducer(
      initialState,
      { type: 'decrement' },
      {}
    );

    expect(newState.count).toBe(4);
  });
});
```

### Testing Composed Reducers

Test the composed reducer as a whole:

```typescript
describe('appReducer', () => {
  it('updates counter through composition', () => {
    const initialState: AppState = {
      counter: { count: 0 },
      user: 'Alice'
    };

    const [newState] = appReducer(
      initialState,
      { type: 'counter', action: { type: 'increment' } },
      {}
    );

    expect(newState.counter.count).toBe(1);
    expect(newState.user).toBe('Alice'); // Unchanged
  });

  it('ignores unrelated actions', () => {
    const initialState: AppState = {
      counter: { count: 5 },
      user: 'Alice'
    };

    const [newState] = appReducer(
      initialState,
      { type: 'unknownAction' } as any,
      {}
    );

    // State unchanged (same reference)
    expect(newState).toBe(initialState);
  });
});
```

### Testing Effect Lifting

Verify effects are properly lifted:

```typescript
describe('effect lifting', () => {
  it('lifts child effects to parent actions', async () => {
    const asyncCounterReducer: Reducer<CounterState, CounterAction> = (state, action) => {
      if (action.type === 'increment') {
        return [
          { count: state.count + 1 },
          Effect.run(async (dispatch) => {
            dispatch({ type: 'decrement' });
          })
        ];
      }
      return [state, Effect.none()];
    };

    const composed = scopeAction(
      s => s.counter,
      (s, c) => ({ ...s, counter: c }),
      'counter',
      asyncCounterReducer
    );

    const store = createTestStore({
      initialState: { counter: { count: 0 } },
      reducer: composed,
      dependencies: {}
    });

    // Send increment (which triggers effect)
    await store.send({ type: 'counter', action: { type: 'increment' } }, state => {
      expect(state.counter.count).toBe(1);
    });

    // Receive the lifted decrement
    await store.receive({ type: 'counter', action: { type: 'decrement' } }, state => {
      expect(state.counter.count).toBe(0);
    });
  });
});
```

### Testing combineReducers

Test that multiple reducers work together:

```typescript
describe('combineReducers', () => {
  it('updates multiple slices independently', () => {
    const appReducer = combineReducers({
      counter: counterReducer,
      todos: todosReducer
    });

    const initialState = {
      counter: { count: 0 },
      todos: { items: [] }
    };

    // Update counter
    const [state1] = appReducer(initialState, { type: 'increment' }, {});
    expect(state1.counter.count).toBe(1);
    expect(state1.todos.items).toEqual([]);

    // Update todos
    const [state2] = appReducer(state1, { type: 'addTodo', text: 'Test' }, {});
    expect(state2.counter.count).toBe(1);
    expect(state2.todos.items).toEqual(['Test']);
  });

  it('batches effects from multiple reducers', () => {
    // ... (see earlier example)
  });
});
```

## Best Practices

### 1. Start Small, Compose Up

Build and test small reducers first, then compose:

```typescript
// ✅ GOOD: Build incrementally
// 1. Build and test counterReducer
// 2. Build and test todosReducer
// 3. Compose into appReducer
// 4. Test composition

// ❌ BAD: Build everything at once
const giantReducer = (state, action) => {
  // 500 lines of intertwined logic
};
```

### 2. Clear Boundaries

Each reducer should have a clear responsibility:

```typescript
// ✅ GOOD: Clear boundaries
const userReducer = // Only user state
const settingsReducer = // Only settings state
const cartReducer = // Only cart state

// ❌ BAD: Mixed responsibilities
const appReducer = (state, action) => {
  // Handles user, settings, cart all in one place
};
```

### 3. Consistent Action Naming

Use consistent patterns for composed actions:

```typescript
// ✅ GOOD: Consistent structure
type AppAction =
  | { type: 'counter'; action: CounterAction }
  | { type: 'todos'; action: TodosAction }
  | { type: 'user'; action: UserAction };

// ❌ BAD: Inconsistent structure
type AppAction =
  | { type: 'counter'; action: CounterAction }
  | { type: 'updateTodos'; payload: TodosAction }
  | UserAction; // Directly embedded
```

### 4. Explicit State Shapes

Define clear state interfaces for composed state:

```typescript
// ✅ GOOD: Explicit composition
interface AppState {
  counter: CounterState;
  todos: TodosState;
  user: UserState;
}

// ❌ BAD: Implicit composition
interface AppState {
  count: number;  // From counter
  items: Todo[];  // From todos
  name: string;   // From user
  // Hard to see boundaries!
}
```

### 5. Use scopeAction() for Common Patterns

Reduce boilerplate with helpers:

```typescript
// ✅ GOOD: Use scopeAction when applicable
const composed = scopeAction(s => s.child, (s, c) => ({ ...s, child: c }), 'child', childReducer);

// ❌ BAD: Manual scope when helper would work
const composed = scope(
  s => s.child,
  (s, c) => ({ ...s, child: c }),
  a => a.type === 'child' ? a.action : null,
  action => ({ type: 'child', action }),
  childReducer
);
```

### 6. Test at Multiple Levels

Test both in isolation and composed:

```typescript
// ✅ GOOD: Test hierarchy
describe('counterReducer', () => { /* ... */ });
describe('appReducer', () => {
  describe('counter integration', () => { /* ... */ });
});

// ❌ BAD: Only test composed
describe('appReducer', () => {
  // All tests here - hard to isolate failures
});
```

### 7. Document Composition

Add comments explaining the composition structure:

```typescript
/**
 * App Reducer
 *
 * Composition:
 * - counter: scopeAction() - manages counter state
 * - todos: scopeAction() - manages todos state
 * - user: custom logic - handles user + observes child events
 */
const appReducer = ...
```

## Common Pitfalls

### Pitfall 1: Forgetting to Handle null Actions

When `toChildAction` returns null, the parent should return unchanged state:

```typescript
// ❌ BAD: Doesn't check for null
const composed = scope(
  s => s.child,
  (s, c) => ({ ...s, child: c }),
  a => a.type === 'child' ? a.action : null,
  action => ({ type: 'child', action }),
  childReducer
);
// This will crash when toChildAction returns null!

// ✅ GOOD: scope() handles null automatically
// Just use scope() or scopeAction() - they handle this for you!
```

### Pitfall 2: Not Lifting Effects

Forgetting to map child effects to parent actions:

```typescript
// ❌ BAD: Returns child effect directly
const composed = (state: ParentState, action: ParentAction, deps) => {
  const childAction = extractChildAction(action);
  if (!childAction) return [state, Effect.none()];

  const [newChild, childEffect] = childReducer(state.child, childAction, deps);
  return [
    { ...state, child: newChild },
    childEffect // WRONG! This dispatches child actions!
  ];
};

// ✅ GOOD: Map child effects
const parentEffect = Effect.map(childEffect, childAction => ({
  type: 'child',
  action: childAction
}));
```

### Pitfall 3: Mutating State in State Updaters

The `fromChildState` function must not mutate:

```typescript
// ❌ BAD: Mutation
const composed = scope(
  s => s.child,
  (s, c) => {
    s.child = c; // MUTATION!
    return s;
  },
  // ...
);

// ✅ GOOD: Immutable update
const composed = scope(
  s => s.child,
  (s, c) => ({ ...s, child: c }),
  // ...
);
```

### Pitfall 4: Incorrect combineReducers Usage

Using `combineReducers` when reducers need different action types:

```typescript
// ❌ BAD: Different action types
const appReducer = combineReducers({
  counter: counterReducer,  // Takes CounterAction
  todos: todosReducer       // Takes TodosAction
});
// This won't type-check! combineReducers requires same action type.

// ✅ GOOD: Use scopeAction instead
const appReducer = combineReducers({
  counter: scopeAction(s => s, (_, c) => c, 'counter', counterReducer),
  todos: scopeAction(s => s, (_, c) => c, 'todos', todosReducer)
});
```

### Pitfall 5: Over-Nesting

Too many levels of composition make debugging hard:

```typescript
// ❌ BAD: Too deep
app.features.dashboard.widgets.chart.settings.colors.primary
// 7 levels deep!

// ✅ GOOD: Flatter structure
app.dashboard.chartSettings.primaryColor
// 3 levels
```

### Pitfall 6: Tightly Coupled Reducers

Child reducers that depend on parent state:

```typescript
// ❌ BAD: Child needs parent state
const childReducer = (state: ChildState, action: ChildAction, deps) => {
  // How do I access parent.someField?
  // Can't - child is isolated!
};

// ✅ GOOD: Pass parent data as dependency or action payload
const appReducer = (state: AppState, action: AppAction, deps) => {
  if (action.type === 'child') {
    // Enhance child action with parent data
    const enhancedAction = {
      ...action.action,
      parentData: state.someField
    };
    // ...
  }
};
```

### Pitfall 7: Not Preserving State References

Creating new state objects when nothing changed:

```typescript
// ❌ BAD: Always creates new state
const composed = scope(
  s => s.child,
  (s, c) => ({ ...s, child: c }), // Always new object!
  // ...
);

// ✅ GOOD: scope() automatically preserves references when actions don't match
// If toChildAction returns null, scope() returns [parentState, Effect.none()]
// The parentState reference is preserved!
```

## Next Steps

- **[Navigation](../navigation/tree-based.md)** - Learn about `ifLet()` for optional child composition
- **[Testing](./testing.md)** - Advanced testing patterns for composed reducers
- **[Effects](./effects.md)** - Deep dive into the effect system

## Related Documentation

- [Store and Reducers](./store-and-reducers.md) - Core reducer concepts
- [Getting Started](../getting-started.md) - Basic store setup
- [API Reference](../api/reference.md) - Complete composition API documentation
