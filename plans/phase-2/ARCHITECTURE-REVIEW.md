# Component Implementation Guide - Architecture Review

**Date**: October 26, 2025
**Reviewer**: Claude Code
**Status**: Critical Issues Found - Guide Needs Updates

---

## Critical Findings

### ❌ Issue 1: Wrong Store Type in Components

**Current Guide Shows**:
```typescript
interface ModalProps<State, Action> {
  store: Store<State, Action> | null;
  onDismiss?: () => void;  // WRONG: Callback pattern
}
```

**Actual Implementation (from scope-to-destination.ts)**:
```typescript
interface ModalProps<State, Action> {
  store: ScopedDestinationStore<State, Action> | null;
  // No onDismiss needed - use store.dismiss()
}
```

**Why This Matters**:
- `ScopedDestinationStore` has built-in `dismiss()` method
- No callbacks needed - components call `store.dismiss()`
- Cleaner API, more aligned with Composable Architecture
- Components are self-contained, no external callbacks

**Correct Component Pattern**:
```svelte
<script lang="ts">
  import type { ScopedDestinationStore } from '@composable-svelte/core/navigation';

  interface ModalPrimitiveProps<State, Action> {
    store: ScopedDestinationStore<State, Action> | null;
  }

  let { store } = $props();

  const visible = $derived(store !== null);

  function handleEscape(event: KeyboardEvent) {
    if (event.key === 'Escape' && store) {
      store.dismiss(); // Built-in method!
    }
  }
</script>
```

---

### ❌ Issue 2: Wrong Import Paths

**Current Guide Shows**:
```typescript
import type { Store } from '../../store.svelte.js';
```

**Actual Implementation**:
```typescript
import type { Store } from '../../types.js';
import type { ScopedDestinationStore } from '../../navigation/scope-to-destination.js';
```

**Fix**: Components should import from `types.js`, not `store.svelte.js`

---

### ❌ Issue 3: ScopedDestinationStore API Not Documented

**What's Missing**: The guide doesn't explain the `ScopedDestinationStore` interface.

**Actual API (from scope-to-destination.ts)**:
```typescript
interface ScopedDestinationStore<State, Action> {
  readonly state: State | null;      // The child state
  dispatch(action: Action): void;     // Dispatch child action
  dismiss(): void;                    // Dismiss this destination
}
```

**Usage in Components**:
```svelte
{#if store}
  <!-- store.state is non-null when store is non-null -->
  <ChildComponent state={store.state} dispatch={store.dispatch} />

  <!-- Escape key calls store.dismiss() -->
  <button onclick={() => store.dismiss()}>Close</button>
{/if}
```

---

### ❌ Issue 4: Integration Examples Don't Show Reducer Connection

**What's Missing**: Guide doesn't show how components connect to reducers via `scopeToDestination`.

**Full Integration Pattern**:

```typescript
// 1. Parent State & Actions
interface AppState {
  items: Item[];
  destination: Destination | null;
}

type Destination =
  | { type: 'addItem'; state: AddItemState }
  | { type: 'editItem'; state: EditItemState };

type AppAction =
  | { type: 'addButtonTapped' }
  | { type: 'destination'; action: PresentationAction<AddItemAction | EditItemAction> };

// 2. Parent Reducer (uses ifLet)
const appReducer: Reducer<AppState, AppAction, AppDeps> = (state, action, deps) => {
  // Handle destination with ifLet
  const [newState, effect] = ifLet(
    (s) => s.destination,
    (s, d) => ({ ...s, destination: d }),
    (a) => a.type === 'destination' ? a.action : null,
    (ca) => ({ type: 'destination', action: ca }),
    createDestinationReducer({
      addItem: addItemReducer,
      editItem: editItemReducer
    })
  )(state, action, deps);

  // ... handle other actions

  return [newState, effect];
};

// 3. Component (uses scopeToDestination)
<script>
  import { Modal } from '@composable-svelte/core/navigation-components';
  import { scopeToDestination } from '@composable-svelte/core/navigation';

  let { store } = $props(); // Parent store

  // Create scoped store for add item modal
  const addItemStore = $derived(
    scopeToDestination(
      store,
      ['destination'],        // Path to destination field
      'addItem',              // Destination case type
      'destination'           // Parent action field
    )
  );
</script>

<!-- Modal automatically shows/hides based on store -->
<Modal store={addItemStore}>
  <AddItemForm />
</Modal>
```

