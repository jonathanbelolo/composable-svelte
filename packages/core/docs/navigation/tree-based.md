# Tree-Based Navigation

State-driven navigation in Composable Svelte using optional and enum state fields.

## Table of Contents

1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [Optional Children Pattern](#optional-children-pattern)
4. [The ifLet Operator](#the-iflet-operator)
5. [PresentationAction Wrapper](#presentationaction-wrapper)
6. [Enum Destinations](#enum-destinations)
7. [Navigation Components](#navigation-components)
8. [Stack Navigation](#stack-navigation)
9. [Dismiss Dependency](#dismiss-dependency)
10. [Deep Linking and URL Sync](#deep-linking-and-url-sync)
11. [Testing Navigation](#testing-navigation)
12. [Best Practices](#best-practices)
13. [Common Patterns](#common-patterns)

## Overview

Tree-based navigation treats your application's navigation structure as a **state tree**. Each feature's state contains optional fields representing child features that may or may not be presented.

### Key Principles

1. **State-Driven**: Navigation is controlled by state, not imperative commands
2. **Declarative**: What to show is determined by state shape, not show/hide methods
3. **Composable**: Child features compose into parents via reducer composition
4. **Type-Safe**: TypeScript ensures valid navigation paths
5. **Testable**: Navigation flows are pure reducer logic

### Navigation as State

```typescript
// Traditional imperative navigation
modal.show();  // ❌ Imperative command
navigate('/details', item);  // ❌ Side effect

// Composable Svelte: declarative state
interface AppState {
  destination: AddItemState | null;  // ✅ State field
}

// Non-null = presented, null = dismissed
```

### The Tree Structure

```
AppState
├── items: Item[]
└── destination: DestinationState | null
    ├── type: 'addItem'
    │   └── state: AddItemState
    │       └── destination: ConfirmState | null  // Nested!
    ├── type: 'editItem'
    │   └── state: EditItemState
    └── type: 'filter'
        └── state: FilterState
```

Each level can have its own destination, creating a tree of presented features.

## Core Concepts

### Non-Null = Presented

The fundamental pattern: **a non-null destination field means the feature is presented**.

```typescript
interface ParentState {
  items: Item[];
  destination: AddItemState | null;  // Optional child
}

// Not presented
{ items: [...], destination: null }

// Presented
{ items: [...], destination: { name: '', quantity: 0 } }
```

### Action Routing

Parent actions route to child reducers based on discriminated union types:

```typescript
type ParentAction =
  | { type: 'addButtonTapped' }
  | { type: 'destination'; action: PresentationAction<AddItemAction> };

// Parent handles presentation
case 'addButtonTapped':
  return [{ ...state, destination: initialAddItemState }, Effect.none()];

// Child handles its own logic
case 'destination':
  return ifLet(...)(state, action, deps);
```

### Reducer Composition

Child reducers compose into parents using `ifLet()`:

```typescript
const parentReducer = (state, action, deps) => {
  switch (action.type) {
    case 'destination':
      // Compose child reducer for optional destination
      return ifLet(
        (s) => s.destination,           // Extract child state
        (s, d) => ({ ...s, destination: d }),  // Update with new state
        (a) => a.type === 'destination' ? a.action : null,  // Extract child action
        (ca) => ({ type: 'destination', action: ca }),  // Wrap child action
        childReducer                     // Child reducer
      )(state, action, deps);
  }
};
```

## Optional Children Pattern

Use optional state fields for features that may or may not be presented (modals, sheets, drawers, alerts).

### Basic Pattern

```typescript
// 1. Define child state
interface AddItemState {
  name: string;
  quantity: number;
}

type AddItemAction =
  | { type: 'nameChanged'; name: string }
  | { type: 'quantityChanged'; quantity: number }
  | { type: 'saveButtonTapped' }
  | { type: 'cancelButtonTapped' };

// 2. Define parent state with optional child
interface InventoryState {
  items: Item[];
  destination: AddItemState | null;  // Optional!
}

type InventoryAction =
  | { type: 'addButtonTapped' }
  | { type: 'destination'; action: PresentationAction<AddItemAction> };
```

### Presenting Child

Set the destination field to non-null:

```typescript
case 'addButtonTapped':
  return [
    {
      ...state,
      destination: {
        name: '',
        quantity: 0
      }
    },
    Effect.none()
  ];
```

### Dismissing Child

Set the destination field to null:

```typescript
case 'destination':
  // Handle dismiss action
  if (action.action.type === 'dismiss') {
    return [{ ...state, destination: null }, Effect.none()];
  }

  // Handle child actions
  return ifLet(...)(state, action, deps);
```

### Complete Example

```typescript
const inventoryReducer: Reducer<InventoryState, InventoryAction, InventoryDeps> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'addButtonTapped':
      return [
        { ...state, destination: { name: '', quantity: 0 } },
        Effect.none()
      ];

    case 'destination':
      // Dismiss action
      if (action.action.type === 'dismiss') {
        return [{ ...state, destination: null }, Effect.none()];
      }

      // Child actions
      return ifLet(
        (s) => s.destination,
        (s, d) => ({ ...s, destination: d }),
        (a) => a.type === 'destination' && a.action.type === 'presented'
          ? a.action.action
          : null,
        (ca) => ({ type: 'destination', action: { type: 'presented', action: ca } }),
        addItemReducer
      )(state, action, deps);

    default:
      return [state, Effect.none()];
  }
};
```

## The ifLet Operator

The `ifLet()` function composes child reducers that operate on optional state.

### Full Signature

```typescript
function ifLet<ParentState, ParentAction, ChildState, ChildAction, Dependencies>(
  toChildState: (parentState: ParentState) => ChildState | null,
  fromChildState: (parentState: ParentState, childState: ChildState | null) => ParentState,
  toChildAction: (parentAction: ParentAction) => ChildAction | null,
  fromChildAction: (childAction: ChildAction) => ParentAction,
  childReducer: Reducer<ChildState, ChildAction, Dependencies>
): Reducer<ParentState, ParentAction, Dependencies>
```

### Parameters Explained

#### 1. `toChildState`: Extract Child State

```typescript
(s) => s.destination
```

Extracts the optional child state from parent state. Returns `null` if not presented.

#### 2. `fromChildState`: Update Parent with Child State

```typescript
(s, d) => ({ ...s, destination: d })
```

Reconstructs parent state with new child state (may be `null` to dismiss).

#### 3. `toChildAction`: Extract Child Action

```typescript
(a) => a.type === 'destination' && a.action.type === 'presented'
  ? a.action.action
  : null
```

Extracts child action from parent action. Returns `null` if action doesn't apply to child.

#### 4. `fromChildAction`: Wrap Child Action

```typescript
(ca) => ({ type: 'destination', action: { type: 'presented', action: ca } })
```

Wraps child action into parent action structure.

#### 5. `childReducer`: The Child Reducer

```typescript
addItemReducer
```

The child feature's reducer function.

### How ifLet Works

```typescript
// Pseudo-code implementation
function ifLet(toChildState, fromChildState, toChildAction, fromChildAction, childReducer) {
  return (parentState, parentAction, deps) => {
    // 1. Try to extract child action
    const childAction = toChildAction(parentAction);
    if (childAction === null) {
      return [parentState, Effect.none()];  // Not for child
    }

    // 2. Extract child state
    const childState = toChildState(parentState);
    if (childState === null) {
      return [parentState, Effect.none()];  // Child not presented
    }

    // 3. Run child reducer
    const [newChildState, childEffect] = childReducer(childState, childAction, deps);

    // 4. Update parent state
    const newParentState = fromChildState(parentState, newChildState);

    // 5. Map child effects to parent actions
    const parentEffect = Effect.map(childEffect, fromChildAction);

    return [newParentState, parentEffect];
  };
}
```

### ifLetPresentation Helper

For the common case where child actions are wrapped in `PresentationAction`:

```typescript
ifLetPresentation(
  (s) => s.destination,
  (s, d) => ({ ...s, destination: d }),
  'destination',  // Action type to match
  (ca) => ({ type: 'destination', action: { type: 'presented', action: ca } }),
  addItemReducer
)
```

This handles `PresentationAction.dismiss` automatically by setting state to `null`.

## PresentationAction Wrapper

Child actions are wrapped in `PresentationAction` to enable parent observation and dismissal.

### Type Definition

```typescript
type PresentationAction<T> =
  | { type: 'presented'; action: T }
  | { type: 'dismiss' };
```

### Two Message Types

#### 1. Presented Action

Carries a child action from the child to the parent:

```typescript
const action = {
  type: 'destination',
  action: {
    type: 'presented',
    action: { type: 'saveButtonTapped' }  // Child action
  }
};
```

#### 2. Dismiss Action

Signals that the child wants to be dismissed:

```typescript
const action = {
  type: 'destination',
  action: { type: 'dismiss' }
};
```

### Creating PresentationActions

Use the helper namespace:

```typescript
// Wrap child action
PresentationAction.presented({ type: 'saveButtonTapped' })
// → { type: 'presented', action: { type: 'saveButtonTapped' } }

// Create dismiss action
PresentationAction.dismiss()
// → { type: 'dismiss' }
```

### Why PresentationAction?

1. **Parent Observation**: Parent can observe child actions before they reach the child
2. **Lifecycle Management**: Distinguish between child logic and dismissal
3. **Type Safety**: Discriminated union ensures exhaustive handling
4. **Composability**: Enables nested presentation (child presenting its own child)

### Observing Child Actions

Parent can react to child actions:

```typescript
case 'destination':
  const action = action.action;

  // Observe child's save action
  if (action.type === 'presented' && action.action.type === 'saveButtonTapped') {
    console.log('Child is saving!');
    // Maybe show a toast, update parent state, etc.
  }

  // Handle dismiss
  if (action.type === 'dismiss') {
    return [{ ...state, destination: null }, Effect.none()];
  }

  // Run child reducer
  return ifLet(...)(state, action, deps);
```

## Enum Destinations

When multiple different child features can be presented, use enum (discriminated union) state.

### Pattern

```typescript
// Multiple possible destinations
type DestinationState =
  | { type: 'addItem'; state: AddItemState }
  | { type: 'editItem'; state: EditItemState; itemId: string }
  | { type: 'filter'; state: FilterState };

interface InventoryState {
  items: Item[];
  destination: DestinationState | null;
}
```

### Presenting Different Destinations

```typescript
case 'addButtonTapped':
  return [
    {
      ...state,
      destination: { type: 'addItem', state: { name: '', quantity: 0 } }
    },
    Effect.none()
  ];

case 'editButtonTapped':
  return [
    {
      ...state,
      destination: {
        type: 'editItem',
        state: { name: action.item.name, quantity: action.item.quantity },
        itemId: action.item.id
      }
    },
    Effect.none()
  ];
```

### Routing to Child Reducers

Use `createDestinationReducer()` to route actions based on destination type:

```typescript
import { createDestinationReducer } from '@composable-svelte/core/navigation';

const destinationReducer = createDestinationReducer<
  DestinationState,
  DestinationAction,
  InventoryDeps
>({
  addItem: addItemReducer,
  editItem: editItemReducer,
  filter: filterReducer
});

// In parent reducer
case 'destination':
  if (action.action.type === 'dismiss') {
    return [{ ...state, destination: null }, Effect.none()];
  }

  return ifLet(
    (s) => s.destination,
    (s, d) => ({ ...s, destination: d }),
    (a) => a.type === 'destination' && a.action.type === 'presented'
      ? a.action.action
      : null,
    (ca) => ({ type: 'destination', action: { type: 'presented', action: ca } }),
    destinationReducer
  )(state, action, deps);
```

### Type Guards and Extraction

```typescript
import {
  isDestinationType,
  extractDestinationState
} from '@composable-svelte/core/navigation';

// Type guard
if (isDestinationType(state.destination, 'editItem')) {
  // state.destination.state is EditItemState
  // state.destination.itemId is available
  console.log('Editing item:', state.destination.itemId);
}

// Extract state for specific type
const addState = extractDestinationState(state.destination, 'addItem');
if (addState) {
  // addState is AddItemState
  console.log('Adding:', addState.name);
}
```

### DSL: createDestination()

For maximum ergonomics, use `createDestination()` to auto-generate reducers:

```typescript
import { createDestination } from '@composable-svelte/core/navigation';

// Auto-generates destination reducer + helpers
const Destination = createDestination({
  addItem: addItemReducer,
  editItem: editItemReducer,
  filter: filterReducer
});

// Use generated reducer
case 'destination':
  if (action.action.type === 'dismiss') {
    return [{ ...state, destination: null }, Effect.none()];
  }

  return ifLetPresentation(
    (s) => s.destination,
    (s, d) => ({ ...s, destination: d }),
    'destination',
    (ca) => ({ type: 'destination', action: ca }),
    Destination.reducer  // Auto-generated!
  )(state, action, deps);

// Use helpers
const initial = Destination.initial('addItem', { name: '', quantity: 0 });
const editState = Destination.extract(state.destination, 'editItem');
const isEditing = Destination.is(action, 'editItem.saveButtonTapped');
```

## Navigation Components

Composable Svelte provides components for rendering navigation:

- `Modal` - Centered dialog overlay
- `Sheet` - Slide-in panel (bottom or side)
- `Drawer` - Persistent side panel
- `Alert` - Non-dismissible dialog
- `NavigationStack` - Multi-screen linear flow
- `DestinationRouter` - Declarative routing

### Modal Example

```svelte
<script lang="ts">
  import { Modal } from '@composable-svelte/core';
  import { scopeToDestination } from '@composable-svelte/core/navigation';

  const { store } = $props();

  // Scope to optional child
  const addItemStore = scopeToDestination(
    store,
    ['destination'],
    'addItem',
    'destination'
  );
</script>

<Modal store={addItemStore}>
  {#snippet children({ store })}
    <h2>Add Item</h2>
    <input
      value={store.state.name}
      oninput={(e) => store.dispatch({
        type: 'nameChanged',
        name: e.currentTarget.value
      })}
    />
    <button onclick={() => store.dispatch({ type: 'saveButtonTapped' })}>
      Save
    </button>
    <button onclick={() => store.dispatch({ type: 'cancelButtonTapped' })}>
      Cancel
    </button>
  {/snippet}
</Modal>
```

### Sheet Example

```svelte
<script lang="ts">
  import { Sheet } from '@composable-svelte/core';

  const { store } = $props();
  const filterStore = scopeToDestination(store, ['destination'], 'filter', 'destination');
</script>

<Sheet store={filterStore} side="bottom">
  {#snippet children({ store })}
    <h2>Filter Items</h2>
    <!-- Filter UI -->
  {/snippet}
</Sheet>
```

### DestinationRouter

For enum destinations, use `DestinationRouter` to declaratively render:

```svelte
<script lang="ts">
  import { DestinationRouter } from '@composable-svelte/core';
  import AddItemModal from './AddItemModal.svelte';
  import EditItemModal from './EditItemModal.svelte';
  import FilterSheet from './FilterSheet.svelte';

  const { store } = $props();
</script>

<DestinationRouter
  {store}
  destinationPath={['destination']}
  actionField="destination"
>
  {#snippet addItem({ store })}
    <AddItemModal {store} />
  {/snippet}

  {#snippet editItem({ store })}
    <EditItemModal {store} />
  {/snippet}

  {#snippet filter({ store })}
    <FilterSheet {store} />
  {/snippet}
</DestinationRouter>
```

### scopeToDestination

Creates a scoped store for a child feature:

```typescript
import { scopeToDestination } from '@composable-svelte/core/navigation';

// Scope to optional child
const childStore = scopeToDestination(
  parentStore,
  ['destination'],     // Path to destination field
  'addItem',           // Case type (for enum destinations)
  'destination'        // Action field name
);

// childStore.state is AddItemState (or null if not presented)
// childStore.dispatch sends actions wrapped in PresentationAction
```

## Stack Navigation

Stack navigation manages multi-screen linear flows (wizards, drill-down navigation).

### State Pattern

```typescript
interface WizardState {
  stack: readonly StepState[];
}

interface StepState {
  step: number;
  data: Record<string, any>;
}
```

### Stack Actions

```typescript
import { StackAction } from '@composable-svelte/core/navigation';

type WizardAction =
  | { type: 'nextButtonTapped' }
  | { type: 'backButtonTapped' }
  | { type: 'stack'; action: StackAction<StepAction> };
```

### Stack Operations

```typescript
import {
  push,
  pop,
  popToRoot,
  setPath,
  handleStackAction
} from '@composable-svelte/core/navigation';

const wizardReducer: Reducer<WizardState, WizardAction, WizardDeps> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'nextButtonTapped': {
      const nextStep = { step: state.stack.length + 1, data: {} };
      const [newStack] = push(state.stack, nextStep);
      return [{ ...state, stack: newStack }, Effect.none()];
    }

    case 'backButtonTapped': {
      const [newStack] = pop(state.stack);
      return [{ ...state, stack: newStack }, Effect.none()];
    }

    case 'stack':
      return handleStackAction(
        state,
        action.action,
        deps,
        stepReducer,
        (s) => s.stack,
        (s, stack) => ({ ...s, stack })
      );

    default:
      return [state, Effect.none()];
  }
};
```

### NavigationStack Component

```svelte
<script lang="ts">
  import { NavigationStack } from '@composable-svelte/core';

  const { store } = $props();
  const stackStore = scopeToDestination(store, ['destination'], 'wizard', 'destination');
</script>

<NavigationStack
  store={stackStore}
  stack={stackStore?.state?.stack ?? []}
  onBack={() => store.dispatch({ type: 'backButtonTapped' })}
>
  {#snippet children({ store, index })}
    {#if store.state.step === 1}
      <Step1 {store} />
    {:else if store.state.step === 2}
      <Step2 {store} />
    {:else}
      <Step3 {store} />
    {/if}
  {/snippet}
</NavigationStack>
```

### Stack Helpers

```typescript
import {
  topScreen,
  rootScreen,
  canGoBack,
  stackDepth
} from '@composable-svelte/core/navigation';

// Get current screen
const current = topScreen(state.stack);  // Last screen

// Get root screen
const root = rootScreen(state.stack);  // First screen

// Check if can go back
if (canGoBack(state.stack)) {
  // Show back button
}

// Get depth
const depth = stackDepth(state.stack);  // Number of screens
```

## Dismiss Dependency

Child features can dismiss themselves without knowing about their parent.

### The Problem

```typescript
// ❌ Child knows about parent structure
case 'cancelButtonTapped':
  return [
    state,
    Effect.run((dispatch) => {
      dispatch({ type: 'destination', action: { type: 'dismiss' } });
    })
  ];
```

The child shouldn't know it's being presented in a `destination` field.

### The Solution: Dismiss Dependency

```typescript
// ✅ Child requests dismissal via dependency
interface AddItemDeps {
  dismiss: DismissDependency;
  api: APIClient;
}

const addItemReducer: Reducer<AddItemState, AddItemAction, AddItemDeps> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'cancelButtonTapped':
      return [state, deps.dismiss()];

    case 'saveButtonTapped':
      return [
        state,
        Effect.batch(
          Effect.run(async (dispatch) => {
            await deps.api.saveItem(state);
            dispatch({ type: 'saved' });
          }),
          deps.dismiss()  // Dismiss after save
        )
      ];
  }
};
```

### Creating Dismiss Dependency

```typescript
import {
  createDismissDependency,
  dismissDependency
} from '@composable-svelte/core/navigation';

// In parent reducer when presenting child
case 'addButtonTapped': {
  const childDeps: AddItemDeps = {
    ...deps,
    dismiss: dismissDependency(
      (action) => store.dispatch(action),
      'destination'
    )
  };

  // Store childDeps somewhere accessible to child
  // (Usually via store creation or context)

  return [
    { ...state, destination: { name: '', quantity: 0 } },
    Effect.none()
  ];
}
```

### Dismiss with Cleanup

```typescript
import { createDismissDependencyWithCleanup } from '@composable-svelte/core/navigation';

const dismiss = createDismissDependencyWithCleanup(
  (action) => store.dispatch(action),
  'destination',
  async () => {
    // Cleanup before dismissing
    await analytics.track('modal_dismissed');
    localStorage.setItem('lastDismissed', Date.now().toString());
  }
);
```

## Deep Linking and URL Sync

Initialize application state from URL on page load.

### Creating Initial State from URL

```typescript
import { createInitialStateFromURL } from '@composable-svelte/core/routing';

const defaultState: AppState = {
  destination: null,
  items: []
};

// Parse URL to create initial state
const initialState = createInitialStateFromURL(
  defaultState,
  (path) => parseDestination(path),
  (state, destination) => ({ ...state, destination })
);

// Create store with URL-initialized state
const store = createStore({
  initialState,
  reducer: appReducer,
  dependencies: {}
});
```

### URL Pattern Matching

```typescript
import { parseDestination, createParserConfig } from '@composable-svelte/core/routing';

const parserConfig = createParserConfig<DestinationState>({
  '/item/:id': (params) => ({
    type: 'detailItem',
    state: { itemId: params.id }
  }),
  '/item/:id/edit': (params) => ({
    type: 'editItem',
    state: { itemId: params.id, name: '', quantity: 0 },
    itemId: params.id
  }),
  '/add': () => ({
    type: 'addItem',
    state: { name: '', quantity: 0 }
  })
});

const destination = parseDestination(window.location.pathname, parserConfig);
```

### Query Parameters

```typescript
import { parseQueryParams } from '@composable-svelte/core/routing';

const initialState = createInitialStateFromURL(
  defaultState,
  (path) => parseDestination(path, parserConfig),
  (state, destination) => ({ ...state, destination }),
  (search) => parseQueryParams(search),
  (state, query) => ({
    ...state,
    searchText: query.search || '',
    page: query.page ? parseInt(query.page) : 1
  })
);
```

### URL Examples

```typescript
// URL: /inventory
// → destination: null

// URL: /inventory/item/123
// → destination: { type: 'detailItem', state: { itemId: '123' } }

// URL: /inventory/item/456/edit
// → destination: { type: 'editItem', state: { ... }, itemId: '456' }

// URL: /inventory?search=laptop&page=2
// → destination: null, searchText: 'laptop', page: 2
```

## Testing Navigation

Use `TestStore` to test navigation flows.

### Testing Presentation

```typescript
import { createTestStore } from '@composable-svelte/core';

describe('Inventory Navigation', () => {
  it('should present add item modal', async () => {
    const store = createTestStore({
      initialState: { items: [], destination: null },
      reducer: inventoryReducer,
      dependencies: {}
    });

    await store.send({ type: 'addButtonTapped' }, (state) => {
      expect(state.destination).not.toBeNull();
      expect(state.destination?.type).toBe('addItem');
    });
  });
});
```

### Testing Dismissal

```typescript
it('should dismiss modal on cancel', async () => {
  const store = createTestStore({
    initialState: {
      items: [],
      destination: { type: 'addItem', state: { name: '', quantity: 0 } }
    },
    reducer: inventoryReducer,
    dependencies: {}
  });

  await store.send(
    {
      type: 'destination',
      action: { type: 'dismiss' }
    },
    (state) => {
      expect(state.destination).toBeNull();
    }
  );
});
```

### Testing Child Actions

```typescript
it('should update child state', async () => {
  const store = createTestStore({
    initialState: {
      items: [],
      destination: { type: 'addItem', state: { name: '', quantity: 0 } }
    },
    reducer: inventoryReducer,
    dependencies: {}
  });

  await store.send(
    {
      type: 'destination',
      action: {
        type: 'presented',
        action: { type: 'nameChanged', name: 'Laptop' }
      }
    },
    (state) => {
      expect(state.destination?.state.name).toBe('Laptop');
    }
  );
});
```

### Testing Nested Navigation

```typescript
it('should handle nested presentation', async () => {
  const store = createTestStore({
    initialState: {
      destination: {
        type: 'addItem',
        state: {
          name: '',
          quantity: 0,
          destination: null  // Child can have its own destination
        }
      }
    },
    reducer: inventoryReducer,
    dependencies: {}
  });

  await store.send(
    {
      type: 'destination',
      action: {
        type: 'presented',
        action: { type: 'showConfirmation' }
      }
    },
    (state) => {
      const addItemState = state.destination?.state;
      expect(addItemState?.destination).not.toBeNull();
    }
  );
});
```

### Testing Stack Navigation

```typescript
it('should push and pop stack', async () => {
  const store = createTestStore({
    initialState: {
      destination: {
        type: 'wizard',
        state: {
          stack: [{ step: 1, data: {} }]
        }
      }
    },
    reducer: wizardReducer,
    dependencies: {}
  });

  // Push
  await store.send({ type: 'nextButtonTapped' }, (state) => {
    expect(state.destination?.state.stack.length).toBe(2);
  });

  // Pop
  await store.send({ type: 'backButtonTapped' }, (state) => {
    expect(state.destination?.state.stack.length).toBe(1);
  });
});
```

## Best Practices

### 1. Keep State Normalized

```typescript
// ❌ BAD: Duplicated data
interface State {
  destination: {
    type: 'editItem';
    state: { item: Item };  // Full item copy
  } | null;
  items: Item[];
}

// ✅ GOOD: Reference by ID
interface State {
  destination: {
    type: 'editItem';
    state: { itemId: string; name: string; quantity: number };
    itemId: string;
  } | null;
  items: Item[];
}
```

### 2. Use Type Guards

```typescript
// ✅ Type-safe destination checking
if (isDestinationType(state.destination, 'editItem')) {
  // TypeScript knows: state.destination.state is EditItemState
  console.log('Editing:', state.destination.itemId);
}
```

### 3. Handle All Presentation States

```typescript
// ✅ Handle dismiss explicitly
case 'destination':
  if (action.action.type === 'dismiss') {
    return [{ ...state, destination: null }, Effect.none()];
  }

  // Handle presented actions
  return ifLet(...)(state, action, deps);
```

### 4. Inject Dismiss Dependency

```typescript
// ✅ Child can dismiss itself
const childDeps = {
  ...deps,
  dismiss: dismissDependency(dispatch, 'destination')
};
```

### 5. Test Navigation Flows

```typescript
// ✅ Test complete flow
it('should complete add item flow', async () => {
  const store = createTestStore({ /* ... */ });

  // Present
  await store.send({ type: 'addButtonTapped' });

  // Enter data
  await store.send({
    type: 'destination',
    action: { type: 'presented', action: { type: 'nameChanged', name: 'Laptop' } }
  });

  // Save and dismiss
  await store.send({
    type: 'destination',
    action: { type: 'presented', action: { type: 'saveButtonTapped' } }
  });

  // Verify dismissed
  await store.receive({ type: 'destination', action: { type: 'dismiss' } }, (state) => {
    expect(state.destination).toBeNull();
    expect(state.items).toContainEqual(expect.objectContaining({ name: 'Laptop' }));
  });
});
```

## Common Patterns

### Parent Observing Child Actions

```typescript
case 'destination':
  const presentationAction = action.action;

  // Observe child's save action
  if (presentationAction.type === 'presented') {
    const childAction = presentationAction.action;

    if (childAction.type === 'saveButtonTapped') {
      // React to child saving
      const addState = extractDestinationState(state.destination, 'addItem');
      if (addState) {
        console.log('Saving item:', addState.name);
      }
    }
  }

  // Handle dismiss
  if (presentationAction.type === 'dismiss') {
    return [{ ...state, destination: null }, Effect.none()];
  }

  // Run child reducer
  return ifLet(...)(state, action, deps);
```

### Multiple Modals

```typescript
interface State {
  addItemModal: AddItemState | null;
  filterSheet: FilterState | null;
  confirmAlert: ConfirmState | null;
}

type Action =
  | { type: 'addItemModal'; action: PresentationAction<AddItemAction> }
  | { type: 'filterSheet'; action: PresentationAction<FilterAction> }
  | { type: 'confirmAlert'; action: PresentationAction<ConfirmAction> };
```

### Conditional Presentation

```typescript
case 'editButtonTapped':
  // Only present if item exists
  const item = state.items.find(i => i.id === action.id);
  if (!item) {
    return [state, Effect.none()];
  }

  return [
    {
      ...state,
      destination: {
        type: 'editItem',
        state: { name: item.name, quantity: item.quantity },
        itemId: item.id
      }
    },
    Effect.none()
  ];
```

### Nested Presentation

```typescript
// Parent presents child, child presents grandchild
interface ParentState {
  destination: ChildState | null;
}

interface ChildState {
  data: Data;
  destination: GrandchildState | null;  // Nested!
}

// Components nest naturally
<Modal store={childStore}>
  {#snippet children({ store })}
    <ChildComponent {store} />

    <!-- Child can present its own modal -->
    <Modal store={scopeToDestination(store, ['destination'], 'confirm', 'destination')}>
      {#snippet children({ store })}
        <GrandchildComponent {store} />
      {/snippet}
    </Modal>
  {/snippet}
</Modal>
```

### Wizard with Conditional Steps

```typescript
case 'nextButtonTapped': {
  const current = topScreen(state.stack);
  if (!current) return [state, Effect.none()];

  // Determine next step based on current data
  const nextStepType = current.data.userType === 'business'
    ? 'businessDetails'
    : 'personalDetails';

  const nextStep = { step: current.step + 1, type: nextStepType, data: {} };
  const [newStack] = push(state.stack, nextStep);

  return [{ ...state, stack: newStack }, Effect.none()];
}
```

### URL Sync with Custom Parser

```typescript
import { match } from 'path-to-regexp';

const routes = {
  detail: match<{ id: string }>('/item/:id'),
  edit: match<{ id: string }>('/item/:id/edit'),
  add: match('/add')
};

function parseDestination(path: string): DestinationState | null {
  const detailMatch = routes.detail(path);
  if (detailMatch) {
    return {
      type: 'detailItem',
      state: { itemId: detailMatch.params.id }
    };
  }

  const editMatch = routes.edit(path);
  if (editMatch) {
    return {
      type: 'editItem',
      state: { itemId: editMatch.params.id, name: '', quantity: 0 },
      itemId: editMatch.params.id
    };
  }

  const addMatch = routes.add(path);
  if (addMatch) {
    return {
      type: 'addItem',
      state: { name: '', quantity: 0 }
    };
  }

  return null;
}
```

## Next Steps

- **[Animation Integration](./animation.md)** - Animated presentations with lifecycle
- **[Store and Reducers](../core-concepts/store-and-reducers.md)** - Core state management
- **[Testing](../core-concepts/testing.md)** - Comprehensive testing guide
- **[API Reference](../api/navigation.md)** - Complete navigation API

## Related Documentation

- [Getting Started](../getting-started.md) - Basic setup
- [Effects](../core-concepts/effects.md) - Side effect system
- [Composition](../core-concepts/composition.md) - Reducer composition
