# Scope Helpers

Scope helpers enable reactive, type-safe component integration by creating derived stores that focus on specific child features. These helpers bridge the gap between parent stores and child components in Svelte 5.

## Table of Contents

- [Overview](#overview)
- [Core Concepts](#core-concepts)
- [API Reference](#api-reference)
  - [scopeToDestination()](#scopetodestination)
  - [scopeToOptional()](#scopetooptional)
  - [ScopedDestinationStore](#scopeddestinationstore)
- [Usage in Svelte Components](#usage-in-svelte-components)
- [Integration Patterns](#integration-patterns)
- [Best Practices](#best-practices)
- [Advanced Topics](#advanced-topics)

## Overview

### The Problem

In Svelte components, you often need to render child features based on parent state. The challenge is:

1. **Reactive Derivation**: Components need to reactively derive child state from parent state
2. **Action Wrapping**: Child actions must be wrapped in the correct parent action format
3. **Type Safety**: The scoped store must be correctly typed for the child component
4. **Null Handling**: Components need to know when a child feature is presented vs. dismissed

Manual approach is verbose and error-prone:

```svelte
<script>
const childState = $derived(
  store.state.destination?.type === 'addItem'
    ? store.state.destination.state
    : null
);

function dispatchChildAction(action) {
  store.dispatch({
    type: 'destination',
    action: {
      type: 'presented',
      action: {
        type: 'addItem',
        action
      }
    }
  });
}
</script>

{#if childState}
  <Modal state={childState} dispatch={dispatchChildAction} />
{/if}
```

### The Solution

Scope helpers automate this with a clean, type-safe API:

```svelte
<script>
const addItemStore = $derived(
  scopeToDestination(store, ['destination'], 'addItem', 'destination')
);
</script>

{#if addItemStore.state}
  <Modal state={addItemStore.state} dispatch={addItemStore.dispatch} />
{/if}
```

Benefits:
- Reactive derivation with `$derived`
- Automatic action wrapping
- Full type safety
- Clean component code
- Null-safe by design

## Core Concepts

### Scoped Stores

A **scoped store** is a lightweight object that provides:

1. **state**: The child's state (or `null` if not presented)
2. **dispatch**: A function that wraps and forwards actions to the parent
3. **dismiss**: A convenience method for dismissing the child

```typescript
interface ScopedDestinationStore<State, Action> {
  readonly state: State | null;
  dispatch(action: Action): void;
  dismiss(): void;
}
```

Scoped stores are **derived** - they don't hold state themselves, they extract it from the parent store.

### Reactive Derivation

In Svelte 5, scoped stores are created with `$derived`:

```svelte
<script>
const addItemStore = $derived(
  scopeToDestination(store, ['destination'], 'addItem', 'destination')
);
</script>
```

This ensures the scoped store updates reactively whenever the parent store changes.

### Action Wrapping

The scoped store's `dispatch()` function automatically wraps actions:

```typescript
// Component calls:
scopedStore.dispatch({ type: 'saveButtonTapped' });

// Scoped store transforms to:
parentStore.dispatch({
  type: 'destination',                    // Parent action field
  action: {
    type: 'presented',                    // PresentationAction wrapper
    action: {
      type: 'addItem',                    // Case type (for enum destinations)
      action: { type: 'saveButtonTapped' }  // Actual child action
    }
  }
});
```

This is transparent to the child component - it just dispatches its own actions.

### Destination vs Optional

Two scoping helpers for different use cases:

**scopeToDestination()** - For enum-based destinations:
- Filters by case type (`addItem`, `editItem`, etc.)
- Returns `null` if destination doesn't match the case type
- Wraps actions with case type

**scopeToOptional()** - For simple optional children:
- No case type filtering
- Returns child state if non-null
- Simpler API (one less parameter)

## API Reference

### scopeToDestination()

Creates a scoped store for a specific destination case type.

**Signature:**
```typescript
function scopeToDestination<DestState, DestAction, ParentState = any, ParentAction = any>(
  parentStore: Store<ParentState, ParentAction>,
  destinationPath: (string | number)[],
  caseType: string,
  actionField: string
): ScopedDestinationStore<DestState, DestAction>
```

**Parameters:**
- `parentStore` - The parent store containing destination state
- `destinationPath` - Path to destination field in parent state (e.g., `['destination']`)
- `caseType` - The destination case type to filter (e.g., `'addItem'`)
- `actionField` - The parent action field that wraps destination actions (e.g., `'destination'`)

**Returns:**
A scoped store with:
- `state`: The destination's child state (or `null` if not presented or wrong case)
- `dispatch(action)`: Dispatches child action wrapped in parent action format
- `dismiss()`: Dispatches dismiss action

**Example:**
```typescript
interface ParentState {
  items: Item[];
  destination: Destination | null;
}

type Destination =
  | { type: 'addItem'; state: AddItemState }
  | { type: 'editItem'; state: EditItemState };

type ParentAction =
  | { type: 'addButtonTapped' }
  | { type: 'destination'; action: PresentationAction<DestinationAction> };

// In component
const addItemStore = $derived(
  scopeToDestination<AddItemState, AddItemAction>(
    parentStore,
    ['destination'],   // Path to destination field
    'addItem',         // Case type to filter
    'destination'      // Parent action field
  )
);

// Use in template
{#if addItemStore.state}
  <AddItemModal
    state={addItemStore.state}
    dispatch={addItemStore.dispatch}
  />
{/if}
```

**Behavior:**

Returns `null` state when:
- Parent state has no destination (`state.destination === null`)
- Destination exists but case type doesn't match (`state.destination.type !== 'addItem'`)

Returns non-null state when:
- Destination exists AND case type matches

**Nested Paths:**
```typescript
interface AppState {
  navigation: {
    modal: Destination | null;
  };
}

// Access nested destination
const scopedStore = scopeToDestination(
  store,
  ['navigation', 'modal'],  // Nested path
  'addItem',
  'modal'
);
```

**Multiple Destinations:**
```typescript
// Create separate scoped stores for each case
const addItemStore = $derived(
  scopeToDestination(store, ['destination'], 'addItem', 'destination')
);

const editItemStore = $derived(
  scopeToDestination(store, ['destination'], 'editItem', 'destination')
);

// Only one will have non-null state at a time
{#if addItemStore.state}
  <AddItemModal {...addItemStore} />
{:else if editItemStore.state}
  <EditItemModal {...editItemStore} />
{/if}
```

### scopeToOptional()

Creates a scoped store for a simple optional child (no case type filtering).

**Signature:**
```typescript
function scopeToOptional<ChildState, ChildAction, ParentState = any, ParentAction = any>(
  parentStore: Store<ParentState, ParentAction>,
  statePath: (string | number)[],
  actionField: string
): ScopedDestinationStore<ChildState, ChildAction>
```

**Parameters:**
- `parentStore` - The parent store
- `statePath` - Path to optional child state in parent state
- `actionField` - The parent action field that wraps child actions

**Returns:**
A scoped store with:
- `state`: The child state (or `null` if not presented)
- `dispatch(action)`: Dispatches child action wrapped in parent action format
- `dismiss()`: Dispatches dismiss action

**Example:**
```typescript
interface ParentState {
  items: Item[];
  modal: AddItemState | null;  // Simple optional child (not an enum)
}

type ParentAction =
  | { type: 'showModal' }
  | { type: 'modal'; action: PresentationAction<AddItemAction> };

// In component
const modalStore = $derived(
  scopeToOptional<AddItemState, AddItemAction>(
    parentStore,
    ['modal'],    // Path to optional child
    'modal'       // Parent action field
  )
);

{#if modalStore.state}
  <AddItemModal
    state={modalStore.state}
    dispatch={modalStore.dispatch}
  />
{/if}
```

**When to Use:**

Use `scopeToOptional()` when:
- Child state is a simple optional field (not a discriminated union)
- No need to filter by case type
- Want simpler API (one less parameter)

Use `scopeToDestination()` when:
- Child state is a discriminated union (enum destination)
- Need to filter by case type
- Multiple destination types share the same parent field

**Comparison:**
```typescript
// scopeToDestination (4 params, case filtering)
scopeToDestination(store, ['destination'], 'addItem', 'destination');

// scopeToOptional (3 params, no case filtering)
scopeToOptional(store, ['modal'], 'modal');
```

### ScopedDestinationStore

The interface returned by both scoping helpers.

**Type:**
```typescript
interface ScopedDestinationStore<State, Action> {
  readonly state: State | null;
  dispatch(action: Action): void;
  dismiss(): void;
}
```

**Properties:**

**state**
- The child's state, or `null` if not presented
- Type: `State | null`
- Reactive in Svelte 5 when used with `$derived`

**Example:**
```typescript
const scopedStore = $derived(scopeToDestination(...));

// Access state
if (scopedStore.state) {
  console.log('Name:', scopedStore.state.name);
  console.log('Quantity:', scopedStore.state.quantity);
}
```

**dispatch(action)**
- Dispatches a child action to the parent
- Automatically wraps action in parent action format
- Parameters:
  - `action` - The child action to dispatch
- Returns: `void`

**Example:**
```typescript
const scopedStore = $derived(scopeToDestination(...));

// Component dispatches child action
scopedStore.dispatch({ type: 'nameChanged', value: 'Apple' });

// Automatically transformed to:
// {
//   type: 'destination',
//   action: {
//     type: 'presented',
//     action: {
//       type: 'addItem',
//       action: { type: 'nameChanged', value: 'Apple' }
//     }
//   }
// }
```

**dismiss()**
- Dispatches a dismiss action to the parent
- Convenience method equivalent to dispatching `PresentationAction.dismiss`
- Parameters: none
- Returns: `void`

**Example:**
```typescript
const scopedStore = $derived(scopeToDestination(...));

// Component dismisses itself
scopedStore.dismiss();

// Transformed to:
// {
//   type: 'destination',
//   action: { type: 'dismiss' }
// }
```

## Usage in Svelte Components

### Basic Modal Pattern

```svelte
<!-- ParentComponent.svelte -->
<script lang="ts">
import { scopeToDestination } from '@composable-svelte/core';
import AddItemModal from './AddItemModal.svelte';

const { store } = $props<{ store: Store<ParentState, ParentAction> }>();

const addItemStore = $derived(
  scopeToDestination<AddItemState, AddItemAction>(
    store,
    ['destination'],
    'addItem',
    'destination'
  )
);
</script>

{#if addItemStore.state}
  <AddItemModal
    state={addItemStore.state}
    dispatch={addItemStore.dispatch}
    dismiss={addItemStore.dismiss}
  />
{/if}

<button onclick={() => store.dispatch({ type: 'addButtonTapped' })}>
  Add Item
</button>
```

```svelte
<!-- AddItemModal.svelte -->
<script lang="ts">
const {
  state,
  dispatch,
  dismiss
} = $props<{
  state: AddItemState;
  dispatch: (action: AddItemAction) => void;
  dismiss: () => void;
}>();
</script>

<dialog open>
  <h2>Add Item</h2>

  <input
    value={state.name}
    oninput={(e) => dispatch({ type: 'nameChanged', value: e.currentTarget.value })}
  />

  <input
    type="number"
    value={state.quantity}
    oninput={(e) => dispatch({ type: 'quantityChanged', value: Number(e.currentTarget.value) })}
  />

  <button onclick={() => dispatch({ type: 'saveButtonTapped' })}>
    Save
  </button>

  <button onclick={dismiss}>
    Cancel
  </button>
</dialog>
```

### Multiple Destinations

```svelte
<script lang="ts">
const addItemStore = $derived(
  scopeToDestination(store, ['destination'], 'addItem', 'destination')
);

const editItemStore = $derived(
  scopeToDestination(store, ['destination'], 'editItem', 'destination')
);

const deleteAlertStore = $derived(
  scopeToDestination(store, ['destination'], 'deleteAlert', 'destination')
);
</script>

{#if addItemStore.state}
  <AddItemModal {...addItemStore} />
{:else if editItemStore.state}
  <EditItemModal {...editItemStore} />
{:else if deleteAlertStore.state}
  <DeleteAlert {...deleteAlertStore} />
{/if}
```

### Nested Destinations

```svelte
<script lang="ts">
// Parent has destination
const settingsStore = $derived(
  scopeToDestination(store, ['destination'], 'settings', 'destination')
);

// Settings has its own destination
const accountStore = $derived(
  settingsStore.state
    ? scopeToDestination(
        createStore({
          initialState: settingsStore.state,
          reducer: settingsReducer
        }),
        ['destination'],
        'account',
        'destination'
      )
    : null
);
</script>

{#if settingsStore.state}
  <SettingsModal {...settingsStore}>
    {#if accountStore?.state}
      <AccountModal {...accountStore} />
    {/if}
  </SettingsModal>
{/if}
```

### With Navigation Components

Scope helpers integrate seamlessly with navigation components:

```svelte
<script lang="ts">
import { Modal } from '@composable-svelte/core';

const addItemStore = $derived(
  scopeToDestination(store, ['destination'], 'addItem', 'destination')
);
</script>

<Modal presentation={addItemStore}>
  {#if addItemStore.state}
    <AddItemForm
      state={addItemStore.state}
      dispatch={addItemStore.dispatch}
    />
  {/if}
</Modal>
```

### Optional Children

```svelte
<script lang="ts">
const modalStore = $derived(
  scopeToOptional(store, ['modal'], 'modal')
);
</script>

{#if modalStore.state}
  <SimpleModal
    message={modalStore.state.message}
    onconfirm={() => modalStore.dispatch({ type: 'confirmed' })}
    oncancel={modalStore.dismiss}
  />
{/if}
```

## Integration Patterns

### Pattern 1: Component Props

Pass scoped store as props to child components:

```svelte
<!-- Parent.svelte -->
<script lang="ts">
const addItemStore = $derived(scopeToDestination(...));
</script>

{#if addItemStore.state}
  <AddItemModal scopedStore={addItemStore} />
{/if}
```

```svelte
<!-- AddItemModal.svelte -->
<script lang="ts">
const { scopedStore } = $props<{
  scopedStore: ScopedDestinationStore<AddItemState, AddItemAction>;
}>();
</script>

<input
  value={scopedStore.state!.name}
  oninput={(e) => scopedStore.dispatch({ type: 'nameChanged', value: e.target.value })}
/>
```

### Pattern 2: Destructured Props

Destructure scoped store for cleaner syntax:

```svelte
<!-- Parent.svelte -->
<script lang="ts">
const addItemStore = $derived(scopeToDestination(...));
</script>

{#if addItemStore.state}
  <AddItemModal {...addItemStore} />
{/if}
```

```svelte
<!-- AddItemModal.svelte -->
<script lang="ts">
const {
  state,
  dispatch,
  dismiss
} = $props<ScopedDestinationStore<AddItemState, AddItemAction>>();
</script>

<input
  value={state!.name}
  oninput={(e) => dispatch({ type: 'nameChanged', value: e.target.value })}
/>
```

### Pattern 3: Navigation Component Integration

Combine with navigation components for animations:

```svelte
<script lang="ts">
import { Modal } from '@composable-svelte/core';

const addItemStore = $derived(
  scopeToDestination(store, ['destination'], 'addItem', 'destination')
);

// Derive presentation state for animations
const presentation = $derived(
  store.state.presentation?.content?.type === 'addItem'
    ? store.state.presentation
    : { status: 'idle' as const }
);
</script>

<Modal presentation={presentation}>
  {#if addItemStore.state}
    <AddItemForm
      state={addItemStore.state}
      dispatch={addItemStore.dispatch}
    />
  {/if}
</Modal>
```

### Pattern 4: Multiple Scoped Stores

Manage multiple scoped stores for complex UIs:

```svelte
<script lang="ts">
// Modal destination
const modalStore = $derived(
  scopeToDestination(store, ['modal'], 'addItem', 'modal')
);

// Alert destination
const alertStore = $derived(
  scopeToDestination(store, ['alert'], 'error', 'alert')
);

// Sheet destination
const sheetStore = $derived(
  scopeToDestination(store, ['sheet'], 'settings', 'sheet')
);
</script>

<!-- All can be shown simultaneously -->
<Modal presentation={modalStore}>
  {#if modalStore.state}
    <AddItemForm {...modalStore} />
  {/if}
</Modal>

<Alert presentation={alertStore}>
  {#if alertStore.state}
    <ErrorMessage {...alertStore} />
  {/if}
</Alert>

<Sheet presentation={sheetStore}>
  {#if sheetStore.state}
    <SettingsPanel {...sheetStore} />
  {/if}
</Sheet>
```

### Pattern 5: Conditional Scoping

Scope to different destinations based on conditions:

```svelte
<script lang="ts">
const isEditMode = $derived(store.state.selectedId !== null);

const scopedStore = $derived(
  isEditMode
    ? scopeToDestination(store, ['destination'], 'editItem', 'destination')
    : scopeToDestination(store, ['destination'], 'addItem', 'destination')
);
</script>

{#if scopedStore.state}
  {#if isEditMode}
    <EditItemModal {...scopedStore} />
  {:else}
    <AddItemModal {...scopedStore} />
  {/if}
{/if}
```

## Best Practices

### 1. Always Use $derived

Create scoped stores with `$derived` for reactivity:

```svelte
<!-- ✓ Good: Reactive -->
<script lang="ts">
const scopedStore = $derived(scopeToDestination(...));
</script>

<!-- ✗ Bad: Not reactive -->
<script lang="ts">
const scopedStore = scopeToDestination(...);
</script>
```

### 2. Type Your Scoped Stores

Provide explicit type parameters:

```svelte
<!-- ✓ Good: Explicit types -->
<script lang="ts">
const addItemStore = $derived(
  scopeToDestination<AddItemState, AddItemAction>(
    store,
    ['destination'],
    'addItem',
    'destination'
  )
);
</script>

<!-- ✗ Bad: Implicit any -->
<script lang="ts">
const addItemStore = $derived(
  scopeToDestination(store, ['destination'], 'addItem', 'destination')
);
</script>
```

### 3. Check State Before Rendering

Always check `scopedStore.state` before rendering:

```svelte
<!-- ✓ Good: Null check -->
{#if scopedStore.state}
  <Modal state={scopedStore.state} {...scopedStore} />
{/if}

<!-- ✗ Bad: No null check (runtime error!) -->
<Modal state={scopedStore.state!} {...scopedStore} />
```

### 4. Use Destructuring for Cleaner Components

Destructure scoped store in child components:

```svelte
<!-- ✓ Good: Destructured -->
<script lang="ts">
const { state, dispatch, dismiss } = $props<ScopedDestinationStore<...>>();
</script>

<input value={state!.name} oninput={(e) => dispatch(...)} />

<!-- ✗ Verbose: Props drilling -->
<script lang="ts">
const { scopedStore } = $props<{ scopedStore: ScopedDestinationStore<...> }>();
</script>

<input
  value={scopedStore.state!.name}
  oninput={(e) => scopedStore.dispatch(...)}
/>
```

### 5. Co-locate Scoped Stores

Create scoped stores close to where they're used:

```svelte
<!-- ✓ Good: Co-located -->
<script lang="ts">
const addItemStore = $derived(scopeToDestination(...));
</script>

{#if addItemStore.state}
  <AddItemModal {...addItemStore} />
{/if}

<!-- ✗ Bad: Distant declaration -->
<script lang="ts">
// Many lines of code...
const addItemStore = $derived(scopeToDestination(...));
// Many more lines...
</script>

<!-- Much later in template... -->
{#if addItemStore.state}
  <AddItemModal {...addItemStore} />
{/if}
```

### 6. Use scopeToOptional for Simple Cases

Don't over-engineer with `scopeToDestination` when child is not an enum:

```svelte
<!-- ✓ Good: Simple optional -->
<script lang="ts">
interface ParentState {
  alert: AlertState | null;  // Simple optional
}

const alertStore = $derived(scopeToOptional(store, ['alert'], 'alert'));
</script>

<!-- ✗ Over-engineered: Using destination for simple optional -->
<script lang="ts">
interface ParentState {
  alert: AlertState | null;
}

const alertStore = $derived(
  scopeToDestination(store, ['alert'], 'alert', 'alert')  // Unnecessary!
);
</script>
```

### 7. Document Parent Action Field

Comment the parent action field for clarity:

```svelte
<script lang="ts">
// Parent action: { type: 'destination', action: PresentationAction<...> }
const addItemStore = $derived(
  scopeToDestination(
    store,
    ['destination'],
    'addItem',
    'destination'  // Parent action field
  )
);
</script>
```

## Advanced Topics

### Custom Scoping Helpers

Build custom helpers on top of the base API:

```typescript
// Helper: Auto-derive case type from state
function autoScopeToDestination<S, A>(
  store: Store<ParentState, ParentAction>,
  caseType: keyof Destination
): ScopedDestinationStore<S, A> {
  return scopeToDestination<S, A>(
    store,
    ['destination'],  // Always use 'destination' field
    caseType as string,
    'destination'     // Always use 'destination' action field
  );
}

// Usage
const addItemStore = $derived(autoScopeToDestination('addItem'));
```

### Typed Scope Factory

Create factory functions for type safety:

```typescript
// Define all destination types
type DestinationMap = {
  addItem: { state: AddItemState; action: AddItemAction };
  editItem: { state: EditItemState; action: EditItemAction };
  deleteAlert: { state: DeleteAlertState; action: DeleteAlertAction };
};

// Factory function
function scopeTo<K extends keyof DestinationMap>(
  store: Store<ParentState, ParentAction>,
  caseType: K
): ScopedDestinationStore<
  DestinationMap[K]['state'],
  DestinationMap[K]['action']
> {
  return scopeToDestination(
    store,
    ['destination'],
    caseType as string,
    'destination'
  );
}

// Usage (fully typed!)
const addItemStore = $derived(scopeTo(store, 'addItem'));
// Type: ScopedDestinationStore<AddItemState, AddItemAction>
```

### Reactive Presentation State

Combine scoped stores with presentation state for animations:

```svelte
<script lang="ts">
const addItemStore = $derived(
  scopeToDestination(store, ['destination'], 'addItem', 'destination')
);

// Derive presentation state separately
const presentation = $derived(
  store.state.presentation?.content?.type === 'addItem'
    ? store.state.presentation
    : { status: 'idle' as const }
);
</script>

<Modal presentation={presentation}>
  {#if addItemStore.state}
    <AddItemForm {...addItemStore} />
  {/if}
</Modal>
```

### Scoped Store Composition

Compose multiple scoped stores:

```svelte
<script lang="ts">
// Primary destination
const modalStore = $derived(
  scopeToDestination(store, ['modal'], 'addItem', 'modal')
);

// Secondary destination within modal
const confirmStore = $derived(
  modalStore.state
    ? scopeToDestination(
        createDerivedStore(modalStore.state),
        ['confirm'],
        'save',
        'confirm'
      )
    : null
);
</script>

{#if modalStore.state}
  <Modal {...modalStore}>
    <AddItemForm {...modalStore} />

    {#if confirmStore?.state}
      <ConfirmDialog {...confirmStore} />
    {/if}
  </Modal>
{/if}
```

### Testing Scoped Stores

Test scoped stores in isolation:

```typescript
import { describe, it, expect } from 'vitest';
import { createStore } from '@composable-svelte/core';
import { scopeToDestination } from '@composable-svelte/core';

describe('scopeToDestination', () => {
  it('returns null when destination is not present', () => {
    const store = createStore({
      initialState: { destination: null },
      reducer: (s) => [s, Effect.none()]
    });

    const scopedStore = scopeToDestination(
      store,
      ['destination'],
      'addItem',
      'destination'
    );

    expect(scopedStore.state).toBeNull();
  });

  it('returns state when destination matches case type', () => {
    const store = createStore({
      initialState: {
        destination: {
          type: 'addItem',
          state: { name: 'Apple', quantity: 5 }
        }
      },
      reducer: (s) => [s, Effect.none()]
    });

    const scopedStore = scopeToDestination(
      store,
      ['destination'],
      'addItem',
      'destination'
    );

    expect(scopedStore.state).toEqual({ name: 'Apple', quantity: 5 });
  });

  it('wraps actions correctly', () => {
    const dispatched: any[] = [];

    const store = createStore({
      initialState: {
        destination: { type: 'addItem', state: { name: '', quantity: 0 } }
      },
      reducer: (s, a) => {
        dispatched.push(a);
        return [s, Effect.none()];
      }
    });

    const scopedStore = scopeToDestination(
      store,
      ['destination'],
      'addItem',
      'destination'
    );

    scopedStore.dispatch({ type: 'nameChanged', value: 'Apple' });

    expect(dispatched[0]).toEqual({
      type: 'destination',
      action: {
        type: 'presented',
        action: {
          type: 'addItem',
          action: { type: 'nameChanged', value: 'Apple' }
        }
      }
    });
  });
});
```