**Key Flow**:
1. User clicks "Add Item" → `store.dispatch({ type: 'addButtonTapped' })`
2. Reducer sets `destination: { type: 'addItem', state: initialState }`
3. `scopeToDestination` detects destination case, returns scoped store
4. Modal receives scoped store, shows content
5. User presses Escape → Modal calls `store.dismiss()`
6. Scoped store dispatches `{ type: 'destination', action: { type: 'dismiss' } }`
7. Parent reducer handles dismiss via `ifLet` (sets `destination: null`)
8. `scopeToDestination` returns null, Modal hides

---

### ✅ What the Guide Got Right

1. **No Animations**: Correctly removed all animation code
2. **Two-Layer Architecture**: Primitives + Styled is correct
3. **Portal Rendering**: Correct approach
4. **Keyboard Handling**: Good patterns
5. **Tailwind Setup**: CSS variables approach is correct
6. **Accessibility**: ARIA roles and keyboard nav are right

---

## Required Changes to Guide

### 1. Update All Component Props

**Before**:
```typescript
interface ModalPrimitiveProps<State, Action> {
  store: Store<State, Action> | null;
  onDismiss?: () => void;
}
```

**After**:
```typescript
interface ModalPrimitiveProps<State, Action> {
  store: ScopedDestinationStore<State, Action> | null;
}
```

### 2. Remove All `onDismiss` Callbacks

**Before**:
```svelte
function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape' && onDismiss) {
    onDismiss();
  }
}
```

**After**:
```svelte
function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape' && store) {
    store.dismiss();
  }
}
```

### 3. Fix Import Statements

**Before**:
```typescript
import type { Store } from '../../store.svelte.js';
```

**After**:
```typescript
import type { ScopedDestinationStore } from '../../navigation/scope-to-destination.js';
```

### 4. Add "Store Architecture" Section

Explain:
- What `ScopedDestinationStore` is
- How it differs from `Store`
- Why components use scoped stores
- How `dismiss()` method works

### 5. Add Complete Integration Example

Show full flow:
- Reducer with `ifLet` and `createDestinationReducer`
- Component with `scopeToDestination`
- User interaction flow (present → dismiss)

---

## Architecture Validation

### ✅ Alignment with Composable Svelte Principles

1. **State-Driven**: ✅ Components react to store state
2. **No Internal State**: ✅ Visibility controlled by store prop
3. **Pure Presentation**: ✅ Components don't know parent structure
4. **Effect-Free**: ✅ Components don't create Effects (only reducers do)
5. **Type-Safe**: ✅ Generics flow through scoped stores
6. **Composable**: ✅ Works with ifLet and createDestinationReducer

### ✅ Svelte 5 Best Practices

1. **Runes**: ✅ Uses `$props()`, `$derived()`, `$effect()`
2. **Snippets**: ✅ Uses `{#snippet}` instead of named slots
3. **Actions**: ✅ Uses `use:` directive pattern
4. **No Legacy**: ✅ No `export let`, no `$:` reactives

### ✅ Testing Compatibility

1. **TestStore**: ✅ Can test with TestStore.send/receive
2. **Deterministic**: ✅ No hidden state, fully predictable
3. **Isolated**: ✅ Components can be tested standalone

---

## Next Steps

1. **Update Component Implementation Pattern** section with correct types
2. **Add Store Architecture** section explaining ScopedDestinationStore
3. **Fix all 8 component examples** to remove callbacks
4. **Add complete integration examples** with reducers
5. **Verify all import paths** match actual implementation

---

## Summary

**Severity**: High - Guide has architectural misalignments
**Impact**: Would lead to incorrect component implementation
**Effort**: Medium - Systematic find/replace across guide

**Key Fix**: Replace callback pattern with `store.dismiss()` method.

This is a cleaner, more composable approach that aligns with our architecture.
