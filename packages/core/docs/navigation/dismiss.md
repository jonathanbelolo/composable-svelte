# Dismiss Dependency

Enable child features to dismiss themselves without knowing about their parent.

## Table of Contents

1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [Creating Dismiss Dependencies](#creating-dismiss-dependencies)
4. [Dependency Injection](#dependency-injection)
5. [Cleanup Patterns](#cleanup-patterns)
6. [Common Use Cases](#common-use-cases)
7. [Testing Dismiss Logic](#testing-dismiss-logic)
8. [Best Practices](#best-practices)
9. [Advanced Patterns](#advanced-patterns)

## Overview

The dismiss dependency inverts control: instead of children knowing how to navigate away, they request dismissal through an injected dependency. The parent handles the actual state transition.

### The Problem

Without dismiss dependency, child features are tightly coupled to parent structure:

```typescript
// ❌ BAD: Child knows about parent action structure
const addItemReducer: Reducer<AddItemState, AddItemAction, AddItemDeps> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'cancelButtonTapped':
      // Child knows it's in a 'destination' field!
      return [
        state,
        Effect.run((dispatch) => {
          dispatch({
            type: 'destination',  // Coupling to parent!
            action: { type: 'dismiss' }
          });
        })
      ];
  }
};
```

Problems:
- Child can't be reused in different contexts
- Child knows about parent action structure
- Changes to parent require child updates
- Testing requires parent setup

### The Solution

Dismiss dependency decouples child from parent:

```typescript
// ✅ GOOD: Child requests dismissal via dependency
interface AddItemDeps {
  dismiss: DismissDependency;
  api: ApiClient;
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
            await deps.api.saveItem(state.item);
            dispatch({ type: 'saved' });
          }),
          deps.dismiss()  // Dismiss after save
        )
      ];
  }
};
```

Benefits:
- Child is reusable in any context
- No coupling to parent structure
- Parent controls dismissal behavior
- Easy to test in isolation

## Core Concepts

### DismissDependency Type

```typescript
type DismissDependency = {
  (): Effect<any>;
};
```

A function that returns an Effect. When executed, the effect dispatches `PresentationAction.dismiss` to the parent.

### How It Works

```
1. Parent creates dismiss dependency
   ↓
2. Parent injects dependency into child deps
   ↓
3. Child calls deps.dismiss() → returns Effect
   ↓
4. Effect executes → dispatches PresentationAction.dismiss
   ↓
5. Parent receives dismiss action
   ↓
6. Parent sets destination to null
```

### Dismiss Flow

```typescript
// Child reducer
case 'cancelButtonTapped':
  return [state, deps.dismiss()];

// Effect returned:
// Effect.run((dispatch) => {
//   dispatch({
//     type: 'destination',
//     action: { type: 'dismiss' }
//   });
// })

// Parent receives:
// {
//   type: 'destination',
//   action: { type: 'dismiss' }
// }

// Parent handles:
case 'destination':
  if (action.action.type === 'dismiss') {
    return [{ ...state, destination: null }, Effect.none()];
  }
```

## Creating Dismiss Dependencies

### createDismissDependency

Creates a basic dismiss dependency.

```typescript
function createDismissDependency<ParentAction>(
  dispatch: Dispatch<ParentAction>,
  actionWrapper: (action: PresentationAction<any>) => ParentAction
): DismissDependency
```

**Parameters:**
- `dispatch`: The parent's dispatch function
- `actionWrapper`: Function to wrap PresentationAction in parent action structure

**Returns:** A dismiss dependency function

**Example:**

```typescript
import { createDismissDependency } from '@composable-svelte/core/navigation';

// In parent reducer when presenting child:
case 'addButtonTapped': {
  const childDeps: AddItemDeps = {
    ...deps,
    dismiss: createDismissDependency(
      dispatch,
      (presentationAction) => ({
        type: 'destination',
        action: presentationAction
      })
    )
  };

  // Create child store with dismiss capability
  const childStore = createStore({
    initialState: { name: '', quantity: 0 },
    reducer: addItemReducer,
    dependencies: childDeps
  });

  return [
    { ...state, destination: { name: '', quantity: 0 } },
    Effect.none()
  ];
}
```

### dismissDependency (Helper)

Convenience function for common action patterns.

```typescript
function dismissDependency<ParentAction>(
  dispatch: Dispatch<ParentAction>,
  actionField: string
): DismissDependency
```

**Parameters:**
- `dispatch`: The parent's dispatch function
- `actionField`: The parent action field name (e.g., 'destination')

**Returns:** A dismiss dependency function

**Example:**

```typescript
import { dismissDependency } from '@composable-svelte/core/navigation';

// Simpler API for standard pattern
case 'addButtonTapped': {
  const childDeps: AddItemDeps = {
    ...deps,
    dismiss: dismissDependency(dispatch, 'destination')
  };

  // Equivalent to:
  // createDismissDependency(
  //   dispatch,
  //   (pa) => ({ type: 'destination', action: pa })
  // )

  return [
    { ...state, destination: { name: '', quantity: 0 } },
    Effect.none()
  ];
}
```

### createDismissDependencyWithCleanup

Creates a dismiss dependency that runs cleanup logic before dismissing.

```typescript
function createDismissDependencyWithCleanup<ParentAction>(
  dispatch: Dispatch<ParentAction>,
  actionWrapper: (action: PresentationAction<any>) => ParentAction,
  cleanup?: () => void | Promise<void>
): DismissDependency
```

**Parameters:**
- `dispatch`: The parent's dispatch function
- `actionWrapper`: Function to wrap PresentationAction in parent action
- `cleanup`: Optional async cleanup function

**Returns:** A dismiss dependency with cleanup

**Example:**

```typescript
import { createDismissDependencyWithCleanup } from '@composable-svelte/core/navigation';

case 'addButtonTapped': {
  const childDeps: AddItemDeps = {
    ...deps,
    dismiss: createDismissDependencyWithCleanup(
      dispatch,
      (pa) => ({ type: 'destination', action: pa }),
      async () => {
        // Analytics
        await analytics.track('add_item_modal_dismissed', {
          timestamp: Date.now()
        });

        // Save draft
        localStorage.setItem('addItemDraft', JSON.stringify(state.destination));

        // Cleanup
        console.log('Modal dismissed');
      }
    )
  };

  return [
    { ...state, destination: { name: '', quantity: 0 } },
    Effect.none()
  ];
}
```

## Dependency Injection

### Store Creation Pattern

```typescript
import { createStore } from '@composable-svelte/core';
import { dismissDependency } from '@composable-svelte/core/navigation';

// Parent creates child store with dismiss dependency
case 'addButtonTapped': {
  const childDeps: AddItemDeps = {
    api: deps.api,
    dismiss: dismissDependency(
      (action) => store.dispatch(action),
      'destination'
    )
  };

  const childStore = createStore({
    initialState: { name: '', quantity: 0 },
    reducer: addItemReducer,
    dependencies: childDeps
  });

  // Store childStore somewhere accessible (context, parent state, etc.)

  return [
    { ...state, destination: { name: '', quantity: 0 } },
    Effect.none()
  ];
}
```

### Via Svelte Context

```svelte
<!-- Parent.svelte -->
<script lang="ts">
  import { setContext } from 'svelte';
  import { dismissDependency } from '@composable-svelte/core/navigation';

  const { store } = $props();

  // Create dismiss for child features
  const dismiss = dismissDependency(
    (action) => store.dispatch(action),
    'destination'
  );

  setContext('dismiss', dismiss);
</script>

<Modal store={addItemStore}>
  <AddItemForm />
</Modal>
```

```svelte
<!-- AddItemForm.svelte (child) -->
<script lang="ts">
  import { getContext } from 'svelte';

  const { store } = $props();
  const dismiss = getContext<DismissDependency>('dismiss');
</script>

<button onclick={() => dismiss()}>
  Cancel
</button>
```

### Via Scoped Store

```typescript
// ScopedDestinationStore includes dismiss() method
interface ScopedDestinationStore<State, Action> {
  state: State;
  dispatch: (action: Action) => void;
  dismiss: () => void;  // Built-in dismiss capability!
}
```

```svelte
<!-- Parent -->
<script lang="ts">
  import { Modal } from '@composable-svelte/core';
  import { scopeToDestination } from '@composable-svelte/core/navigation';

  const { store } = $props();

  const addItemStore = scopeToDestination(
    store,
    ['destination'],
    'addItem',
    'destination'
  );
</script>

<Modal store={addItemStore}>
  {#snippet children({ store })}
    <!-- store.dismiss() is built-in! -->
    <button onclick={() => store.dismiss()}>Cancel</button>
  {/snippet}
</Modal>
```

## Cleanup Patterns

### Analytics Tracking

```typescript
const dismiss = createDismissDependencyWithCleanup(
  dispatch,
  (pa) => ({ type: 'destination', action: pa }),
  async () => {
    await analytics.track('modal_dismissed', {
      duration: Date.now() - state.modalOpenedAt,
      completed: state.hasChanges
    });
  }
);
```

### Draft Persistence

```typescript
const dismiss = createDismissDependencyWithCleanup(
  dispatch,
  (pa) => ({ type: 'destination', action: pa }),
  () => {
    // Save unsaved changes as draft
    if (state.destination && state.destination.hasChanges) {
      localStorage.setItem(
        'addItemDraft',
        JSON.stringify(state.destination)
      );
    }
  }
);
```

### Resource Cleanup

```typescript
const dismiss = createDismissDependencyWithCleanup(
  dispatch,
  (pa) => ({ type: 'destination', action: pa }),
  async () => {
    // Cancel in-flight requests
    await deps.api.cancelPendingRequests();

    // Release resources
    if (state.fileHandle) {
      await state.fileHandle.close();
    }

    // Clear caches
    deps.cache.clear();
  }
);
```

### Confirmation Before Dismiss

```typescript
const dismiss = createDismissDependencyWithCleanup(
  dispatch,
  (pa) => ({ type: 'destination', action: pa }),
  async () => {
    if (state.hasUnsavedChanges) {
      const confirmed = await showConfirmDialog(
        'You have unsaved changes. Discard them?'
      );

      if (!confirmed) {
        throw new Error('Dismiss cancelled');  // Prevents dismissal
      }
    }
  }
);
```

## Common Use Cases

### Cancel Button

```typescript
// Child reducer
case 'cancelButtonTapped':
  return [state, deps.dismiss()];
```

```svelte
<!-- Child component -->
<button onclick={() => store.dispatch({ type: 'cancelButtonTapped' })}>
  Cancel
</button>

<!-- Or with scoped store -->
<button onclick={() => store.dismiss()}>
  Cancel
</button>
```

### Save and Dismiss

```typescript
case 'saveButtonTapped':
  return [
    { ...state, isSaving: true },
    Effect.batch(
      Effect.run(async (dispatch) => {
        try {
          await deps.api.saveItem(state.item);
          dispatch({ type: 'saved' });
        } catch (error) {
          dispatch({ type: 'saveFailed', error: error.message });
        }
      }),
      deps.dismiss()  // Dismiss immediately after save starts
    )
  ];

// Or dismiss after save completes:
case 'saved':
  return [
    { ...state, isSaving: false },
    deps.dismiss()
  ];
```

### Conditional Dismissal

```typescript
case 'submitButtonTapped': {
  // Only dismiss if validation passes
  const errors = validateForm(state);

  if (errors.length > 0) {
    return [
      { ...state, errors },
      Effect.none()  // Don't dismiss, show errors
    ];
  }

  return [
    { ...state, isSubmitting: true },
    Effect.batch(
      Effect.run(async (dispatch) => {
        await deps.api.submit(state);
        dispatch({ type: 'submitted' });
      }),
      deps.dismiss()  // Dismiss after successful validation
    )
  ];
}
```

### Dismiss After Delay

```typescript
case 'showSuccessMessage':
  return [
    { ...state, message: 'Success!' },
    Effect.batch(
      Effect.afterDelay(2000, () => deps.dismiss()),  // Dismiss after 2s
      Effect.fireAndForget(() => {
        analytics.track('success_shown');
      })
    )
  ];
```

### Dismiss on Escape Key

```typescript
// Note: Components handle this automatically, but you can also do it in reducer
case 'escapeKeyPressed':
  return [state, deps.dismiss()];
```

### Multiple Dismissal Paths

```typescript
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
          deps.dismiss()
        )
      ];

    case 'deleteButtonTapped':
      return [
        state,
        Effect.batch(
          Effect.run(async (dispatch) => {
            await deps.api.deleteItem(state.id);
            dispatch({ type: 'deleted' });
          }),
          deps.dismiss()
        )
      ];

    // All paths above call deps.dismiss()
  }
};
```

## Testing Dismiss Logic

### Unit Testing with Mock Dependency

```typescript
import { describe, it, expect, vi } from 'vitest';
import { Effect } from '@composable-svelte/core';

describe('AddItem reducer dismiss logic', () => {
  it('dismisses on cancel', () => {
    const mockDismiss = vi.fn(() => Effect.none());
    const deps = {
      api: mockApi,
      dismiss: mockDismiss
    };

    const state = { name: '', quantity: 0 };
    const action = { type: 'cancelButtonTapped' };

    const [newState, effect] = addItemReducer(state, action, deps);

    expect(mockDismiss).toHaveBeenCalled();
  });

  it('dismisses after successful save', () => {
    const mockDismiss = vi.fn(() => Effect.none());
    const deps = {
      api: {
        saveItem: vi.fn().mockResolvedValue({ id: '123' })
      },
      dismiss: mockDismiss
    };

    const state = { name: 'Laptop', quantity: 1 };
    const action = { type: 'saveButtonTapped' };

    const [newState, effect] = addItemReducer(state, action, deps);

    expect(mockDismiss).toHaveBeenCalled();
  });

  it('does not dismiss on validation error', () => {
    const mockDismiss = vi.fn(() => Effect.none());
    const deps = {
      api: mockApi,
      dismiss: mockDismiss
    };

    const state = { name: '', quantity: 0 };  // Invalid
    const action = { type: 'saveButtonTapped' };

    const [newState, effect] = addItemReducer(state, action, deps);

    expect(mockDismiss).not.toHaveBeenCalled();
    expect(newState.errors).toBeDefined();
  });
});
```

### Integration Testing with TestStore

```typescript
import { createTestStore } from '@composable-svelte/core/testing';
import { dismissDependency } from '@composable-svelte/core/navigation';

describe('AddItem dismiss integration', () => {
  it('dismisses modal on cancel', async () => {
    const parentStore = createTestStore({
      initialState: {
        destination: { type: 'addItem', state: { name: '', quantity: 0 } }
      },
      reducer: inventoryReducer,
      dependencies: {}
    });

    // Simulate cancel button in child
    await parentStore.send({
      type: 'destination',
      action: { type: 'dismiss' }
    }, (state) => {
      expect(state.destination).toBeNull();
    });
  });

  it('completes save-and-dismiss flow', async () => {
    const mockApi = {
      saveItem: vi.fn().mockResolvedValue({ id: '123' })
    };

    const parentStore = createTestStore({
      initialState: {
        destination: { type: 'addItem', state: { name: 'Laptop', quantity: 1 } }
      },
      reducer: inventoryReducer,
      dependencies: { api: mockApi }
    });

    // Save button tapped
    await parentStore.send({
      type: 'destination',
      action: {
        type: 'presented',
        action: { type: 'saveButtonTapped' }
      }
    });

    // Wait for API call
    await vi.waitFor(() => {
      expect(mockApi.saveItem).toHaveBeenCalled();
    });

    // Verify dismiss action received
    await parentStore.receive({
      type: 'destination',
      action: { type: 'dismiss' }
    }, (state) => {
      expect(state.destination).toBeNull();
    });
  });
});
```

### Testing Cleanup

```typescript
describe('Dismiss cleanup', () => {
  it('executes cleanup before dismissing', async () => {
    const cleanupSpy = vi.fn().mockResolvedValue(undefined);

    const dismiss = createDismissDependencyWithCleanup(
      mockDispatch,
      (pa) => ({ type: 'destination', action: pa }),
      cleanupSpy
    );

    const effect = dismiss();

    // Execute the effect
    await effect.execute(mockDispatch);

    expect(cleanupSpy).toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'destination',
      action: { type: 'dismiss' }
    });
  });

  it('tracks analytics on dismiss', async () => {
    const analyticsSpy = vi.fn().mockResolvedValue(undefined);

    const dismiss = createDismissDependencyWithCleanup(
      mockDispatch,
      (pa) => ({ type: 'destination', action: pa }),
      () => analyticsSpy('modal_dismissed')
    );

    const effect = dismiss();
    await effect.execute(mockDispatch);

    expect(analyticsSpy).toHaveBeenCalledWith('modal_dismissed');
  });
});
```

## Best Practices

### 1. Always Inject Dismiss Dependency

```typescript
// ✅ GOOD: Child can dismiss itself
interface AddItemDeps {
  dismiss: DismissDependency;
  api: ApiClient;
}

// ❌ BAD: No way to dismiss
interface AddItemDeps {
  api: ApiClient;
}
```

### 2. Type Dependencies Explicitly

```typescript
// ✅ GOOD: Explicit dependency interface
interface AddItemDeps {
  dismiss: DismissDependency;
  api: ApiClient;
  analytics: Analytics;
}

const addItemReducer: Reducer<
  AddItemState,
  AddItemAction,
  AddItemDeps  // Type ensures dismiss is present
> = (state, action, deps) => {
  // deps.dismiss() is type-safe
};

// ❌ BAD: Generic deps object
const addItemReducer = (state, action, deps: any) => {
  // No type safety!
};
```

### 3. Handle Cleanup Errors

```typescript
// ✅ GOOD: Graceful cleanup error handling
const dismiss = createDismissDependencyWithCleanup(
  dispatch,
  (pa) => ({ type: 'destination', action: pa }),
  async () => {
    try {
      await analytics.track('modal_dismissed');
    } catch (error) {
      console.warn('Analytics tracking failed:', error);
      // Don't prevent dismissal
    }
  }
);

// ❌ BAD: Unhandled errors block dismissal
const dismiss = createDismissDependencyWithCleanup(
  dispatch,
  (pa) => ({ type: 'destination', action: pa }),
  async () => {
    await analytics.track('modal_dismissed');  // Can throw!
  }
);
```

### 4. Use Scoped Store Dismiss

```svelte
<!-- ✅ GOOD: Use built-in dismiss from scoped store -->
<Modal store={addItemStore}>
  {#snippet children({ store })}
    <button onclick={() => store.dismiss()}>Cancel</button>
  {/snippet}
</Modal>

<!-- ⚠️ UNNECESSARY: Manual dismiss action -->
<Modal store={addItemStore}>
  {#snippet children({ store })}
    <button onclick={() => store.dispatch({
      type: 'parentAction',
      action: { type: 'dismiss' }
    })}>Cancel</button>
  {/snippet}
</Modal>
```

### 5. Document Dismissal Paths

```typescript
/**
 * AddItem feature reducer.
 *
 * Dismissal paths:
 * - Cancel button → immediate dismiss
 * - Save button → dismiss after save completes
 * - Delete button → dismiss after delete completes
 * - Validation error → does NOT dismiss (shows errors)
 */
const addItemReducer: Reducer<AddItemState, AddItemAction, AddItemDeps> = (
  state,
  action,
  deps
) => {
  // ...
};
```

### 6. Avoid Side Effects in Cleanup

```typescript
// ✅ GOOD: Pure cleanup (logging, analytics)
const dismiss = createDismissDependencyWithCleanup(
  dispatch,
  (pa) => ({ type: 'destination', action: pa }),
  async () => {
    await analytics.track('dismissed');
    console.log('Modal closed');
  }
);

// ❌ BAD: State mutations in cleanup
const dismiss = createDismissDependencyWithCleanup(
  dispatch,
  (pa) => ({ type: 'destination', action: pa }),
  async () => {
    // Don't mutate state here!
    state.destination = null;  // This won't work as expected

    // If you need state changes, dispatch actions instead
    dispatch({ type: 'cleanupData' });
  }
);
```

## Advanced Patterns

### Nested Dismissal

```typescript
// Child can have its own dismiss dependency for grandchild
case 'addItemButtonTapped': {
  const grandchildDeps: ConfirmDeps = {
    ...deps,
    dismiss: dismissDependency(
      (action) => childStore.dispatch(action),
      'confirmModal'
    )
  };

  return [
    {
      ...state,
      confirmModal: { message: 'Save item?' }
    },
    Effect.none()
  ];
}

// When grandchild dismisses, only grandchild closes
// Parent modal stays open
```

### Conditional Cleanup

```typescript
const dismiss = createDismissDependencyWithCleanup(
  dispatch,
  (pa) => ({ type: 'destination', action: pa }),
  async () => {
    // Only cleanup if certain conditions met
    if (state.destination?.hasUnsavedChanges) {
      await saveDraft(state.destination);
    }

    if (state.destination?.hadErrors) {
      await analytics.track('dismissed_with_errors', {
        errors: state.destination.errors
      });
    }
  }
);
```

### Dismiss with Callback

```typescript
// Parent provides callback in dependency
interface AddItemDeps {
  dismiss: DismissDependency;
  onDismiss?: (reason: string) => void;
}

case 'cancelButtonTapped':
  deps.onDismiss?.('cancelled');
  return [state, deps.dismiss()];

case 'saveButtonTapped':
  deps.onDismiss?.('saved');
  return [state, Effect.batch(saveEffect, deps.dismiss())];
```

### Dismiss with Animation Coordination

```typescript
case 'closeButtonTapped': {
  // Guard: Only dismiss if fully presented
  if (state.presentation.status !== 'presented') {
    return [state, Effect.none()];
  }

  return [
    {
      ...state,
      presentation: {
        status: 'dismissing',
        content: state.destination,
        duration: 200
      }
    },
    Effect.batch(
      // Start dismiss animation
      Effect.animated({
        duration: 200,
        onComplete: {
          type: 'presentation',
          event: { type: 'dismissalCompleted' }
        }
      }),
      // Cleanup after animation
      Effect.afterDelay(200, () => deps.dismiss())
    )
  ];
}
```

### Dismiss with Confirmation

```typescript
case 'closeButtonTapped': {
  if (state.hasUnsavedChanges) {
    // Show confirmation modal first
    return [
      {
        ...state,
        confirmModal: {
          message: 'You have unsaved changes. Discard them?'
        }
      },
      Effect.none()
    ];
  }

  // No changes, dismiss directly
  return [state, deps.dismiss()];
}

case 'confirmDiscard':
  return [
    { ...state, confirmModal: null },
    deps.dismiss()  // Now dismiss the parent
  ];
```

### Custom Dismiss Logic

```typescript
// Create custom dismiss that does more than just dispatch
function createSmartDismiss(
  dispatch: Dispatch<ParentAction>,
  state: ParentState
): DismissDependency {
  return () => {
    return Effect.run(async (d) => {
      // Custom logic before dismiss
      if (state.destination?.hasChanges) {
        await showToast('Changes discarded');
      }

      // Track how long modal was open
      const duration = Date.now() - state.modalOpenedAt;
      await analytics.track('modal_closed', { duration });

      // Finally dismiss
      d({
        type: 'destination',
        action: { type: 'dismiss' }
      });
    });
  };
}
```

### Dismiss All (Nested Modals)

```typescript
// Parent provides "dismiss all" to close entire chain
interface ChildDeps {
  dismiss: DismissDependency;
  dismissAll: DismissDependency;
}

case 'escapeKeyPressed':
  // Close only this modal
  return [state, deps.dismiss()];

case 'cancelAllButtonTapped':
  // Close entire modal chain
  return [state, deps.dismissAll()];
```

## Next Steps

- **[Navigation Components](./components.md)** - UI components for navigation
- **[Tree-Based Navigation](./tree-based.md)** - State-driven navigation patterns
- **[Store and Reducers](../core-concepts/store-and-reducers.md)** - Core state management

## Related Documentation

- [Effects](../core-concepts/effects.md) - Understanding Effect system
- [Testing](../core-concepts/testing.md) - Testing strategies
- [Composition](../core-concepts/composition.md) - Reducer composition patterns
