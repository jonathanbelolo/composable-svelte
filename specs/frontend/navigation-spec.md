# Composable Svelte Navigation Specification

**Version:** 1.0.0
**Date:** 2025-10-25
**Status:** Draft

## Table of Contents

1. [Overview](#overview)
2. [Tree-Based Navigation](#tree-based-navigation)
3. [Optional State Navigation](#optional-state-navigation)
4. [Enum State Navigation](#enum-state-navigation)
5. [Stack-Based Navigation](#stack-based-navigation)
6. [Navigation Components](#navigation-components)
7. [Integration Patterns](#integration-patterns)
8. [Dismissal Patterns](#dismissal-patterns)
9. [Testing Navigation](#testing-navigation)
10. [SvelteKit Integration](#sveltekit-integration)
11. [Best Practices](#best-practices)
12. [API Reference](#api-reference)

---

## 1. Overview

Navigation in Composable Svelte follows the same principles as The Composable Architecture (TCA), providing a declarative, state-driven approach to navigation that is:

- **Type-safe**: Compile-time guarantees about valid navigation states
- **Testable**: Easy to test navigation flows in isolation
- **Composable**: Parent features have full visibility into child navigation
- **Predictable**: Navigation is a pure function of state

### Navigation Paradigms

Composable Svelte supports two main navigation paradigms:

1. **Tree-Based Navigation**: Uses optional and enum state to model navigation hierarchies
2. **Stack-Based Navigation**: Uses arrays to model linear navigation stacks

This specification focuses primarily on **tree-based navigation**, which provides the most type safety and composability.

### Key Principles

- **State drives navigation**: When state becomes non-null, presentation occurs; when null, dismissal occurs
- **Unidirectional flow**: Navigation changes flow through actions and reducers
- **Parent visibility**: Parent features can observe and react to child navigation events
- **Single source of truth**: Navigation state lives in the store, not scattered across components

---

## 2. Tree-Based Navigation

Tree-based navigation uses optional and enum state to model navigation. This creates a hierarchical structure (tree) where features nest inside each other, describing valid navigation paths through your application.

### Why Tree-Based?

**Advantages:**
- Compile-time safety for navigation states
- Deep-linking support (construct nested state to navigate anywhere)
- Unified API for all navigation types (modals, sheets, dialogs, routes)
- Parent features can observe all child navigation
- Easy to test

**Disadvantages:**
- Can struggle with recursive navigation (e.g., navigating to same screen type)
- Complex scenarios may require careful state modeling

---

## 3. Optional State Navigation

### 3.1 Basic Pattern

The simplest form of navigation uses a single optional state field to represent a destination.

#### State Definition

```typescript
// features/inventory/state.ts

import type { ItemFormState } from '../item-form/state';

export interface InventoryState {
  items: Item[];
  // Optional state: non-null = presented, null = dismissed
  addItem: ItemFormState | null;
}

export const initialState: InventoryState = {
  items: [],
  addItem: null
};
```

#### Action Definition

```typescript
// features/inventory/actions.ts

import type { ItemFormAction } from '../item-form/actions';

export type InventoryAction =
  | { type: 'addButtonTapped' }
  | { type: 'addItem'; action: PresentationAction<ItemFormAction> }
  | { type: 'itemDeleted'; id: string };

/**
 * PresentationAction wraps child actions and adds dismissal capability.
 */
export type PresentationAction<ChildAction> =
  | { type: 'presented'; action: ChildAction }
  | { type: 'dismiss' };
```

#### Reducer Integration

```typescript
// features/inventory/reducer.ts

import { Effect } from '$lib/composable/effect';
import { ifLet } from '$lib/composable/navigation';
import type { Reducer } from '$lib/composable/types';
import { initialState as initialItemFormState } from '../item-form/state';
import { itemFormReducer } from '../item-form/reducer';

export const inventoryReducer: Reducer<InventoryState, InventoryAction> = (
  state,
  action,
  deps
) => {
  // Core reducer logic
  const coreReducer: Reducer<InventoryState, InventoryAction> = (state, action, deps) => {
    switch (action.type) {
      case 'addButtonTapped':
        // Populate state to present the child feature
        return [
          { ...state, addItem: initialItemFormState },
          Effect.none()
        ];

      case 'itemDeleted':
        return [
          {
            ...state,
            items: state.items.filter(item => item.id !== action.id)
          },
          Effect.none()
        ];

      default:
        const _exhaustive: never = action;
        return [state, Effect.none()];
    }
  };

  // Apply core reducer first
  const [stateAfterCore, coreEffect] = coreReducer(state, action, deps);

  // Then integrate child reducer using ifLet
  const [finalState, childEffect] = ifLet(
    // Lens: extract child state
    (s: InventoryState) => s.addItem,
    // Updater: update parent with new child state
    (s: InventoryState, child: ItemFormState | null) => ({ ...s, addItem: child }),
    // Prism: extract child action
    (a: InventoryAction) => {
      if (a.type === 'addItem') {
        return a.action;
      }
      return null;
    },
    // Embedder: wrap child action
    (childAction: PresentationAction<ItemFormAction>): InventoryAction => ({
      type: 'addItem',
      action: childAction
    }),
    // Child reducer
    itemFormReducer
  )(stateAfterCore, action, deps);

  return [
    finalState,
    Effect.batch(coreEffect, childEffect)
  ];
};
```

### 3.2 The `ifLet` Operator

The `ifLet` operator is the core primitive for integrating optional child features.

```typescript
// lib/composable/navigation.ts

/**
 * Integrate a child reducer that operates on optional state.
 *
 * When child state is null, child actions are ignored.
 * When child state is non-null, child actions are processed.
 *
 * The special PresentationAction.dismiss action will nil out the child state.
 */
export function ifLet<ParentState, ParentAction, ChildState, ChildAction>(
  toChild: (parent: ParentState) => ChildState | null,
  fromChild: (parent: ParentState, child: ChildState | null) => ParentState,
  toChildAction: (action: ParentAction) => PresentationAction<ChildAction> | null,
  fromChildAction: (action: PresentationAction<ChildAction>) => ParentAction,
  childReducer: Reducer<ChildState, ChildAction>
): Reducer<ParentState, ParentAction> {
  return (parentState, parentAction, deps) => {
    const childAction = toChildAction(parentAction);

    // Parent action doesn't apply to child
    if (childAction === null) {
      return [parentState, Effect.none()];
    }

    // Handle dismiss action
    if (childAction.type === 'dismiss') {
      return [
        fromChild(parentState, null),
        Effect.none()
      ];
    }

    // Extract child state
    const childState = toChild(parentState);

    // Child state is null or undefined, ignore action
    // Use loose equality (==) to catch both null and undefined
    if (childState == null) {
      return [parentState, Effect.none()];
    }

    // Child action is presented, run child reducer
    if (childAction.type === 'presented') {
      const [newChildState, childEffect] = childReducer(
        childState,
        childAction.action,
        deps
      );

      // Update parent state with new child state
      const newParentState = fromChild(parentState, newChildState);

      // Map child effects to parent actions
      const parentEffect = Effect.map(childEffect, (ca) =>
        fromChildAction({ type: 'presented', action: ca })
      );

      return [newParentState, parentEffect];
    }

    return [parentState, Effect.none()];
  };
}
```

### 3.3 View Integration

Views use helper components to present child features based on optional state.

```svelte
<!-- features/inventory/Inventory.svelte -->
<script lang="ts">
  import { createStore } from '$lib/composable/store.svelte';
  import { inventoryReducer } from './reducer';
  import { initialState } from './state';
  import { Modal } from '$lib/composable/navigation-components';
  import ItemFormView from '../item-form/ItemForm.svelte';

  const store = createStore({
    initialState,
    reducer: inventoryReducer
  });

  // Derive scoped store for child feature
  const addItemStore = $derived(
    store.state.addItem
      ? {
          state: store.state.addItem,
          dispatch: (action) =>
            store.dispatch({
              type: 'addItem',
              action: { type: 'presented', action }
            })
        }
      : null
  );
</script>

<div class="inventory">
  <h1>Inventory</h1>

  <button onclick={() => store.dispatch({ type: 'addButtonTapped' })}>
    Add Item
  </button>

  <ul>
    {#each store.state.items as item (item.id)}
      <li>{item.name}</li>
    {/each}
  </ul>

  <!-- Modal presents when addItemStore is non-null -->
  <Modal store={addItemStore}>
    {#if addItemStore}
      <ItemFormView store={addItemStore} />
    {/if}
  </Modal>
</div>
```

### 3.4 Problem: Multiple Destinations

Using multiple optional fields for navigation leads to invalid states:

```typescript
// ❌ Bad: Multiple optionals allow invalid states
interface InventoryState {
  addItem: ItemFormState | null;
  editItem: ItemFormState | null;
  detailItem: DetailState | null;
}
```

**Problems:**
1. Multiple destinations can be non-null simultaneously
2. SwiftUI/Svelte doesn't support multiple presentations at once
3. Difficult to determine which feature is actually presented
4. Invalid states grow exponentially (3 optionals = 4 invalid states, 4 = 11, 5 = 26)

**Solution:** Use enum-based destinations (see next section).

---

## 4. Enum State Navigation

### 4.1 Destination Enum Pattern

Model multiple destinations as a single discriminated union (enum) instead of multiple optionals.

```typescript
// features/inventory/destination.ts

import type { AddItemState } from '../add-item/state';
import type { EditItemState } from '../edit-item/state';
import type { DetailItemState } from '../detail-item/state';
import type { AddItemAction } from '../add-item/actions';
import type { EditItemAction } from '../edit-item/actions';
import type { DetailItemAction } from '../detail-item/actions';

/**
 * Destination enum: Only ONE destination can be active at a time.
 * Compile-time guarantee of mutually exclusive navigation states.
 */
export type DestinationState =
  | { type: 'addItem'; state: AddItemState }
  | { type: 'editItem'; state: EditItemState }
  | { type: 'detailItem'; state: DetailItemState };

export type DestinationAction =
  | { type: 'addItem'; action: AddItemAction }
  | { type: 'editItem'; action: EditItemAction }
  | { type: 'detailItem'; action: DetailItemAction };
```

### 4.2 Destination Reducer

Create a single reducer that handles all destinations:

```typescript
// features/inventory/destination-reducer.ts

import { Effect } from '$lib/composable/effect';
import { addItemReducer } from '../add-item/reducer';
import { editItemReducer } from '../edit-item/reducer';
import { detailItemReducer } from '../detail-item/reducer';
import type { Reducer } from '$lib/composable/types';

export const destinationReducer: Reducer<DestinationState, DestinationAction> = (
  state,
  action,
  deps
) => {
  // Early return if action doesn't match state type
  if (state.type !== action.type) {
    return [state, Effect.none()];
  }

  // Route to appropriate child reducer based on matched type
  switch (state.type) {
    case 'addItem': {
      const [childState, childEffect] = addItemReducer(
        state.state,
        action.action,
        deps
      );
      return [
        { type: 'addItem', state: childState },
        Effect.map(childEffect, (a) => ({ type: 'addItem', action: a }))
      ];
    }

    case 'editItem': {
      const [childState, childEffect] = editItemReducer(
        state.state,
        action.action,
        deps
      );
      return [
        { type: 'editItem', state: childState },
        Effect.map(childEffect, (a) => ({ type: 'editItem', action: a }))
      ];
    }

    case 'detailItem': {
      const [childState, childEffect] = detailItemReducer(
        state.state,
        action.action,
        deps
      );
      return [
        { type: 'detailItem', state: childState },
        Effect.map(childEffect, (a) => ({ type: 'detailItem', action: a }))
      ];
    }

    default: {
      // Exhaustiveness check
      const _exhaustive: never = action;
      return [state, Effect.none()];
    }
  }
};
```

### 4.3 Helper: `createDestinationReducer`

Since destination reducers follow a pattern, we can create a helper:

```typescript
// lib/composable/navigation.ts

/**
 * Create a destination reducer from a map of child reducers.
 * Automatically routes actions to the correct reducer.
 */
export function createDestinationReducer<
  State extends { type: string },
  Action extends { type: string }
>(
  reducers: {
    [K in State['type']]: Reducer<
      Extract<State, { type: K }>['state'],
      Extract<Action, { type: K }>['action']
    >
  }
): Reducer<State, Action> {
  return (state, action, deps) => {
    if (state.type !== action.type) {
      return [state, Effect.none()];
    }

    const reducer = reducers[state.type as State['type']];
    const [childState, childEffect] = reducer(
      (state as any).state,
      (action as any).action,
      deps
    );

    return [
      { type: state.type, state: childState } as State,
      Effect.map(childEffect, (a) => ({ type: action.type, action: a } as Action))
    ];
  };
}

// Usage
const destinationReducer = createDestinationReducer({
  addItem: addItemReducer,
  editItem: editItemReducer,
  detailItem: detailItemReducer
});
```

### 4.4 Parent State with Destination

```typescript
// features/inventory/state.ts

export interface InventoryState {
  items: Item[];
  // Single optional destination (only one can be active)
  destination: DestinationState | null;
}

export const initialState: InventoryState = {
  items: [],
  destination: null
};
```

### 4.5 Parent Actions with Destination

```typescript
// features/inventory/actions.ts

export type InventoryAction =
  | { type: 'addButtonTapped' }
  | { type: 'editButtonTapped'; itemId: string }
  | { type: 'itemSelected'; itemId: string }
  | { type: 'destination'; action: PresentationAction<DestinationAction> };
```

### 4.6 Parent Reducer with Destination

```typescript
// features/inventory/reducer.ts

import { Effect } from '$lib/composable/effect';
import { ifLet } from '$lib/composable/navigation';
import { destinationReducer } from './destination-reducer';
import { initialState as initialAddItemState } from '../add-item/state';
import { createEditItemState } from '../edit-item/state';
import { createDetailItemState } from '../detail-item/state';
import type { Reducer } from '$lib/composable/types';

export const inventoryReducer: Reducer<InventoryState, InventoryAction> = (
  state,
  action,
  deps
) => {
  // Core logic
  const coreReducer: Reducer<InventoryState, InventoryAction> = (state, action, deps) => {
    switch (action.type) {
      case 'addButtonTapped':
        return [
          {
            ...state,
            destination: {
              type: 'addItem',
              state: initialAddItemState
            }
          },
          Effect.none()
        ];

      case 'editButtonTapped': {
        const item = state.items.find(i => i.id === action.itemId);
        if (!item) return [state, Effect.none()];

        return [
          {
            ...state,
            destination: {
              type: 'editItem',
              state: createEditItemState(item)
            }
          },
          Effect.none()
        ];
      }

      case 'itemSelected': {
        const item = state.items.find(i => i.id === action.itemId);
        if (!item) return [state, Effect.none()];

        return [
          {
            ...state,
            destination: {
              type: 'detailItem',
              state: createDetailItemState(item)
            }
          },
          Effect.none()
        ];
      }

      default:
        const _exhaustive: never = action;
        return [state, Effect.none()];
    }
  };

  const [stateAfterCore, coreEffect] = coreReducer(state, action, deps);

  // Integrate destination reducer
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

  return [finalState, Effect.batch(coreEffect, childEffect)];
};
```

### 4.7 View with Multiple Destinations

```svelte
<!-- features/inventory/Inventory.svelte -->
<script lang="ts">
  import { createStore } from '$lib/composable/store.svelte';
  import { inventoryReducer } from './reducer';
  import { initialState } from './state';
  import type { AddItemAction } from '../add-item/actions';
  import type { EditItemAction } from '../edit-item/actions';
  import type { DetailItemAction } from '../detail-item/actions';
  import { Modal, Sheet, Drawer } from '$lib/composable/navigation-components';
  import AddItemView from '../add-item/AddItem.svelte';
  import EditItemView from '../edit-item/EditItem.svelte';
  import DetailItemView from '../detail-item/DetailItem.svelte';

  const store = createStore({
    initialState,
    reducer: inventoryReducer
  });

  // Create scoped stores for each destination case
  const addItemStore = $derived(
    store.state.destination?.type === 'addItem'
      ? {
          state: store.state.destination.state,
          dispatch: (action: AddItemAction) =>
            store.dispatch({
              // Layer 1: Parent action (InventoryAction)
              type: 'destination',
              action: {
                // Layer 2: PresentationAction wrapper
                type: 'presented',
                action: {
                  // Layer 3: DestinationAction wrapper
                  type: 'addItem',
                  // Layer 4: Actual child action (AddItemAction)
                  action
                }
              }
            })
        }
      : null
  );

  const editItemStore = $derived(
    store.state.destination?.type === 'editItem'
      ? {
          state: store.state.destination.state,
          dispatch: (action: EditItemAction) =>
            store.dispatch({
              // Layer 1: Parent action (InventoryAction)
              type: 'destination',
              action: {
                // Layer 2: PresentationAction wrapper
                type: 'presented',
                action: {
                  // Layer 3: DestinationAction wrapper
                  type: 'editItem',
                  // Layer 4: Actual child action (EditItemAction)
                  action
                }
              }
            })
        }
      : null
  );

  const detailItemStore = $derived(
    store.state.destination?.type === 'detailItem'
      ? {
          state: store.state.destination.state,
          dispatch: (action: DetailItemAction) =>
            store.dispatch({
              // Layer 1: Parent action (InventoryAction)
              type: 'destination',
              action: {
                // Layer 2: PresentationAction wrapper
                type: 'presented',
                action: {
                  // Layer 3: DestinationAction wrapper
                  type: 'detailItem',
                  // Layer 4: Actual child action (DetailItemAction)
                  action
                }
              }
            })
        }
      : null
  );
</script>

<div class="inventory">
  <!-- ... inventory list ... -->

  <!-- Each destination uses different presentation style -->
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

  <Drawer store={detailItemStore}>
    {#if detailItemStore}
      <DetailItemView store={detailItemStore} />
    {/if}
  </Drawer>
</div>
```

### 4.8 Helper: `scopeToDestination`

To reduce boilerplate when creating scoped stores:

```typescript
// lib/composable/navigation.ts

/**
 * Get a value from an object using a path array.
 */
function getPath(obj: any, path: string[]): any {
  return path.reduce((current, key) => current?.[key], obj);
}

/**
 * Set a value in an object using a path array (immutably).
 */
function setPath(obj: any, path: string[], value: any): any {
  if (path.length === 0) return value;

  const [head, ...tail] = path;
  return {
    ...obj,
    [head]: tail.length === 0 ? value : setPath(obj[head] || {}, tail, value)
  };
}

/**
 * Create a scoped store for a specific destination case.
 *
 * Note: This function returns an object that should be used within
 * a $derived context in Svelte components.
 *
 * @param store - The parent store
 * @param destinationPath - Path to the destination field in state (e.g., ['destination'])
 * @param caseType - The destination case type (e.g., 'addItem')
 * @param parentActionType - The parent action type for the destination field (e.g., 'destination')
 */
export function scopeToDestination<DestState, DestAction, CaseType extends string>(
  store: Store<any, any>,
  destinationPath: string[],
  caseType: CaseType,
  parentActionType: string
): { state: DestState; dispatch: (action: DestAction) => void } | null {
  const dest = getPath(store.state, destinationPath);

  if (dest?.type === caseType) {
    return {
      state: dest.state,
      dispatch: (action: DestAction) => {
        // Construct the properly wrapped action
        store.dispatch({
          type: parentActionType,
          action: {
            type: 'presented',
            action: {
              type: caseType,
              action
            }
          }
        });
      }
    };
  }

  return null;
}

// Usage (within a Svelte component's $derived)
const addItemStore = $derived(
  scopeToDestination(
    store,
    ['destination'],  // Path to destination in state
    'addItem',        // Destination case type
    'destination'     // Parent action type
  )
);
```

---

## 5. Stack-Based Navigation

Stack-based navigation uses arrays to model linear navigation flows, ideal for deep drill-down patterns.

### 5.1 Stack State

```typescript
// features/root/state.ts

/**
 * PathState is a discriminated union for type safety.
 */
export type PathState =
  | { type: 'list'; state: ListState }
  | { type: 'detail'; state: DetailState }
  | { type: 'edit'; state: EditState }
  | { type: 'settings'; state: SettingsState };

export interface RootState {
  // Navigation stack
  path: PathState[];
  // Root feature state
  items: Item[];
}
```

### 5.2 Stack Actions

```typescript
// features/root/actions.ts

export type PathAction =
  | { type: 'list'; action: ListAction }
  | { type: 'detail'; action: DetailAction }
  | { type: 'edit'; action: EditAction }
  | { type: 'settings'; action: SettingsAction };

export type RootAction =
  | { type: 'path'; action: StackAction<PathAction, PathState> }
  | { type: 'pushDetail'; itemId: string }
  | { type: 'pushEdit'; itemId: string }
  | { type: 'popToRoot' };

/**
 * Generic stack action type.
 * @template A - The action type for stack elements
 * @template S - The state type for stack elements
 */
export type StackAction<A, S = any> =
  | { type: 'element'; index: number; action: A }
  | { type: 'push'; element: S }
  | { type: 'pop'; count?: number }
  | { type: 'popToRoot' };
```

### 5.3 Stack Reducer

```typescript
// features/root/reducer.ts

import { Effect } from '$lib/composable/effect';
import { listReducer } from './list/reducer';
import { detailReducer } from './detail/reducer';
import { editReducer } from './edit/reducer';
import { settingsReducer } from './settings/reducer';
import { createDetailState } from './detail/state';
import { createEditState } from './edit/state';
import type { Reducer } from '$lib/composable/types';

export const rootReducer: Reducer<RootState, RootAction> = (state, action, deps) => {
  switch (action.type) {
    case 'pushDetail': {
      const item = state.items.find(i => i.id === action.itemId);
      if (!item) return [state, Effect.none()];

      return [
        {
          ...state,
          path: [
            ...state.path,
            {
              type: 'detail',
              state: createDetailState(item)
            }
          ]
        },
        Effect.none()
      ];
    }

    case 'path': {
      return handleStackAction(state, action.action, deps);
    }

    case 'popToRoot':
      return [
        { ...state, path: [] },
        Effect.none()
      ];

    default:
      const _exhaustive: never = action;
      return [state, Effect.none()];
  }
};

/**
 * Run the appropriate reducer for a path element based on its type.
 */
function runPathReducer(
  element: PathState,
  action: PathAction,
  deps: any
): [PathState, Effect<PathAction>] {
  // Must match both element type and action type
  if (element.type !== action.type) {
    return [element, Effect.none()];
  }

  switch (element.type) {
    case 'list': {
      if (action.type === 'list') {
        const [newState, effect] = listReducer(element.state, action.action, deps);
        return [
          { type: 'list', state: newState },
          Effect.map(effect, (a) => ({ type: 'list', action: a }))
        ];
      }
      break;
    }

    case 'detail': {
      if (action.type === 'detail') {
        const [newState, effect] = detailReducer(element.state, action.action, deps);
        return [
          { type: 'detail', state: newState },
          Effect.map(effect, (a) => ({ type: 'detail', action: a }))
        ];
      }
      break;
    }

    case 'edit': {
      if (action.type === 'edit') {
        const [newState, effect] = editReducer(element.state, action.action, deps);
        return [
          { type: 'edit', state: newState },
          Effect.map(effect, (a) => ({ type: 'edit', action: a }))
        ];
      }
      break;
    }

    case 'settings': {
      if (action.type === 'settings') {
        const [newState, effect] = settingsReducer(element.state, action.action, deps);
        return [
          { type: 'settings', state: newState },
          Effect.map(effect, (a) => ({ type: 'settings', action: a }))
        ];
      }
      break;
    }

    default: {
      const _exhaustive: never = element;
      return [element, Effect.none()];
    }
  }

  return [element, Effect.none()];
}

function handleStackAction(
  state: RootState,
  action: StackAction<PathAction, PathState>,
  deps: any
): [RootState, Effect<RootAction>] {
  switch (action.type) {
    case 'element': {
      const element = state.path[action.index];
      if (!element) return [state, Effect.none()];

      // Run appropriate child reducer
      const [newElementState, effect] = runPathReducer(
        element,
        action.action,
        deps
      );

      const newPath = [...state.path];
      newPath[action.index] = newElementState;

      return [
        { ...state, path: newPath },
        Effect.map(effect, (a) => ({
          type: 'path',
          action: { type: 'element', index: action.index, action: a }
        }))
      ];
    }

    case 'push': {
      return [
        {
          ...state,
          path: [...state.path, action.element]
        },
        Effect.none()
      ];
    }

    case 'pop': {
      const count = action.count ?? 1;
      return [
        { ...state, path: state.path.slice(0, -count) },
        Effect.none()
      ];
    }

    case 'popToRoot':
      return [
        { ...state, path: [] },
        Effect.none()
      ];

    default:
      const _exhaustive: never = action;
      return [state, Effect.none()];
  }
}
```

### 5.4 Stack View

```svelte
<!-- features/root/Root.svelte -->
<script lang="ts">
  import { createStore } from '$lib/composable/store.svelte';
  import { rootReducer } from './reducer';
  import { initialState } from './state';
  import { NavigationStack } from '$lib/composable/navigation-components';
  import ListView from './list/List.svelte';
  import DetailView from './detail/Detail.svelte';
  import EditView from './edit/Edit.svelte';

  const store = createStore({
    initialState,
    reducer: rootReducer
  });
</script>

<NavigationStack
  path={store.state.path}
  onPop={(count) => store.dispatch({ type: 'path', action: { type: 'pop', count } })}
>
  {#snippet root()}
    <ListView
      items={store.state.items}
      onSelect={(id) => store.dispatch({ type: 'pushDetail', itemId: id })}
    />
  {/snippet}

  {#snippet destination(element, index)}
    {#if element.type === 'detail'}
      <DetailView
        store={{
          state: element.state,
          dispatch: (action) =>
            store.dispatch({
              type: 'path',
              action: { type: 'element', index, action: { type: 'detail', action } }
            })
        }}
      />
    {:else if element.type === 'edit'}
      <EditView
        store={{
          state: element.state,
          dispatch: (action) =>
            store.dispatch({
              type: 'path',
              action: { type: 'element', index, action: { type: 'edit', action } }
            })
        }}
      />
    {/if}
  {/snippet}
</NavigationStack>
```

---

## 6. Navigation Components

### 6.1 Modal Component

```svelte
<!-- lib/composable/navigation-components/Modal.svelte -->
<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import type { Snippet } from 'svelte';

  interface Props {
    store: { state: any; dispatch: (action: any) => void } | null;
    children: Snippet;
    onDismiss?: () => void;
  }

  let { store, children, onDismiss }: Props = $props();

  const isOpen = $derived(store !== null);

  function handleBackdropClick() {
    if (onDismiss) {
      onDismiss();
    }
    // Note: If onDismiss is not provided, the modal stays open.
    // The child feature should handle its own dismissal logic
    // via the dismiss dependency (see section 8.2).
  }

  function handleEscape(e: KeyboardEvent) {
    if (e.key === 'Escape' && isOpen) {
      handleBackdropClick();
    }
  }
</script>

<svelte:window onkeydown={handleEscape} />

{#if isOpen}
  <div class="modal-backdrop" onclick={handleBackdropClick} transition:fade={{ duration: 200 }}>
    <div
      class="modal-content"
      onclick={(e) => e.stopPropagation()}
      transition:scale={{ duration: 200, start: 0.95 }}
      role="dialog"
      aria-modal="true"
    >
      {@render children()}
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: white;
    border-radius: 8px;
    max-width: 90vw;
    max-height: 90vh;
    overflow: auto;
  }
</style>
```

### 6.2 Sheet Component (Bottom Sheet)

```svelte
<!-- lib/composable/navigation-components/Sheet.svelte -->
<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import type { Snippet } from 'svelte';

  interface Props {
    store: { state: any; dispatch: (action: any) => void } | null;
    children: Snippet;
    onDismiss?: () => void;
  }

  let { store, children, onDismiss }: Props = $props();

  const isOpen = $derived(store !== null);

  function handleBackdropClick() {
    if (onDismiss) {
      onDismiss();
    }
    // Note: If onDismiss is not provided, the sheet stays open.
    // The child feature should handle its own dismissal logic
    // via the dismiss dependency (see section 8.2).
  }

  function handleEscape(e: KeyboardEvent) {
    if (e.key === 'Escape' && isOpen) {
      handleBackdropClick();
    }
  }
</script>

<svelte:window onkeydown={handleEscape} />

{#if isOpen}
  <div class="sheet-backdrop" onclick={handleBackdropClick} transition:fade={{ duration: 200 }}>
    <div
      class="sheet-content"
      onclick={(e) => e.stopPropagation()}
      transition:fly={{ y: 300, duration: 300 }}
      role="dialog"
      aria-modal="true"
    >
      <div class="sheet-handle"></div>
      {@render children()}
    </div>
  </div>
{/if}

<style>
  .sheet-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    display: flex;
    align-items: flex-end;
    z-index: 1000;
  }

  .sheet-content {
    background: white;
    border-radius: 16px 16px 0 0;
    width: 100%;
    max-height: 90vh;
    overflow: auto;
    padding: 1rem;
  }

  .sheet-handle {
    width: 40px;
    height: 4px;
    background: #ddd;
    border-radius: 2px;
    margin: 0 auto 1rem;
  }
</style>
```

### 6.3 Drawer Component (Side Drawer)

```svelte
<!-- lib/composable/navigation-components/Drawer.svelte -->
<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import type { Snippet } from 'svelte';

  interface Props {
    store: { state: any; dispatch: (action: any) => void } | null;
    children: Snippet;
    side?: 'left' | 'right';
    onDismiss?: () => void;
  }

  let { store, children, side = 'right', onDismiss }: Props = $props();

  const isOpen = $derived(store !== null);
  const flyX = $derived(side === 'left' ? -300 : 300);

  function handleBackdropClick() {
    if (onDismiss) {
      onDismiss();
    }
    // Note: If onDismiss is not provided, the drawer stays open.
    // The child feature should handle its own dismissal logic
    // via the dismiss dependency (see section 8.2).
  }

  function handleEscape(e: KeyboardEvent) {
    if (e.key === 'Escape' && isOpen) {
      handleBackdropClick();
    }
  }
</script>

<svelte:window onkeydown={handleEscape} />

{#if isOpen}
  <div class="drawer-backdrop" onclick={handleBackdropClick} transition:fade={{ duration: 200 }}>
    <div
      class="drawer-content"
      class:left={side === 'left'}
      class:right={side === 'right'}
      onclick={(e) => e.stopPropagation()}
      transition:fly={{ x: flyX, duration: 300 }}
      role="dialog"
      aria-modal="true"
    >
      {@render children()}
    </div>
  </div>
{/if}

<style>
  .drawer-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 1000;
  }

  .drawer-content {
    position: absolute;
    top: 0;
    bottom: 0;
    width: min(80vw, 400px);
    background: white;
    overflow: auto;
    padding: 1rem;
  }

  .drawer-content.left {
    left: 0;
  }

  .drawer-content.right {
    right: 0;
  }
</style>
```

### 6.4 NavigationStack Component

```svelte
<!-- lib/composable/navigation-components/NavigationStack.svelte -->
<script lang="ts" generics="T">
  import { fly } from 'svelte/transition';
  import type { Snippet } from 'svelte';

  interface Props {
    path: T[];
    onPop: (count?: number) => void;
    root: Snippet;
    destination: Snippet<[T, number]>;
  }

  let { path, onPop, root, destination }: Props = $props();

  const currentIndex = $derived(path.length);
</script>

<div class="navigation-stack">
  {#if currentIndex === 0}
    <div class="stack-screen" transition:fly={{ x: -100, duration: 300 }}>
      {@render root()}
    </div>
  {:else}
    {#each path as element, index (index)}
      {#if index === currentIndex - 1}
        <div class="stack-screen" transition:fly={{ x: 100, duration: 300 }}>
          <button class="back-button" onclick={() => onPop()}>← Back</button>
          {@render destination(element, index)}
        </div>
      {/if}
    {/each}
  {/if}
</div>

<style>
  .navigation-stack {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .stack-screen {
    position: absolute;
    inset: 0;
    background: white;
    overflow: auto;
  }

  .back-button {
    padding: 0.5rem 1rem;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 1rem;
  }
</style>
```

### 6.5 Alert Component

```svelte
<!-- lib/composable/navigation-components/Alert.svelte -->
<script lang="ts">
  import { scale } from 'svelte/transition';
  import type { Snippet } from 'svelte';

  interface AlertState {
    title: string;
    message: string;
    buttons: Array<{
      text: string;
      role?: 'cancel' | 'destructive';
      action: any;
    }>;
  }

  interface Props {
    store: { state: AlertState; dispatch: (action: any) => void } | null;
    onDismiss?: () => void;
  }

  let { store, onDismiss }: Props = $props();

  const isOpen = $derived(store !== null);

  function handleButton(action: any) {
    if (store) {
      store.dispatch(action);
    }
  }
</script>

{#if isOpen && store}
  <div class="alert-backdrop" transition:scale={{ duration: 200 }}>
    <div class="alert-content" role="alertdialog" aria-modal="true">
      <h2>{store.state.title}</h2>
      <p>{store.state.message}</p>
      <div class="alert-buttons">
        {#each store.state.buttons as button}
          <button
            class:cancel={button.role === 'cancel'}
            class:destructive={button.role === 'destructive'}
            onclick={() => handleButton(button.action)}
          >
            {button.text}
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .alert-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
  }

  .alert-content {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    max-width: 300px;
    text-align: center;
  }

  .alert-buttons {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  button {
    flex: 1;
    padding: 0.5rem;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  button.cancel {
    background: #f0f0f0;
  }

  button.destructive {
    background: #ff4444;
    color: white;
  }
</style>
```

---

## 7. Integration Patterns

### 7.1 Parent Observing Child Actions

Parent features have full visibility into child actions:

```typescript
const inventoryReducer: Reducer<InventoryState, InventoryAction> = (
  state,
  action,
  deps
) => {
  // Observe child actions by pattern matching
  if (
    action.type === 'destination' &&
    action.action.type === 'presented' &&
    action.action.action.type === 'addItem' &&
    action.action.action.action.type === 'saveButtonTapped'
  ) {
    // Extract child state
    if (state.destination?.type === 'addItem') {
      const newItem = state.destination.state.item;

      return [
        {
          ...state,
          items: [...state.items, newItem],
          destination: null // Dismiss child
        },
        Effect.fireAndForget(() => {
          deps.analytics.track('item_added', { itemId: newItem.id });
        })
      ];
    }
  }

  // ... rest of reducer
};
```

### 7.2 Helper: Deep Action Matching

```typescript
// lib/composable/navigation.ts

/**
 * Match deeply nested presentation actions.
 *
 * Navigates through action wrappers following a path.
 * Returns the final action if path matches, null otherwise.
 */
export function matchPresentationAction<T>(
  action: any,
  path: string[]
): T | null {
  let current = action;

  for (let i = 0; i < path.length; i++) {
    const segment = path[i];

    // Check if current action type matches segment
    if (current?.type !== segment) {
      return null;
    }

    // Move to next level
    // If there are more segments, current must have an 'action' field
    if (i < path.length - 1) {
      if (!current.action) {
        return null;
      }
      current = current.action;
    }
  }

  // Return the final action after following the path
  return current.action ?? current;
}

/**
 * Check if action matches a path and satisfies a predicate.
 */
export function isActionAtPath<T>(
  action: any,
  path: string[],
  predicate: (action: T) => boolean
): boolean {
  const matched = matchPresentationAction<T>(action, path);
  return matched !== null && predicate(matched);
}

// Usage
const innerAction = matchPresentationAction(
  action,
  ['destination', 'presented', 'addItem']
);
if (innerAction?.type === 'saveButtonTapped') {
  // Handle save
}

// Or using predicate helper
if (isActionAtPath(
  action,
  ['destination', 'presented', 'addItem'],
  (a) => a.type === 'saveButtonTapped'
)) {
  // Handle save
}
```

---

## 8. Dismissal Patterns

### 8.1 Parent-Initiated Dismissal

Parents can dismiss children by nil'ing out state:

```typescript
case 'closeTapped':
  return [
    { ...state, destination: null },
    Effect.none()
  ];
```

### 8.2 Child-Initiated Dismissal (Dismiss Dependency)

Children can dismiss themselves using a dependency:

```typescript
// lib/composable/dependencies/dismiss.ts

import type { Dispatch } from '$lib/composable/types';

/**
 * Dismiss dependency allows child features to dismiss themselves.
 *
 * When invoked, sends a PresentationAction.dismiss action.
 */
export interface DismissEffect {
  (): Promise<void>;
}

export const createDismissDependency = <Action>(
  dispatch: Dispatch<Action>,
  createDismissAction: () => Action
): DismissEffect => {
  return async () => {
    dispatch(createDismissAction());
  };
};

// Usage in child reducer
const addItemReducer: Reducer<AddItemState, AddItemAction, Dependencies> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'saveButtonTapped':
      return [
        state,
        Effect.run(async (dispatch) => {
          // Save item
          await deps.apiClient.save(state.item);

          // Dismiss self
          await deps.dismiss();
        })
      ];
  }
};
```

### 8.3 Dismiss Dependency Setup

When presenting a child feature that needs self-dismissal capability, inject the dismiss dependency:

```svelte
<!-- features/inventory/Inventory.svelte -->
<script lang="ts">
  import { createStore } from '$lib/composable/store.svelte';
  import { inventoryReducer } from './reducer';
  import { initialState } from './state';
  import { createDismissDependency } from '$lib/composable/dependencies/dismiss';
  import { Modal } from '$lib/composable/navigation-components';
  import AddItemView from '../add-item/AddItem.svelte';
  import type { AddItemAction } from '../add-item/actions';

  // Get live dependencies from parent context or define locally
  // This would typically come from a context or be imported from a dependencies module
  const liveDependencies = {
    apiClient: /* your API client */,
    analytics: /* your analytics service */,
    // ... other dependencies
  };

  const store = createStore({
    initialState,
    reducer: inventoryReducer
  });

  // Create scoped store with dismiss dependency
  const addItemStore = $derived(
    store.state.destination?.type === 'addItem'
      ? {
          state: store.state.destination.state,
          dispatch: (action: AddItemAction) =>
            store.dispatch({
              type: 'destination',
              action: {
                type: 'presented',
                action: {
                  type: 'addItem',
                  action
                }
              }
            }),
          // Inject dismiss dependency
          dependencies: {
            ...liveDependencies,
            dismiss: createDismissDependency(
              store.dispatch,
              () => ({
                type: 'destination',
                action: { type: 'dismiss' }
              })
            )
          }
        }
      : null
  );
</script>

<Modal store={addItemStore}>
  {#if addItemStore}
    <AddItemView store={addItemStore} />
  {/if}
</Modal>
```

The child feature can now call `deps.dismiss()` to dismiss itself:

```typescript
// features/add-item/reducer.ts
const addItemReducer: Reducer<AddItemState, AddItemAction, Dependencies> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'saveButtonTapped':
      return [
        state,
        Effect.run(async (dispatch) => {
          await deps.apiClient.save(state.item);
          // Child dismisses itself
          await deps.dismiss();
        })
      ];

    case 'cancelButtonTapped':
      return [
        state,
        Effect.run(async () => {
          await deps.dismiss();
        })
      ];
  }
};
```

### 8.4 Important: Action Ordering

⚠️ **Never dispatch actions after calling dismiss:**

```typescript
// ❌ BAD: Action sent after dismissal
return Effect.run(async (dispatch) => {
  await deps.dismiss();
  dispatch({ type: 'itemSaved' }); // ⚠️ State is now null!
});

// ✅ GOOD: Dismiss is the last action
return Effect.run(async (dispatch) => {
  dispatch({ type: 'itemSaved' });
  await deps.dismiss();
});
```

### 8.5 Dismissal Pattern Decision Tree

With animations (see animation-integration-spec.md), there are three different dismissal patterns. Use this decision tree to choose the right one:

```
Does the dismissal need animation?
│
├─ YES → Use action-driven dismissal with animation state
│         │
│         ├─ User taps close button:
│         │   dispatch({ type: 'closeButtonTapped' })
│         │   → Reducer sets animation.status = 'dismissing'
│         │   → After animation completes, dispatch animation completion
│         │   → Reducer sets destination = null
│         │
│         └─ Example: Animated modal slide-out
│
└─ NO → Does child need to dismiss itself (e.g., after save)?
          │
          ├─ YES → Use dismiss dependency
          │         │
          │         ├─ Inject deps.dismiss() when creating child store
          │         ├─ Child calls await deps.dismiss()
          │         ├─ Parent receives PresentationAction.dismiss
          │         └─ Parent sets destination = null
          │
          └─ NO → Use parent-initiated dismissal
                    │
                    ├─ Parent handles close action directly
                    ├─ dispatch({ type: 'closeTapped' })
                    └─ Reducer sets destination = null immediately
```

#### Pattern Comparison

| Pattern | When to Use | Pros | Cons | Example |
|---------|-------------|------|------|---------|
| **Parent-initiated** | Parent controls dismissal, no animation | Simple, direct | Child can't self-dismiss | Close button in parent component |
| **Dismiss dependency** | Child needs to dismiss after async work | Child autonomy, testable | Requires dependency injection | Save-and-close flow |
| **Action-driven (animated)** | Dismissal needs animation | Smooth UX, cancellable | More complex, requires animation state | Slide-out modal |

#### Choosing Between Patterns

**Use parent-initiated dismissal when:**
- ✓ Parent has full control over when to dismiss
- ✓ No animation needed
- ✓ Close button is in parent template
- ✓ Simplest case

**Use dismiss dependency when:**
- ✓ Child needs to dismiss itself (e.g., after save)
- ✓ Child performs async work before dismissing
- ✓ No animation needed, or animation is handled separately
- ✓ Testing child dismissal logic in isolation

**Use action-driven dismissal when:**
- ✓ Dismissal requires animation
- ✓ Need to prevent actions during dismissal animation
- ✓ May need to cancel dismissal mid-animation
- ✓ Using animated navigation components

#### Combining Patterns

You can combine patterns for different dismissal triggers:

```typescript
// Parent-initiated: User taps backdrop
case 'backdropTapped':
  return [{ ...state, destination: null }, Effect.none()];

// Child-initiated: User saves and closes
case 'destination':
  if (action.action.type === 'dismiss') {
    return [{ ...state, destination: null }, Effect.none()];
  }
  break;

// Action-driven: Animated close button
case 'closeButtonTapped':
  return [
    {
      ...state,
      animation: { status: 'dismissing' }
    },
    Effect.afterDelay(300, (dispatch) => {
      dispatch({ type: 'animationCompleted' });
    })
  ];

case 'animationCompleted':
  if (state.animation.status === 'dismissing') {
    return [
      {
        ...state,
        destination: null,
        animation: { status: 'idle' }
      },
      Effect.none()
    ];
  }
  break;
```

---

## 9. Testing Navigation

### 9.1 Testing Optional Navigation

```typescript
// features/inventory/reducer.test.ts

import { describe, it, expect } from 'vitest';
import { TestStore } from '$lib/composable/test';
import { inventoryReducer } from './reducer';
import { initialState } from './state';

describe('inventoryReducer navigation', () => {
  it('presents add item form', async () => {
    const store = new TestStore({
      initialState,
      reducer: inventoryReducer
    });

    await store.send({ type: 'addButtonTapped' }, (state) => {
      expect(state.addItem).not.toBeNull();
      expect(state.addItem?.text).toBe('');
    });
  });

  it('dismisses add item form', async () => {
    const store = new TestStore({
      initialState: {
        ...initialState,
        addItem: { text: 'Test', isValid: true }
      },
      reducer: inventoryReducer
    });

    await store.send({
      type: 'addItem',
      action: { type: 'dismiss' }
    }, (state) => {
      expect(state.addItem).toBeNull();
    });
  });
});
```

### 9.2 Testing Enum Navigation

```typescript
describe('inventory destination navigation', () => {
  it('switches between destinations', async () => {
    const store = new TestStore({
      initialState,
      reducer: inventoryReducer
    });

    // Navigate to add
    await store.send({ type: 'addButtonTapped' }, (state) => {
      expect(state.destination?.type).toBe('addItem');
    });

    // Switch to edit
    await store.send({
      type: 'editButtonTapped',
      itemId: 'item-1'
    }, (state) => {
      expect(state.destination?.type).toBe('editItem');
    });
  });
});
```

### 9.3 Testing Child Actions from Parent

```typescript
it('observes child save action', async () => {
  const store = new TestStore({
    initialState: {
      ...initialState,
      destination: {
        type: 'addItem',
        state: { text: 'New Item', isValid: true }
      }
    },
    reducer: inventoryReducer
  });

  // Send child action
  await store.send({
    type: 'destination',
    action: {
      type: 'presented',
      action: {
        type: 'addItem',
        action: { type: 'saveButtonTapped' }
      }
    }
  }, (state) => {
    // Parent adds item and dismisses
    expect(state.items).toHaveLength(1);
    expect(state.items[0].text).toBe('New Item');
    expect(state.destination).toBeNull();
  });
});
```

### 9.4 Non-Exhaustive Navigation Testing

```typescript
it('navigates to detail and dismisses', async () => {
  const store = new TestStore({
    initialState,
    reducer: inventoryReducer
  });
  store.exhaustivity = 'off';

  // High-level assertions only
  await store.send({ type: 'itemSelected', itemId: 'item-1' });

  // Verify destination presented
  expect(store.getState().destination?.type).toBe('detailItem');

  await store.send({
    type: 'destination',
    action: { type: 'dismiss' }
  });

  // Verify dismissed
  expect(store.getState().destination).toBeNull();
});
```

---

## 10. SvelteKit Integration

### 10.1 URL-Driven Navigation

Synchronize state with URL for deep-linking:

```typescript
// lib/composable/routing.ts

import { goto } from '$app/navigation';
import { page } from '$app/stores';

/**
 * Sync navigation state with URL.
 */
export function createRouteSyncEffect<State, Action>(
  stateToPath: (state: State) => string,
  pathToAction: (path: string) => Action | null
): (state: State) => Effect<Action> {
  return (state: State) => {
    const expectedPath = stateToPath(state);
    const currentPath = window.location.pathname;

    if (expectedPath !== currentPath) {
      return Effect.fireAndForget(async () => {
        await goto(expectedPath);
      });
    }

    return Effect.none();
  };
}

// Usage example integrated into a reducer
export const inventoryReducer: Reducer<InventoryState, InventoryAction> = (
  state,
  action,
  deps
) => {
  // Core reducer logic (handle actions)
  const coreReducer: Reducer<InventoryState, InventoryAction> = (state, action, deps) => {
    switch (action.type) {
      case 'itemSelected': {
        const item = state.items.find(i => i.id === action.itemId);
        if (!item) return [state, Effect.none()];

        return [
          {
            ...state,
            destination: {
              type: 'detailItem',
              state: { itemId: action.itemId }
            }
          },
          Effect.none()
        ];
      }
      // ... other cases
      default:
        const _exhaustive: never = action;
        return [state, Effect.none()];
    }
  };

  const [newState, effect] = coreReducer(state, action, deps);

  // Sync URL with navigation state
  const syncEffect = createRouteSyncEffect(
    (s: InventoryState) => {
      if (s.destination?.type === 'detailItem') {
        return `/inventory/${s.destination.state.itemId}`;
      }
      return '/inventory';
    },
    (path: string) => {
      const match = path.match(/^\/inventory\/(.+)$/);
      if (match) {
        return { type: 'itemSelected', itemId: match[1] };
      }
      return null;
    }
  )(newState);

  return [newState, Effect.batch(effect, syncEffect)];
};
```

### 10.2 Route-Based Initial State

```typescript
// routes/inventory/[itemId]/+page.ts

import type { PageLoad } from './$types';
import { initialState } from '$features/inventory/state';

export const load: PageLoad = ({ params }) => {
  // Initialize state based on route
  const state = {
    ...initialState,
    destination: {
      type: 'detailItem',
      state: { itemId: params.itemId }
    }
  };

  return { initialState: state };
};
```

### 10.3 Programmatic Navigation

```typescript
// Navigate by updating state, effect syncs URL
case 'itemSelected':
  return [
    {
      ...state,
      destination: {
        type: 'detailItem',
        state: { itemId: action.itemId }
      }
    },
    Effect.none()
  ];
// URL automatically updates via sync effect
```

### 10.4 Browser Back Button Handling

Handle browser back/forward navigation by dispatching actions based on URL changes:

```typescript
// lib/composable/routing.ts

import { beforeNavigate, afterNavigate } from '$app/navigation';
import type { Store } from './types';

/**
 * Sync browser navigation with store state.
 * Dispatches actions when user clicks back/forward.
 */
export function syncBrowserNavigation<State, Action>(
  store: Store<State, Action>,
  pathToAction: (path: string) => Action | null
): () => void {
  let isNavigatingFromState = false;

  // Handle browser back/forward
  const unsubscribeAfter = afterNavigate(({ to }) => {
    if (isNavigatingFromState) {
      // Navigation triggered by state change, ignore
      isNavigatingFromState = false;
      return;
    }

    // Navigation triggered by browser (back/forward), dispatch action
    const action = pathToAction(to?.url.pathname ?? '/');
    if (action) {
      store.dispatch(action);
    }
  });

  // Track state-driven navigation
  const unsubscribeStore = store.subscribe((state) => {
    // Mark next navigation as state-driven
    isNavigatingFromState = true;
  });

  return () => {
    unsubscribeAfter();
    unsubscribeStore();
  };
}
```

**Usage:**

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { syncBrowserNavigation } from '$lib/composable/routing';

  const store = createStore({ initialState, reducer });

  onMount(() => {
    const unsubscribe = syncBrowserNavigation(
      store,
      (path) => {
        // Map URL to action
        if (path === '/inventory') {
          return { type: 'closeDetailTapped' };
        }
        const match = path.match(/^\/inventory\/(.+)$/);
        if (match) {
          return { type: 'itemSelected', itemId: match[1] };
        }
        return null;
      }
    );

    return unsubscribe;
  });
</script>
```

### 10.5 Preventing Navigation (Dirty Forms)

Prevent accidental navigation when forms have unsaved changes:

```typescript
// features/edit-item/reducer.ts

interface EditItemState {
  id: string;
  name: string;
  quantity: number;
  isDirty: boolean;  // Track unsaved changes
}

type EditItemAction =
  | { type: 'nameChanged'; value: string }
  | { type: 'saveButtonTapped' }
  | { type: 'dismiss' }
  | { type: 'confirmDismiss' };

const editItemReducer: Reducer<EditItemState, EditItemAction> = (state, action) => {
  switch (action.type) {
    case 'nameChanged':
      return [
        { ...state, name: action.value, isDirty: true },
        Effect.none()
      ];

    case 'dismiss': {
      // If dirty, don't dismiss - show confirmation instead
      if (state.isDirty) {
        // Could dispatch a 'showConfirmation' action
        // or set a state flag
        return [state, Effect.none()];
      }

      // Clean, allow dismissal
      return [state, Effect.none()];
    }

    case 'confirmDismiss':
      // User confirmed, dismiss even if dirty
      return [state, Effect.none()];

    case 'saveButtonTapped':
      return [
        { ...state, isDirty: false },
        Effect.run(async (dispatch) => {
          // Save logic
        })
      ];
  }
};
```

**Using SvelteKit's `beforeNavigate`:**

```svelte
<script lang="ts">
  import { beforeNavigate } from '$app/navigation';

  const store = createStore({ initialState, reducer });

  beforeNavigate(({ cancel }) => {
    // Check if form is dirty
    if (store.state.destination?.type === 'editItem' &&
        store.state.destination.state.isDirty) {

      const confirmLeave = confirm(
        'You have unsaved changes. Are you sure you want to leave?'
      );

      if (!confirmLeave) {
        cancel();  // Prevent navigation
      }
    }
  });
</script>
```

**Better approach using state:**

```typescript
interface EditItemState {
  id: string;
  name: string;
  quantity: number;
  isDirty: boolean;
  showConfirmation: boolean;  // Add confirmation state
}

type EditItemAction =
  | { type: 'nameChanged'; value: string }
  | { type: 'dismissTapped' }
  | { type: 'dismissConfirmed' }
  | { type: 'dismissCancelled' };

const editItemReducer: Reducer<EditItemState, EditItemAction> = (state, action) => {
  switch (action.type) {
    case 'dismissTapped': {
      if (state.isDirty) {
        // Show confirmation dialog in state
        return [
          { ...state, showConfirmation: true },
          Effect.none()
        ];
      }

      // Clean, signal parent to dismiss
      return [state, Effect.none()];
    }

    case 'dismissConfirmed':
      // User confirmed, clear dirty flag and signal dismiss
      return [
        { ...state, isDirty: false, showConfirmation: false },
        Effect.none()
      ];

    case 'dismissCancelled':
      return [
        { ...state, showConfirmation: false },
        Effect.none()
      ];
  }
};
```

### 10.6 Scroll Restoration

Preserve scroll position when navigating back to list views:

```typescript
// features/inventory/state.ts

interface InventoryState {
  items: Item[];
  destination: DestinationState | null;
  scrollPosition: number;  // Add scroll tracking
}

// features/inventory/reducer.ts

case 'itemSelected': {
  return [
    {
      ...state,
      destination: { type: 'detailItem', state: { itemId: action.itemId } },
      scrollPosition: window.scrollY  // Capture before navigation
    },
    Effect.none()
  ];
}

case 'closeDetailTapped': {
  return [
    {
      ...state,
      destination: null
    },
    Effect.run(async () => {
      // Restore scroll position after render
      await tick();
      window.scrollTo(0, state.scrollPosition);
    })
  ];
}
```

**Using SvelteKit's scroll restoration:**

```svelte
<!-- routes/inventory/+page.svelte -->
<script lang="ts">
  import { page } from '$app/stores';

  const store = createStore({ initialState, reducer });

  // Disable SvelteKit's automatic scroll restoration
  // if using custom scroll management
  export const snapshot = {
    capture: () => ({ scrollY: window.scrollY }),
    restore: (values) => {
      if (values.scrollY !== undefined) {
        window.scrollTo(0, values.scrollY);
      }
    }
  };
</script>
```

**Scroll to top on modal open:**

```typescript
case 'addButtonTapped': {
  const destination = {
    type: 'addItem' as const,
    state: initialAddItemState
  };

  return [
    {
      ...state,
      destination,
      presentation: { status: 'presenting', content: destination, duration: 300 }
    },
    Effect.batch(
      Effect.afterDelay(300, (d) =>
        d({ type: 'presentation', event: { type: 'presentationCompleted' } })
      ),
      Effect.fireAndForget(() => {
        // Scroll modal content to top when opened
        const modalEl = document.querySelector('[data-modal-content]');
        if (modalEl) {
          modalEl.scrollTop = 0;
        }
      })
    )
  ];
}
```

### 10.7 Complete SvelteKit Example

```svelte
<!-- routes/inventory/[[itemId]]/+page.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import { beforeNavigate, goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import { createStore } from '$lib/composable/store.svelte';
  import { inventoryReducer } from '$features/inventory/reducer';
  import { initialState } from '$features/inventory/state';
  import { liveDependencies } from '$lib/dependencies/live';

  // Initialize store with route-based state
  const store = createStore({
    initialState: {
      ...initialState,
      destination: $page.params.itemId
        ? {
            type: 'detailItem',
            state: { itemId: $page.params.itemId }
          }
        : null
    },
    reducer: inventoryReducer,
    dependencies: liveDependencies
  });

  // Sync URL with state
  $effect(() => {
    const expectedPath = store.state.destination?.type === 'detailItem'
      ? `/inventory/${store.state.destination.state.itemId}`
      : '/inventory';

    if (expectedPath !== $page.url.pathname) {
      goto(expectedPath, { replaceState: false });
    }
  });

  // Handle browser back button
  beforeNavigate(({ to, cancel }) => {
    // Prevent navigation if form is dirty
    if (store.state.destination?.type === 'editItem' &&
        store.state.destination.state.isDirty) {

      if (!confirm('You have unsaved changes. Leave anyway?')) {
        cancel();
        return;
      }
    }

    // Dispatch action based on URL
    if (to) {
      const match = to.url.pathname.match(/^\/inventory\/(.+)$/);
      if (match && !store.state.destination) {
        cancel();  // Prevent default navigation
        store.dispatch({ type: 'itemSelected', itemId: match[1] });
      } else if (to.url.pathname === '/inventory' && store.state.destination) {
        cancel();  // Prevent default navigation
        store.dispatch({ type: 'closeDetailTapped' });
      }
    }
  });

  onDestroy(() => {
    store.destroy();
  });
</script>

<div class="inventory">
  <!-- Inventory content -->
</div>
```

---

## 11. Best Practices

### 11.1 State Modeling

✅ **DO:**
- Use single optional for single destination
- Use enum for multiple mutually-exclusive destinations
- Keep navigation state flat and normalized
- Model navigation as data, not callbacks

❌ **DON'T:**
- Use multiple optionals for multiple destinations
- Store navigation logic in components
- Mix state-driven and imperative navigation
- Create circular navigation dependencies

### 11.2 Action Design

✅ **DO:**
- Use descriptive action names (`'addButtonTapped'`, `'itemSelected'`)
- Wrap child actions in `PresentationAction`
- Handle `dismiss` action in child reducers
- Pattern match on child actions in parent when needed

❌ **DON'T:**
- Send actions after calling `dismiss()`
- Create imperative navigation functions
- Skip the presentation action wrapper
- Ignore the dismiss action

### 11.3 Reducer Composition

✅ **DO:**
- Use `ifLet` for optional navigation
- Use `createDestinationReducer` for enum navigation
- Keep navigation logic in reducers, not views
- Test navigation flows comprehensively

❌ **DON'T:**
- Manage navigation state in components
- Mutate navigation state directly
- Skip reducer integration
- Test views instead of reducers

### 11.4 View Integration

✅ **DO:**
- Use provided navigation components (Modal, Sheet, etc.)
- Derive scoped stores for child features
- Handle dismissal consistently
- Use Svelte transitions for smooth animations

❌ **DON'T:**
- Create ad-hoc navigation UI
- Pass full parent store to children
- Mix presentation styles inconsistently
- Ignore accessibility requirements

---

## 12. API Reference

### 12.1 Types

```typescript
/**
 * Wraps child actions with presentation semantics.
 */
export type PresentationAction<ChildAction> =
  | { type: 'presented'; action: ChildAction }
  | { type: 'dismiss' };

/**
 * Stack action for managing navigation arrays.
 * @template A - The action type for stack elements
 * @template S - The state type for stack elements (defaults to any)
 */
export type StackAction<A, S = any> =
  | { type: 'element'; index: number; action: A }
  | { type: 'push'; element: S }
  | { type: 'pop'; count?: number }
  | { type: 'popToRoot' };
```

### 12.2 Operators

```typescript
/**
 * Integrate optional child feature into parent.
 */
export function ifLet<ParentState, ParentAction, ChildState, ChildAction>(
  toChild: (parent: ParentState) => ChildState | null,
  fromChild: (parent: ParentState, child: ChildState | null) => ParentState,
  toChildAction: (action: ParentAction) => PresentationAction<ChildAction> | null,
  fromChildAction: (action: PresentationAction<ChildAction>) => ParentAction,
  childReducer: Reducer<ChildState, ChildAction>
): Reducer<ParentState, ParentAction>;

/**
 * Create reducer for enum-based destinations.
 */
export function createDestinationReducer<
  State extends { type: string },
  Action extends { type: string }
>(
  reducers: {
    [K in State['type']]: Reducer<
      Extract<State, { type: K }>['state'],
      Extract<Action, { type: K }>['action']
    >
  }
): Reducer<State, Action>;

/**
 * Create scoped store for specific destination case.
 * Returns an object with state and dispatch, or null if destination doesn't match.
 */
export function scopeToDestination<DestState, DestAction, CaseType extends string>(
  store: Store<any, any>,
  destinationPath: string[],
  caseType: CaseType,
  parentActionType: string
): { state: DestState; dispatch: (action: DestAction) => void } | null;

/**
 * Match deeply nested presentation actions.
 * Navigates through action wrappers following a path.
 * Returns the final action if path matches, null otherwise.
 */
export function matchPresentationAction<T>(
  action: any,
  path: string[]
): T | null;

/**
 * Check if action matches a path and satisfies a predicate.
 */
export function isActionAtPath<T>(
  action: any,
  path: string[],
  predicate: (action: T) => boolean
): boolean;
```

### 12.3 Dependencies

```typescript
/**
 * Dismiss effect allows child to dismiss itself.
 */
export interface DismissEffect {
  (): Promise<void>;
}

export const createDismissDependency: <Action>(
  dispatch: Dispatch<Action>,
  createDismissAction: () => Action
) => DismissEffect;
```

### 12.4 Components

```typescript
// Modal
interface ModalProps {
  store: { state: any; dispatch: (action: any) => void } | null;
  children: Snippet;
  onDismiss?: () => void;
}

// Sheet
interface SheetProps {
  store: { state: any; dispatch: (action: any) => void } | null;
  children: Snippet;
  onDismiss?: () => void;
}

// Drawer
interface DrawerProps {
  store: { state: any; dispatch: (action: any) => void } | null;
  children: Snippet;
  side?: 'left' | 'right';
  onDismiss?: () => void;
}

// NavigationStack
interface NavigationStackProps<T> {
  path: T[];
  onPop: (count?: number) => void;
  root: Snippet;
  destination: Snippet<[T, number]>;
}

// Alert
interface AlertProps {
  store: { state: AlertState; dispatch: (action: any) => void } | null;
  onDismiss?: () => void;
}
```

---

## Appendix A: Complete Example

See `examples/inventory-navigation` for a complete working example demonstrating:

- Optional state navigation (single destination)
- Enum state navigation (multiple destinations)
- Parent-child integration
- Child-initiated dismissal
- Parent observation of child actions
- Comprehensive testing
- SvelteKit route synchronization

## Appendix B: Migration from Imperative Navigation

```typescript
// Before: Imperative navigation
let showModal = $state(false);

function openModal() {
  showModal = true;
}

// After: Declarative navigation
case 'addButtonTapped':
  return [
    { ...state, addItem: initialAddItemState },
    Effect.none()
  ];
```

## Appendix C: Comparison with TCA

| Feature | TCA (Swift) | Composable Svelte |
|---------|-------------|-------------------|
| Optional Navigation | `@Presents` macro | Manual optional field |
| Presentation Wrapper | `PresentationAction<T>` | `PresentationAction<T>` |
| Integration | `ifLet(\.$child, action: \.child)` | `ifLet()` function |
| Enum Destinations | `@Reducer enum Destination` | Manual discriminated union |
| Dismissal | `@Dependency(\.dismiss)` | `deps.dismiss()` |
| View Integration | `.sheet(item: $store.scope(...))` | `<Modal store={...}>` |
| Testing | `TestStore` | `TestStore` |

---

**End of Navigation Specification**
