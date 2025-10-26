# Navigation DSL Specification

**Version:** 1.0.0
**Date:** 2025-10-25
**Status:** Draft

## Overview

This specification defines syntactic sugar and DSL utilities to reduce boilerplate when implementing tree-based navigation in Composable Svelte applications.

### Relationship to Other Specs

This DSL spec provides **ergonomic sugar** on top of navigation-spec.md:

- **navigation-spec.md**: Core navigation primitives (`ifLet`, `PresentationAction`, etc.)
- **navigation-matcher-spec.md**: Type-safe action/state matching via `createDestination()` with matcher APIs
- **navigation-dsl-spec.md (this)**: Additional syntactic sugar for integration, scoping, and views

**Note**: The `createDestination()` function defined in section 1 is a **simplified version** for illustration. The full implementation with matcher APIs (`is`, `extract`, `matchCase`, `match`, `on`) is defined in **navigation-matcher-spec.md**. In practice, you should use the matcher spec's version which includes all features.

This spec focuses on additional DSL utilities like `integrate()`, `scopeTo()`, and `DestinationRouter` that complement the matcher API.

---

## Table of Contents

1. [Function Disambiguation](#function-disambiguation)
2. [Destination Builder DSL](#1-destination-builder-dsl)
3. [Action Matching DSL](#2-action-matching-dsl)
4. [Scope Helpers DSL](#3-scope-helpers-dsl)
5. [Integration DSL](#4-integration-dsl)
6. [View Bindings DSL](#5-view-bindings-dsl)
7. [Complete Example](#6-complete-example)

---

## Function Disambiguation

This framework provides several similarly-named functions that serve different purposes. This section clarifies when to use each.

### `scope()` vs `scopeTo()` vs `ifLet()`

| Function | Defined In | Purpose | Used In | Example |
|----------|-----------|---------|---------|---------|
| **`scope()`** | composable-svelte-spec.md | Compose child reducer into parent reducer | **Reducers** (business logic) | Embed counter reducer in app reducer |
| **`ifLet()`** | navigation-spec.md | Handle optional/nullable child state in reducers | **Reducers** (optional features) | Handle modal that may or may not be present |
| **`scopeTo()`** | navigation-dsl-spec.md (this spec) | Create scoped store view for components | **Views** (Svelte components) | Pass scoped store to child component |

### When to Use Each

**Use `scope()`** when:
- Composing a permanent child feature into a parent feature
- Child state is always present (non-nullable)
- Working at the reducer/business logic layer
- Example: App has both Counter and Todos features

```typescript
// In reducer composition
const appReducer = combineReducers({
  counter: scope(
    (s: AppState) => s.counter,
    (s, c) => ({ ...s, counter: c }),
    (a: AppAction) => a.type === 'counter' ? a.action : null,
    (ca) => ({ type: 'counter', action: ca }),
    counterReducer
  )
});
```

**Use `ifLet()`** when:
- Child state is optional/nullable
- Need to handle presentation/dismissal logic
- Working at the reducer/business logic layer
- Example: Modal or sheet that may be dismissed

```typescript
// In reducer for optional child
case 'destination': {
  return ifLet(
    state.destination,
    (destination) => {
      const [newDest, effect] = destinationReducer(destination, action.action, deps);
      return [
        { ...state, destination: newDest },
        Effect.map(effect, (a) => ({ type: 'destination', action: a }))
      ];
    },
    () => [state, Effect.none()]
  );
}
```

**Use `scopeTo()`** when:
- Passing a scoped view of the store to a child component
- Working at the view/component layer
- Want fluent/chainable API for nested scoping
- Example: Routing store props to destination child component

```typescript
// In Svelte component
const destinationStore = store
  .scopeTo('destination')
  .scopeTo('presented')
  .scopeTo(state => state.type === 'addItem' ? state.state : null);

{#if destinationStore}
  <AddItem store={destinationStore} />
{/if}
```

### Quick Reference

| Scenario | Use |
|----------|-----|
| Embedding Counter feature in App feature | `scope()` in reducer |
| Handling optional modal/sheet state | `ifLet()` in reducer |
| Passing store to child component | `scopeTo()` in component |
| Composing multiple features permanently | `scope()` or `combineReducers()` |
| Presentation/dismissal of destinations | `ifLet()` |
| Chaining multiple scopes in view | `scopeTo().scopeTo()` |

---

## 1. Destination Builder DSL

### Problem: Verbose Destination Definition

**Before (Manual)**:
```typescript
// Manually define state union
type DestinationState =
  | { type: 'addItem'; state: AddItemState }
  | { type: 'editItem'; state: EditItemState }
  | { type: 'detailItem'; state: DetailItemState };

// Manually define action union
type DestinationAction =
  | { type: 'addItem'; action: AddItemAction }
  | { type: 'editItem'; action: EditItemAction }
  | { type: 'detailItem'; action: DetailItemAction };

// Manually create reducer
const destinationReducer: Reducer<DestinationState, DestinationAction> = (
  state,
  action,
  deps
) => {
  if (state.type !== action.type) return [state, Effect.none()];

  switch (state.type) {
    case 'addItem':
      if (action.type === 'addItem') {
        const [s, e] = addItemReducer(state.state, action.action, deps);
        return [
          { type: 'addItem', state: s },
          Effect.map(e, a => ({ type: 'addItem', action: a }))
        ];
      }
      break;
    // ... repeat for each case
  }
  return [state, Effect.none()];
};
```

### Solution: Destination Builder

**After (DSL)**:
```typescript
import { createDestination } from '$lib/composable/navigation';
import { addItemReducer } from './add-item/reducer';
import { editItemReducer } from './edit-item/reducer';
import { detailItemReducer } from './detail-item/reducer';

// Define destination in one place
const Destination = createDestination({
  addItem: addItemReducer,
  editItem: editItemReducer,
  detailItem: detailItemReducer
});

// Access generated types and reducer
type DestinationState = Destination.State;
type DestinationAction = Destination.Action;
const destinationReducer = Destination.reducer;
```

### Implementation

> **⚠️ IMPORTANT**: The implementation shown below is a **simplified version** for understanding the concept.
>
> **For production use**, see **navigation-matcher-spec.md** which provides the full implementation with:
> - `Destination.is(action, 'casePath')` - Type-safe action matching
> - `Destination.extract(state, 'case')` - State extraction
> - `Destination.matchCase(action, state, 'casePath')` - Combined matching
> - `Destination.match(action, state, handlers)` - Multi-case matching
> - `Destination.on(store, 'casePath', handler)` - Reactive subscriptions
>
> The simplified version below only includes `initial()`, `match()`, and `extract()` helpers.

```typescript
// lib/composable/navigation/destination.ts

import type { Reducer } from '../types';
import { Effect } from '../effect';

/**
 * Create a destination from a map of reducers.
 * Automatically generates State and Action types, plus reducer implementation.
 *
 * NOTE: This is a simplified implementation for illustration.
 * See navigation-matcher-spec.md for the full version with matcher APIs.
 */
export function createDestination<
  Reducers extends Record<string, Reducer<any, any>>
>(reducers: Reducers) {
  // Infer State type from reducers
  type State = {
    [K in keyof Reducers]: {
      type: K;
      state: Reducers[K] extends Reducer<infer S, any> ? S : never;
    };
  }[keyof Reducers];

  // Infer Action type from reducers
  type Action = {
    [K in keyof Reducers]: {
      type: K;
      action: Reducers[K] extends Reducer<any, infer A> ? A : never;
    };
  }[keyof Reducers];

  // Create reducer
  const reducer: Reducer<State, Action> = (state, action, deps) => {
    const key = state.type as keyof Reducers;

    if (state.type !== action.type) {
      return [state, Effect.none()];
    }

    const childReducer = reducers[key];
    const [newState, effect] = childReducer(
      (state as any).state,
      (action as any).action,
      deps
    );

    return [
      { type: state.type, state: newState } as State,
      Effect.map(effect, (a) => ({ type: action.type, action: a } as Action))
    ];
  };

  // Helper: Create initial state for a specific case
  function initial<K extends keyof Reducers>(
    type: K,
    state: Reducers[K] extends Reducer<infer S, any> ? S : never
  ): State {
    return { type, state } as State;
  }

  // Helper: Match specific case
  function match<K extends keyof Reducers>(
    state: State,
    type: K
  ): (Reducers[K] extends Reducer<infer S, any> ? S : never) | null {
    if (state.type === type) {
      return (state as any).state;
    }
    return null;
  }

  return {
    reducer,
    initial,
    match,
    // Type exports (for external use)
    _types: {} as {
      State: State;
      Action: Action;
    }
  };
}

// Type helper to extract State type
export type DestinationState<T> = T extends { _types: { State: infer S } }
  ? S
  : never;

// Type helper to extract Action type
export type DestinationAction<T> = T extends { _types: { Action: infer A } }
  ? A
  : never;
```

### Usage

```typescript
// features/inventory/destination.ts
import { createDestination, type DestinationState as ExtractState, type DestinationAction as ExtractAction } from '$lib/composable/navigation';
import { addItemReducer, type AddItemState, type AddItemAction } from './add-item/reducer';
import { editItemReducer, type EditItemState, type EditItemAction } from './edit-item/reducer';

export const Destination = createDestination({
  addItem: addItemReducer,
  editItem: editItemReducer
});

// Extract types for use elsewhere (rename to avoid circular reference)
export type InventoryDestinationState = ExtractState<typeof Destination>;
export type InventoryDestinationAction = ExtractAction<typeof Destination>;

// Create initial states
const addState = Destination.initial('addItem', initialAddItemState);
const editState = Destination.initial('editItem', initialEditItemState);

// Match specific cases
const addItemState = Destination.match(destination, 'addItem');
if (addItemState) {
  // TypeScript knows this is AddItemState
  console.log(addItemState.name);
}
```

---

## 2. Action Matching DSL

### Problem: Deep Action Nesting

**Before**:
```typescript
// Observing deeply nested child actions
if (
  action.type === 'destination' &&
  action.action.type === 'presented' &&
  action.action.action.type === 'editItem' &&
  action.action.action.action.type === 'saveButtonTapped'
) {
  // Extract state...
  if (state.destination?.type === 'editItem') {
    const item = state.destination.state.item;
    // Finally do something
  }
}
```

### Solution: Use Matcher Spec APIs

**After** (using navigation-matcher-spec.md):
```typescript
import { Destination } from './destination';  // From navigation-matcher-spec.md

// Single case match with state extraction
const editState = Destination.matchCase(
  action,
  state,
  'editItem.saveButtonTapped'
);

if (editState) {
  // editState is correctly typed as EditItemState
  const item = editState.item;
  // Handle save
}

// Or match multiple cases with handlers
const result = Destination.match(action, state, {
  'addItem.saveButtonTapped': (addState) => ({
    type: 'add' as const,
    item: addState.item
  }),
  'editItem.saveButtonTapped': (editState) => ({
    type: 'edit' as const,
    item: editState.item
  })
});

if (result.matched) {
  const { type, item } = result.value;
  // Handle based on type
}
```

### Reference: Matcher Spec APIs

The navigation-matcher-spec.md provides the following APIs on the `Destination` object created by `createDestination()`:

| API | Purpose | Example |
|-----|---------|---------|
| `is(action, 'casePath')` | Check if action matches case path | `Destination.is(action, 'editItem.saveButtonTapped')` |
| `extract(state, 'case')` | Extract state for a case | `Destination.extract(state.destination, 'editItem')` |
| `matchCase(action, state, 'casePath')` | Match action + extract state | `Destination.matchCase(action, state, 'editItem.saveButtonTapped')` |
| `match(action, state, handlers)` | Match multiple cases | See example above |
| `on(store, 'casePath', handler)` | Subscribe to case path | `Destination.on(store, 'editItem.saveButtonTapped', (state) => ...)` |

**Case paths** use dot notation: `'caseType.actionType'` (e.g., `'editItem.saveButtonTapped'`)

For full details, see **navigation-matcher-spec.md**.

---

## 3. Scope Helpers DSL

### Problem: Verbose Store Scoping

**Before**:
```typescript
const addItemStore = $derived(
  store.state.destination?.type === 'addItem'
    ? {
        state: store.state.destination.state,
        dispatch: (action) =>
          store.dispatch({
            type: 'destination',
            action: {
              type: 'presented',
              action: { type: 'addItem', action }
            }
          })
      }
    : null
);
```

### Solution: Scope Utility

**After**:
```typescript
import { scopeTo } from '$lib/composable/navigation';

const addItemStore = $derived(
  scopeTo(store)
    .into('destination')
    .case('addItem')
);
```

### Implementation

```typescript
// lib/composable/navigation/scope.ts

import type { Store } from '../types';

/**
 * Create a fluent store scoping API.
 * Named scopeTo() to avoid confusion with scope() from composable-svelte-spec.md,
 * which is for reducer composition.
 */
export function scopeTo<State, Action>(store: Store<State, Action>) {
  return new ScopeBuilder(store, []);
}

class ScopeBuilder<State, Action, Current = State> {
  constructor(
    private store: Store<State, Action>,
    private path: Array<string | number>
  ) {}

  /**
   * Scope into a field (for optional destinations).
   */
  into<K extends keyof Current>(key: K): ScopeBuilder<State, Action, Current[K]> {
    return new ScopeBuilder(this.store, [...this.path, String(key)]);
  }

  /**
   * Scope into a specific enum case.
   */
  case<T extends string>(
    caseType: T
  ): ScopedStore<any, any> | null {
    const value = this.getValue();

    if (value && typeof value === 'object' && 'type' in value && value.type === caseType) {
      return this.createScopedStore(value.state, caseType);
    }

    return null;
  }

  /**
   * Get current value at path.
   */
  private getValue(): Current {
    let current: any = this.store.state;
    for (const key of this.path) {
      if (current == null) return current;
      current = current[key];
    }
    return current as Current;
  }

  /**
   * Create a scoped store.
   * @param state - The child state
   * @param caseType - The case type (for enum destinations), optional
   */
  private createScopedStore(state: any, caseType?: string): ScopedStore<any, any> {
    return {
      state,
      dispatch: (action: any) => {
        // Build the wrapped action
        let wrapped: any = action;

        // If we have a case type, wrap in the destination case structure
        if (caseType) {
          wrapped = {
            type: caseType,
            action
          };
        }

        // Wrap in presentation action
        wrapped = {
          type: 'presented',
          action: wrapped
        };

        // Wrap in parent action by following the path backwards
        for (let i = this.path.length - 1; i >= 0; i--) {
          const key = this.path[i];
          wrapped = {
            type: key,
            action: wrapped
          };
        }

        this.store.dispatch(wrapped);
      }
    };
  }

  /**
   * For optional values (non-enum destinations), unwrap or return null.
   *
   * Note: Use this for optional state fields that aren't discriminated unions.
   * For enum destinations, use .case() instead.
   */
  optional(): ScopedStore<any, any> | null {
    const value = this.getValue();
    if (value == null) return null;
    // No case type for optional fields
    return this.createScopedStore(value);
  }
}

interface ScopedStore<State, Action> {
  state: State;
  dispatch: (action: Action) => void;
}
```

### Usage in Views

```svelte
<script lang="ts">
  import { scope } from '$lib/composable/navigation';

  const store = createStore({ initialState, reducer });

  // Scope to specific destination cases
  const addItemStore = $derived(scopeTo(store).into('destination').case('addItem'));
  const editItemStore = $derived(scopeTo(store).into('destination').case('editItem'));
  const detailItemStore = $derived(scopeTo(store).into('destination').case('detailItem'));
</script>

<Modal store={addItemStore}>
  {#if addItemStore}
    <AddItemView store={addItemStore} />
  {/if}
</Modal>

<Sheet store={editItemStore}>
  {#if editItemStore}
    <EditItemView store={editItemStore} />
  {/if}
</Sheet>
```

---

## 4. Integration DSL

### Problem: Verbose ifLet Integration

**Before**:
```typescript
const [finalState, childEffect] = ifLet(
  (s: InventoryState) => s.destination,
  (s: InventoryState, dest: DestinationState | null) => ({ ...s, destination: dest }),
  (a: InventoryAction) => {
    if (a.type === 'destination') return a.action;
    return null;
  },
  (a: PresentationAction<DestinationAction>): InventoryAction => ({
    type: 'destination',
    action: a
  }),
  destinationReducer
)(stateAfterCore, action, deps);
```

### Solution: Integration Builder

**After**:
```typescript
import { integrate } from '$lib/composable/navigation';

const reducer = integrate(coreReducer)
  .with('destination', destinationReducer)
  .build();
```

### Implementation

```typescript
// lib/composable/navigation/integrate.ts

import type { Reducer } from '../types';
import { ifLet } from './if-let';
import { Effect } from '../effect';

/**
 * Fluent API for integrating child reducers.
 */
export function integrate<State, Action>(
  coreReducer: Reducer<State, Action>
) {
  return new IntegrationBuilder(coreReducer);
}

class IntegrationBuilder<State, Action> {
  private integrations: Array<(r: Reducer<State, Action>) => Reducer<State, Action>> = [];

  constructor(private coreReducer: Reducer<State, Action>) {}

  /**
   * Integrate a child reducer at a specific field.
   */
  with<K extends keyof State, ChildAction>(
    field: K,
    childReducer: Reducer<NonNullable<State[K]>, ChildAction>
  ): this {
    this.integrations.push((parentReducer) => {
      return (state, action, deps) => {
        const [stateAfterParent, parentEffect] = parentReducer(state, action, deps);

        const [finalState, childEffect] = ifLet(
          (s: State) => s[field] as any,
          (s: State, child: any) => ({ ...s, [field]: child }),
          (a: Action) => {
            if ((a as any).type === field && (a as any).action) {
              return (a as any).action;
            }
            return null;
          },
          (childAction: any): Action => ({
            type: field,
            action: childAction
          } as any),
          childReducer
        )(stateAfterParent, action, deps);

        return [finalState, Effect.batch(parentEffect, childEffect)];
      };
    });

    return this;
  }

  /**
   * Build the final integrated reducer.
   */
  build(): Reducer<State, Action> {
    return this.integrations.reduce(
      (reducer, integration) => integration(reducer),
      this.coreReducer
    );
  }
}
```

### Usage

```typescript
// features/inventory/reducer.ts

import { integrate } from '$lib/composable/navigation';
import { Destination } from './destination';

// Core reducer with no child integration
const coreReducer: Reducer<InventoryState, InventoryAction> = (state, action) => {
  switch (action.type) {
    case 'addButtonTapped':
      return [
        {
          ...state,
          destination: Destination.initial('addItem', initialAddItemState)
        },
        Effect.none()
      ];

    case 'itemDeleted':
      return [
        { ...state, items: state.items.filter(i => i.id !== action.id) },
        Effect.none()
      ];

    default:
      const _exhaustive: never = action;
      return [state, Effect.none()];
  }
};

// Build final reducer with child integration
export const inventoryReducer = integrate(coreReducer)
  .with('destination', Destination.reducer)
  .build();
```

---

## 5. View Bindings DSL

### Problem: Repetitive Destination Bindings

**Before**:
```svelte
<script>
  const addItemStore = $derived(
    scopeTo(store).into('destination').case('addItem')
  );
  const editItemStore = $derived(
    scopeTo(store).into('destination').case('editItem')
  );
  const detailItemStore = $derived(
    scopeTo(store).into('destination').case('detailItem')
  );
</script>

<Modal store={addItemStore}>
  {#if addItemStore}<AddItemView store={addItemStore} />{/if}
</Modal>

<Sheet store={editItemStore}>
  {#if editItemStore}<EditItemView store={editItemStore} />{/if}
</Sheet>
```

### Solution: Destination Router Component

**After**:
```svelte
<script>
  import { DestinationRouter } from '$lib/composable/navigation-components';
</script>

<DestinationRouter
  {store}
  field="destination"
  routes={{
    addItem: { component: AddItemView, presentation: 'modal' },
    editItem: { component: EditItemView, presentation: 'sheet' },
    detailItem: { component: DetailItemView, presentation: 'drawer' }
  }}
/>
```

### Implementation

```svelte
<!-- lib/composable/navigation-components/DestinationRouter.svelte -->
<script lang="ts" generics="State, Action, Dest extends { type: string; state: any }">
  import { scope } from '$lib/composable/navigation';
  import Modal from './Modal.svelte';
  import Sheet from './Sheet.svelte';
  import Drawer from './Drawer.svelte';
  import type { Store } from '$lib/composable/types';
  import type { Component } from 'svelte';

  interface RouteConfig {
    component: Component;
    presentation: 'modal' | 'sheet' | 'drawer';
  }

  interface Props {
    store: Store<State, Action>;
    field: keyof State;
    routes: Record<string, RouteConfig>;
  }

  let { store, field, routes }: Props = $props();

  // Get destination state
  const destination = $derived(store.state[field] as Dest | null);

  // For each route, create a scoped store
  const scopedStores = $derived.by(() => {
    const result: Record<string, any> = {};

    for (const [key, config] of Object.entries(routes)) {
      result[key] = scopeTo(store).into(field as string).case(key);
    }

    return result;
  });
</script>

{#each Object.entries(routes) as [key, config] (key)}
  {@const scopedStore = scopedStores[key]}

  {#if config.presentation === 'modal'}
    <Modal store={scopedStore}>
      {#if scopedStore}
        <svelte:component this={config.component} store={scopedStore} />
      {/if}
    </Modal>
  {:else if config.presentation === 'sheet'}
    <Sheet store={scopedStore}>
      {#if scopedStore}
        <svelte:component this={config.component} store={scopedStore} />
      {/if}
    </Sheet>
  {:else if config.presentation === 'drawer'}
    <Drawer store={scopedStore}>
      {#if scopedStore}
        <svelte:component this={config.component} store={scopedStore} />
      {/if}
    </Drawer>
  {/if}
{/each}
```

---

## 6. Complete Example

Putting it all together:

```typescript
// features/inventory/destination.ts
import { createDestination, type DestinationState as ExtractState, type DestinationAction as ExtractAction } from '$lib/composable/navigation';
import { addItemReducer } from './add-item/reducer';
import { editItemReducer } from './edit-item/reducer';
import { detailItemReducer } from './detail-item/reducer';

export const Destination = createDestination({
  addItem: addItemReducer,
  editItem: editItemReducer,
  detailItem: detailItemReducer
});

// Use distinct names to avoid circular references
export type InventoryDestinationState = ExtractState<typeof Destination>;
export type InventoryDestinationAction = ExtractAction<typeof Destination>;
```

```typescript
// features/inventory/state.ts
import type { InventoryDestinationState } from './destination';

export interface InventoryState {
  items: Item[];
  destination: InventoryDestinationState | null;
}

export const initialState: InventoryState = {
  items: [],
  destination: null
};
```

```typescript
// features/inventory/reducer.ts
import { integrate } from '$lib/composable/navigation';
import { Effect } from '$lib/composable/effect';
import type { Reducer } from '$lib/composable/types';
import { Destination } from './destination';
import { initialState as initialAddItemState } from './add-item/state';
import { createEditState } from './edit-item/state';

const coreReducer: Reducer<InventoryState, InventoryAction> = (state, action, deps) => {
  switch (action.type) {
    case 'addButtonTapped':
      return [
        {
          ...state,
          destination: Destination.initial('addItem', initialAddItemState)
        },
        Effect.none()
      ];

    case 'editButtonTapped': {
      const item = state.items.find(i => i.id === action.itemId);
      if (!item) return [state, Effect.none()];

      return [
        {
          ...state,
          destination: Destination.initial('editItem', createEditState(item))
        },
        Effect.none()
      ];
    }

    default:
      return [state, Effect.none()];
  }

  // Observe child save actions using matcher spec API
  const saveResult = Destination.match(action, state, {
    'addItem.saveButtonTapped': (addState) => ({
      type: 'add' as const,
      item: addState.item
    }),
    'editItem.saveButtonTapped': (editState) => ({
      type: 'edit' as const,
      item: editState.item
    })
  });

  if (saveResult.matched) {
    const { type, item } = saveResult.value;

    if (type === 'add') {
      return [
        {
          ...state,
          items: [...state.items, item],
          destination: null
        },
        Effect.run(async () => {
          await deps.apiClient.post('/items', item);
        })
      ];
    } else {
      return [
        {
          ...state,
          items: state.items.map(i => (i.id === item.id ? item : i)),
          destination: null
        },
        Effect.run(async () => {
          await deps.apiClient.put(`/items/${item.id}`, item);
        })
      ];
    }
  }

  return [state, Effect.none()];
};

// Build integrated reducer
export const inventoryReducer = integrate(coreReducer)
  .with('destination', Destination.reducer)
  .build();
```

```svelte
<!-- features/inventory/Inventory.svelte -->
<script lang="ts">
  import { createStore } from '$lib/composable/store.svelte';
  import { DestinationRouter } from '$lib/composable/navigation-components';
  import { inventoryReducer } from './reducer';
  import { initialState } from './state';

  import AddItemView from './add-item/AddItem.svelte';
  import EditItemView from './edit-item/EditItem.svelte';
  import DetailItemView from './detail-item/DetailItem.svelte';

  const store = createStore({
    initialState,
    reducer: inventoryReducer
  });
</script>

<div class="inventory">
  <h1>Inventory</h1>

  <button onclick={() => store.dispatch({ type: 'addButtonTapped' })}>
    Add Item
  </button>

  <ul>
    {#each store.state.items as item (item.id)}
      <li>
        {item.name}
        <button onclick={() => store.dispatch({ type: 'editButtonTapped', itemId: item.id })}>
          Edit
        </button>
        <button onclick={() => store.dispatch({ type: 'itemSelected', itemId: item.id })}>
          Details
        </button>
      </li>
    {/each}
  </ul>

  <!-- All navigation handled declaratively -->
  <DestinationRouter
    {store}
    field="destination"
    routes={{
      addItem: { component: AddItemView, presentation: 'modal' },
      editItem: { component: EditItemView, presentation: 'sheet' },
      detailItem: { component: DetailItemView, presentation: 'drawer' }
    }}
  />
</div>
```

---

## Comparison: Before vs After

### Destination Definition

**Before**: 40+ lines of boilerplate
**After**: 6 lines with `createDestination`

```typescript
// After
const Destination = createDestination({
  addItem: addItemReducer,
  editItem: editItemReducer,
  detailItem: detailItemReducer
});
```

### Reducer Integration

**Before**: 15+ lines of ifLet boilerplate
**After**: 2 lines with `integrate`

```typescript
// After
export const reducer = integrate(coreReducer)
  .with('destination', Destination.reducer)
  .build();
```

### View Scoping

**Before**: 10+ lines per destination
**After**: 1 line with `DestinationRouter`

```svelte
<!-- After -->
<DestinationRouter
  {store}
  field="destination"
  routes={{
    addItem: { component: AddItemView, presentation: 'modal' }
  }}
/>
```

---

## Additional DSL Utilities

### 6.1 Route Builder

```typescript
import { route } from '$lib/composable/navigation';

// Define routes with type safety
const routes = route({
  addItem: {
    component: AddItemView,
    presentation: 'modal',
    // Optional: Guard function
    guard: (state) => state.items.length < 100,
    // Optional: On present callback
    onPresent: (dispatch) => {
      dispatch({ type: 'analytics', event: 'add_item_opened' });
    }
  },
  editItem: {
    component: EditItemView,
    presentation: 'sheet'
  }
});
```

### 6.2 Action Builder

**Problem**: Deeply nested action creation is verbose and error-prone.

**Before**:
```typescript
// 4 layers of nesting - hard to read, easy to mess up
store.dispatch({
  type: 'destination',
  action: {
    type: 'presented',
    action: {
      type: 'editItem',
      action: { type: 'saveButtonTapped' }
    }
  }
});
```

**After** (with action builder):
```typescript
import { actionBuilder } from '$lib/composable/navigation';

const actions = actionBuilder<AppAction>();

// Fluent API - type-safe and readable
store.dispatch(
  actions.destination.presented.editItem.saveButtonTapped()
);
```

**Implementation**:

```typescript
// lib/composable/navigation/action-builder.ts

/**
 * Create type-safe action builders for deeply nested actions.
 * Eliminates boilerplate while maintaining type safety.
 */
export function actionBuilder<RootAction>() {
  return new ActionBuilderProxy<RootAction>([]);
}

class ActionBuilderProxy<RootAction> {
  constructor(private path: string[]) {}

  /**
   * Create a proxy that builds nested action structures.
   */
  private createProxy(): any {
    return new Proxy(
      {},
      {
        get: (_, prop: string) => {
          if (prop === 'then') {
            // Special case: Don't trap promises
            return undefined;
          }

          const newPath = [...this.path, prop];

          // Return a function that creates the final action
          return (...args: any[]) => {
            // If called with arguments, this is the leaf action
            if (args.length > 0) {
              return this.buildAction(newPath, args[0]);
            }

            // Otherwise, return a new proxy for chaining
            return new ActionBuilderProxy<RootAction>(newPath).createProxy();
          };
        }
      }
    );
  }

  /**
   * Build the nested action structure from the path.
   */
  private buildAction(path: string[], payload?: any): RootAction {
    // Build from inside out
    let action: any = payload || { type: path[path.length - 1] };

    // Wrap each level
    for (let i = path.length - 2; i >= 0; i--) {
      action = {
        type: path[i],
        action
      };
    }

    return action as RootAction;
  }
}

// Export the proxy
export function createActionBuilder<RootAction>(): any {
  return new ActionBuilderProxy<RootAction>([]).createProxy();
}
```

**Usage Examples**:

```typescript
// 1. Simple action (no payload)
actions.destination.presented.addItem.saveButtonTapped();
// → { type: 'destination', action: { type: 'presented', action: { type: 'addItem', action: { type: 'saveButtonTapped' } } } }

// 2. Action with payload
actions.destination.presented.editItem.nameChanged({ value: 'New Name' });
// → { type: 'destination', action: { type: 'presented', action: { type: 'editItem', action: { type: 'nameChanged', value: 'New Name' } } } }

// 3. Shorter paths
actions.presentation.presentationCompleted();
// → { type: 'presentation', event: { type: 'presentationCompleted' } }

// 4. Direct actions (no nesting)
actions.loadItems();
// → { type: 'loadItems' }
```

**Alternative: Function-Based Builders**

For better type safety, create explicit builder functions:

```typescript
// features/inventory/action-builders.ts

import type { InventoryAction } from './actions';
import type { AddItemAction } from '../add-item/actions';
import type { EditItemAction } from '../edit-item/actions';

/**
 * Action builders for inventory feature.
 * Provides type-safe, convenient action creation.
 */
export const inventoryActions = {
  // Top-level actions
  loadItems: (): InventoryAction => ({ type: 'loadItems' }),

  itemsLoaded: (items: Item[]): InventoryAction => ({
    type: 'itemsLoaded',
    items
  }),

  addButtonTapped: (): InventoryAction => ({ type: 'addButtonTapped' }),

  editButtonTapped: (id: string): InventoryAction => ({
    type: 'editButtonTapped',
    id
  }),

  closeButtonTapped: (): InventoryAction => ({ type: 'closeButtonTapped' }),

  // Destination actions
  destination: {
    presented: {
      addItem: (action: AddItemAction): InventoryAction => ({
        type: 'destination',
        action: {
          type: 'presented',
          action: {
            type: 'addItem',
            action
          }
        }
      }),

      editItem: (action: EditItemAction): InventoryAction => ({
        type: 'destination',
        action: {
          type: 'presented',
          action: {
            type: 'editItem',
            action
          }
        }
      })
    },

    dismissed: (): InventoryAction => ({
      type: 'destination',
      action: { type: 'dismissed' }
    })
  },

  // Presentation actions
  presentation: {
    presentationCompleted: (): InventoryAction => ({
      type: 'presentation',
      event: { type: 'presentationCompleted' }
    }),

    dismissalCompleted: (): InventoryAction => ({
      type: 'presentation',
      event: { type: 'dismissalCompleted' }
    })
  }
};

// Child action builders
export const addItemActions = {
  nameChanged: (value: string): AddItemAction => ({
    type: 'nameChanged',
    value
  }),

  quantityChanged: (value: number): AddItemAction => ({
    type: 'quantityChanged',
    value
  }),

  priceChanged: (value: number): AddItemAction => ({
    type: 'priceChanged',
    value
  }),

  saveButtonTapped: (): AddItemAction => ({
    type: 'saveButtonTapped'
  }),

  cancelButtonTapped: (): AddItemAction => ({
    type: 'cancelButtonTapped'
  })
};
```

**Usage in Components**:

```svelte
<script lang="ts">
  import { createStore } from '$lib/composable/store.svelte';
  import { inventoryActions, addItemActions } from './action-builders';
  import { inventoryReducer } from './reducer';
  import { initialState } from './state';

  const store = createStore({ initialState, reducer: inventoryReducer });

  function handleAddItem() {
    // Clean, readable, type-safe
    store.dispatch(inventoryActions.addButtonTapped());
  }

  function handleSave() {
    // Compose child action with parent wrapper
    store.dispatch(
      inventoryActions.destination.presented.addItem(
        addItemActions.saveButtonTapped()
      )
    );
  }

  function handleNameChange(e: Event) {
    const value = (e.target as HTMLInputElement).value;

    store.dispatch(
      inventoryActions.destination.presented.addItem(
        addItemActions.nameChanged(value)
      )
    );
  }
</script>

<button onclick={handleAddItem}>Add Item</button>
<button onclick={handleSave}>Save</button>
<input oninput={handleNameChange} />
```

**Benefits**:

1. **Type Safety**: Full TypeScript checking, autocompletion works
2. **Readability**: Fluent API is much easier to read than nested objects
3. **Maintainability**: Change action structure in one place
4. **Discoverability**: IDE autocomplete shows available actions
5. **Refactoring**: Rename actions with confidence using IDE refactoring

**Comparison**:

| Approach | Verbosity | Type Safety | Refactorable | Learning Curve |
|----------|-----------|-------------|--------------|----------------|
| Manual objects | High | Medium | No | Low |
| Proxy builder | Low | Low | No | Medium |
| Function builders | Medium | High | Yes | Low |

**Recommendation**: Use **function-based builders** for best combination of type safety, maintainability, and developer experience.

### 6.3 Test Helpers

```typescript
import { testDestination } from '$lib/composable/navigation/test';

// Test with DSL
const store = new TestStore({ initialState, reducer });

await store.send(
  testDestination('destination')
    .presented('addItem')
    .action('saveButtonTapped')
);

await store.receive(
  testDestination('destination').dismiss()
);
```

---

## Summary

The DSL reduces boilerplate by approximately **70-80%** while maintaining full type safety:

| Task | Before | After | Reduction |
|------|--------|-------|-----------|
| Destination definition | ~40 lines | ~6 lines | 85% |
| Reducer integration | ~15 lines | ~2 lines | 87% |
| View scoping | ~10 lines/dest | ~1 line total | 90% |
| Action matching | ~8 lines | ~3 lines | 62% |

**Total Impact**: Much more ergonomic developer experience while maintaining all benefits of type safety and testability!

---

**End of DSL Specification**
