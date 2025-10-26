# Animation Integration Specification

**Version:** 1.0.0
**Date:** 2025-10-25
**Status:** Draft

## Overview

This specification defines a **state-driven animation system** for Composable Svelte navigation. Animations are modeled as state transitions, providing complete control over timing, sequencing, and coordination while maintaining full testability.

### Animation Driver Implementation

**CONFIRMED DECISION**: Hybrid approach using **Svelte's built-in transitions** by default with optional **Motion One** for advanced cases.

**Default (Phase 4 - Required for v1.0.0)**:
- Use Svelte's `transition:` directive with built-in transitions (`scale`, `fade`, `slide`)
- Zero additional dependencies
- Lifecycle events via `onintroend` / `onoutroend`
- Covers modals, sheets, drawers, and standard presentation animations

**Advanced (Phase 5 or post-1.0 - Optional)**:
- Motion One integration for spring physics and gesture-driven animations
- Optional peer dependency (`motion: ^11.0.0`)
- Opt-in via `animationDriver="motion"` prop
- ~5kb bundle when enabled

See CLAUDE.md for complete rationale and implementation examples.

---

## Table of Contents

1. [Core Principles](#1-core-principles)
2. [Animation State Model](#2-animation-state-model)
3. [Presentation Lifecycle](#3-presentation-lifecycle)
4. [Animation Effects](#4-animation-effects)
5. [Component Integration](#5-component-integration)
6. [Animation Coordination](#6-animation-coordination)
7. [Testing Animations](#7-testing-animations)
8. [Advanced Patterns](#8-advanced-patterns)
9. [Performance](#9-performance)

---

## Relationship to Other Specifications

This animation specification **extends** the navigation system defined in:
- **navigation-spec.md**: Provides the base `PresentationAction` and destination patterns
- **navigation-dsl-spec.md**: The `Destination` object and `scope()` API used in examples
- **navigation-matcher-spec.md**: Action matching for animation lifecycle events

**Key Integration Points**:
- Adds `PresentationState<T>` type to track animation lifecycle (presenting → presented → dismissing → idle)
- Adds `presentation` field to feature state alongside `destination` field from navigation spec
- Uses `Effect.animated()` and related helpers to coordinate state changes with animation timing
- Components dispatch `PresentationEvent` actions that update the `presentation` field

**Why Separate `destination` and `presentation` Fields?**
- `destination`: The logical destination data (from navigation-spec.md)
- `presentation`: The animation lifecycle state of that destination
- During dismissal, `destination` remains non-null (so it can be rendered during animation), while `presentation.status` is 'dismissing'
- When animation completes, both are cleared atomically

### State Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        FEATURE STATE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  destination: DestinationState | null                           │
│  ┌─────────────────────────────────────────┐                   │
│  │ The WHAT: Logical destination data      │                   │
│  │ - Which screen to show                  │                   │
│  │ - What data it contains                 │                   │
│  │ - Remains set during dismissal          │                   │
│  │   (so UI can animate out)               │                   │
│  └─────────────────────────────────────────┘                   │
│                                                                 │
│  presentation: PresentationState<DestinationState>              │
│  ┌─────────────────────────────────────────┐                   │
│  │ The HOW: Animation lifecycle            │                   │
│  │ - idle | presenting | presented |       │                   │
│  │   dismissing                            │                   │
│  │ - Controls transition states            │                   │
│  │ - Independent of destination data       │                   │
│  └─────────────────────────────────────────┘                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Lifecycle Example:**

```
Action: 'addButtonTapped'
┌─────────────────────────────────────────┐
│ destination: { type: 'addItem', ... }   │ ← Set
│ presentation: { status: 'idle' }        │ ← Not animating yet
└─────────────────────────────────────────┘

Action: (start animation)
┌─────────────────────────────────────────┐
│ destination: { type: 'addItem', ... }   │ ← Still set
│ presentation: {                         │
│   status: 'presenting',                 │ ← Animating IN
│   content: { type: 'addItem', ... },    │
│   duration: 300                         │
│ }                                       │
└─────────────────────────────────────────┘

Action: 'presentationCompleted'
┌─────────────────────────────────────────┐
│ destination: { type: 'addItem', ... }   │ ← Still set
│ presentation: {                         │
│   status: 'presented',                  │ ← Fully visible
│   content: { type: 'addItem', ... }     │
│ }                                       │
└─────────────────────────────────────────┘

Action: 'closeButtonTapped'
┌─────────────────────────────────────────┐
│ destination: { type: 'addItem', ... }   │ ← STILL SET (for animation)
│ presentation: {                         │
│   status: 'dismissing',                 │ ← Animating OUT
│   content: { type: 'addItem', ... },    │
│   duration: 200                         │
│ }                                       │
└─────────────────────────────────────────┘

Action: 'dismissalCompleted'
┌─────────────────────────────────────────┐
│ destination: null                       │ ← Cleared ATOMICALLY
│ presentation: { status: 'idle' }        │ ← Cleared ATOMICALLY
└─────────────────────────────────────────┘
```

**Key Insight**: `destination` and `presentation` are cleared **together** only when dismissal animation **completes**. This ensures the UI has access to destination data throughout the entire animation lifecycle.

---

## 1. Core Principles

### 1.1 Animation is State

**Key Insight**: Treat animations as state machines, not side effects.

```typescript
// Animation state is part of your domain
interface State {
  data: Data;
  presentation: PresentationState;  // Animation lifecycle
}
```

**Benefits**:
- ✅ Fully testable (animations are just data)
- ✅ Time-travel debugging (see exact animation state)
- ✅ Deterministic (same state = same animation)
- ✅ Composable (coordinate multiple animations)
- ✅ Cancellable (change state to interrupt)

### 1.2 Lifecycle Management

Animations follow a strict lifecycle:

```
IDLE → PRESENTING → PRESENTED → DISMISSING → IDLE
  ↑                                              ↓
  └──────────────────────────────────────────────┘
```

Each transition is an explicit state change triggered by actions.

### 1.3 View-State Separation

```typescript
// State: What should be animated
state.presentation = { status: 'presenting', destination: {...} }

// View: How it should be animated
<div transition:scale={{ duration: 300 }}>
```

State declares **intent**, views declare **implementation**.

---

## 2. Animation State Model

### 2.1 Presentation State

```typescript
// lib/composable/navigation/types.ts

/**
 * Presentation lifecycle state.
 * Tracks animation lifecycle: idle → presenting → presented → dismissing → idle
 */
export type PresentationState<T> =
  | { status: 'idle' }
  | { status: 'presenting'; content: T; duration?: number }
  | { status: 'presented'; content: T }
  | { status: 'dismissing'; content: T; duration?: number };

/**
 * Presentation events.
 */
export type PresentationEvent =
  | { type: 'presentationStarted' }
  | { type: 'presentationCompleted' }
  | { type: 'dismissalStarted' }
  | { type: 'dismissalCompleted' };
```

### 2.2 Feature State with Presentation

```typescript
// features/inventory/state.ts

import type { PresentationState } from '$lib/composable/navigation';
// DestinationState comes from navigation-dsl-spec.md's createDestination()
import type { DestinationState } from './destination';
import type { Item } from './types';

export interface InventoryState {
  items: Item[];

  // The destination data (from navigation-spec.md pattern)
  destination: DestinationState | null;

  // The presentation lifecycle (from animation-integration-spec.md)
  // Tracks animation state of the destination
  presentation: PresentationState<DestinationState>;
}

export const initialState: InventoryState = {
  items: [],
  destination: null,
  presentation: { status: 'idle' }
};
```

### 2.3 Presentation Actions

```typescript
// features/inventory/actions.ts

import type { PresentationEvent } from '$lib/composable/navigation';
// PresentationAction from navigation-spec.md wraps child actions
import type { PresentationAction } from '$lib/composable/navigation';
import type { DestinationAction } from './destination';

export type InventoryAction =
  // User actions
  | { type: 'addButtonTapped' }
  | { type: 'closeButtonTapped' }

  // Destination actions (from navigation-spec.md)
  | { type: 'destination'; action: PresentationAction<DestinationAction> }

  // Presentation lifecycle actions (from animation-integration-spec.md)
  | { type: 'presentation'; event: PresentationEvent };
```

---

## 3. Presentation Lifecycle

### 3.1 Initiating Presentation

```typescript
// features/inventory/reducer.ts

import type { Reducer } from '$lib/composable/types';
import { Effect } from '$lib/composable/effect';
import type { InventoryState } from './state';
import type { InventoryAction } from './actions';
// Destination from navigation-dsl-spec.md
import { Destination } from './destination';
import { initialState as initialAddItemState } from './add-item/state';

const inventoryReducer: Reducer<InventoryState, InventoryAction> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'addButtonTapped': {
      // Create destination using DSL (from navigation-dsl-spec.md)
      const destination = Destination.initial('addItem', initialAddItemState);

      return [
        {
          ...state,
          destination,
          presentation: {
            status: 'presenting',
            content: destination,
            duration: 300  // Optional: hint for animation duration
          }
        },
        // Effect to auto-complete after duration
        Effect.afterDelay(300, (dispatch) => {
          dispatch({
            type: 'presentation',
            event: { type: 'presentationCompleted' }
          });
        })
      ];
    }
  }
};
```

### 3.2 Completing Presentation

```typescript
case 'presentation': {
  if (action.event.type === 'presentationCompleted') {
    // Verify we're in presenting state
    if (state.presentation.status !== 'presenting') {
      return [state, Effect.none()];
    }

    return [
      {
        ...state,
        presentation: {
          status: 'presented',
          content: state.presentation.content
        }
      },
      Effect.none()
    ];
  }
}
```

### 3.3 Initiating Dismissal

```typescript
case 'closeButtonTapped': {
  // IMPORTANT: Only dismiss from 'presented' state
  // This prevents race conditions from:
  // - Dismissing during presentation animation ('presenting')
  // - Double dismissal ('dismissing')
  // - Dismissing when nothing is shown ('idle')
  if (state.presentation.status !== 'presented') {
    return [state, Effect.none()];
  }

  return [
    {
      ...state,
      presentation: {
        status: 'dismissing',
        content: state.presentation.content,
        duration: 200
      }
    },
    Effect.afterDelay(200, (dispatch) => {
      dispatch({
        type: 'presentation',
        event: { type: 'dismissalCompleted' }
      });
    })
  ];
}
```

### 3.4 Completing Dismissal

```typescript
case 'presentation': {
  if (action.event.type === 'dismissalCompleted') {
    // Verify we're in dismissing state
    if (state.presentation.status !== 'dismissing') {
      return [state, Effect.none()];
    }

    return [
      {
        ...state,
        destination: null,
        presentation: { status: 'idle' }
      },
      Effect.none()
    ];
  }
}
```

### 3.5 Animation Safety Patterns

**State Transition Guards:**

Always validate the current state before transitioning to prevent race conditions:

```typescript
// ✅ GOOD: Explicit state validation
case 'addButtonTapped': {
  // Only present if idle (nothing currently showing)
  if (state.presentation.status !== 'idle') {
    return [state, Effect.none()];
  }

  return [
    { ...state, presentation: { status: 'presenting', content: destination } },
    Effect.afterDelay(300, (dispatch) => {
      dispatch({ type: 'presentation', event: { type: 'presentationCompleted' } });
    })
  ];
}

// ❌ BAD: No validation, could present during dismissal
case 'addButtonTapped': {
  return [
    { ...state, presentation: { status: 'presenting', content: destination } },
    // ...
  ];
}
```

**Valid State Transitions:**

| From State | To State | Trigger | Allowed? |
|------------|----------|---------|----------|
| `idle` | `presenting` | User action | ✅ Yes |
| `presenting` | `presented` | Animation complete | ✅ Yes |
| `presenting` | `dismissing` | User cancels | ⚠️ Depends on UX |
| `presented` | `dismissing` | User dismisses | ✅ Yes |
| `dismissing` | `idle` | Animation complete | ✅ Yes |
| `dismissing` | `presenting` | User action | ⚠️ Usually no |
| `presenting` | `presenting` | Rapid taps | ❌ No (blocked by guard) |
| `dismissing` | `dismissing` | Rapid taps | ❌ No (blocked by guard) |

**Handling Edge Cases:**

```typescript
// Pattern: Check state before every transition
case 'presentation': {
  if (action.event.type === 'presentationCompleted') {
    // Guard: Only complete if we're actually presenting
    if (state.presentation.status !== 'presenting') {
      console.warn('Received presentationCompleted but not in presenting state');
      return [state, Effect.none()];
    }

    return [
      { ...state, presentation: { status: 'presented', content: state.presentation.content } },
      Effect.none()
    ];
  }

  if (action.event.type === 'dismissalCompleted') {
    // Guard: Only complete if we're actually dismissing
    if (state.presentation.status !== 'dismissing') {
      console.warn('Received dismissalCompleted but not in dismissing state');
      return [state, Effect.none()];
    }

    return [
      { ...state, destination: null, presentation: { status: 'idle' } },
      Effect.none()
    ];
  }
}
```

### 3.6 UX Recommendations for Blocked Actions

When guards block actions during animations, provide clear user feedback. Here are recommended patterns:

#### Scenario 1: Rapid Button Taps

**Problem:** User taps "Add Item" button multiple times rapidly while modal is animating in.

**Recommendation:** **Disable button during animation**

```svelte
<script>
  const isAnimating = $derived(
    store.state.presentation.status === 'presenting' ||
    store.state.presentation.status === 'dismissing'
  );
</script>

<button
  onclick={() => store.dispatch({ type: 'addButtonTapped' })}
  disabled={isAnimating}
>
  Add Item
</button>

<style>
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
```

**Why:** Prevents confusion about why nothing happens. Visual feedback (disabled state) communicates the system is busy.

#### Scenario 2: Action During Dismissal

**Problem:** User tries to open a new modal while current modal is animating out.

**Recommendation:** **Queue the action** or **Cancel and restart**

**Option A: Queue (Simpler UX)**

```typescript
case 'addButtonTapped': {
  // If dismissing, wait for it to complete then present
  if (state.presentation.status === 'dismissing') {
    return [
      { ...state, pendingAction: 'addItem' },
      Effect.none()
    ];
  }

  if (state.presentation.status !== 'idle') {
    return [state, Effect.none()];
  }

  // Normal presentation logic...
}

case 'presentation': {
  if (action.event.type === 'dismissalCompleted') {
    const newState = {
      ...state,
      destination: null,
      presentation: { status: 'idle' }
    };

    // Execute pending action if any
    if (state.pendingAction) {
      return [
        { ...newState, pendingAction: null },
        Effect.run((dispatch) => {
          dispatch({ type: state.pendingAction + 'Tapped' });
        })
      ];
    }

    return [newState, Effect.none()];
  }
}
```

**Option B: Cancel and Restart (Faster, more complex)**

```typescript
case 'addButtonTapped': {
  // If dismissing, cancel and immediately present new content
  if (state.presentation.status === 'dismissing') {
    const destination = Destination.initial('addItem', initialAddItemState);
    return [
      {
        ...state,
        destination,
        presentation: { status: 'presenting', content: destination }
      },
      Effect.afterDelay(300, (dispatch) => {
        dispatch({ type: 'presentation', event: { type: 'presentationCompleted' } });
      })
    ];
  }

  // Normal presentation logic...
}
```

**Recommendation:** Use **Option A (Queue)** for most cases. It's more predictable and easier to test.

#### Scenario 3: Canceling Mid-Presentation

**Problem:** User taps backdrop while modal is animating in.

**Recommendation:** **Allow cancellation** or **Ignore until presented**

**Option A: Allow Cancellation (Better UX)**

```typescript
case 'backdropTapped': {
  // Allow cancellation even during presentation
  if (state.presentation.status === 'presenting' ||
      state.presentation.status === 'presented') {
    return [
      {
        ...state,
        presentation: { status: 'dismissing', content: state.presentation.content }
      },
      Effect.afterDelay(300, (dispatch) => {
        dispatch({ type: 'presentation', event: { type: 'dismissalCompleted' } });
      })
    ];
  }

  return [state, Effect.none()];
}
```

**Option B: Wait Until Presented (Simpler)**

```typescript
case 'backdropTapped': {
  // Only allow dismissal if fully presented
  if (state.presentation.status === 'presented') {
    return [
      {
        ...state,
        presentation: { status: 'dismissing', content: state.presentation.content }
      },
      Effect.afterDelay(300, (dispatch) => {
        dispatch({ type: 'presentation', event: { type: 'dismissalCompleted' } });
      })
    ];
  }

  return [state, Effect.none()];
}
```

**Recommendation:** Use **Option A** for better responsiveness. Users expect to cancel quickly.

#### UX Pattern Summary

| Scenario | User Action | Recommended Pattern | Rationale |
|----------|-------------|---------------------|-----------|
| Rapid taps on same button | Tap "Add" 3x quickly | **Disable button** during animation | Clear visual feedback, prevents confusion |
| New action during dismissal | Tap "Edit" while "Add" dismissing | **Queue action** until dismissal completes | Predictable, doesn't lose user intent |
| Cancel mid-presentation | Tap backdrop during slide-in | **Allow cancellation** immediately | Responsive, respects user control |
| Multiple modals queued | Tap "Add", then "Edit", then "Delete" | **Keep only latest** or **show warning** | Prevents overwhelming stack of modals |

#### Testing Edge Cases

Always test these scenarios:

```typescript
it('disables button during animation', async () => {
  await store.send({ type: 'addButtonTapped' });
  expect(store.getState().presentation.status).toBe('presenting');

  // Rapid second tap should be ignored
  await store.send({ type: 'addButtonTapped' });
  expect(store.getState().presentation.status).toBe('presenting'); // Still same state
});

it('queues action during dismissal', async () => {
  // Present modal
  await store.send({ type: 'addButtonTapped' });
  await store.receive({ type: 'presentationCompleted' });

  // Start dismissal
  await store.send({ type: 'closeButtonTapped' });
  expect(store.getState().presentation.status).toBe('dismissing');

  // Try to present new item while dismissing
  await store.send({ type: 'editButtonTapped' });
  expect(store.getState().pendingAction).toBe('editItem');

  // After dismissal completes, pending action executes
  await store.receive({ type: 'dismissalCompleted' });
  await store.receive({ type: 'presentationCompleted' });
  expect(store.getState().destination?.type).toBe('editItem');
});
```

---

## 4. Animation Effects

### 4.1 `Effect.afterDelay()`

```typescript
// lib/composable/effect.ts

export const Effect = {
  // ... existing methods ...

  /**
   * Dispatch action after a delay.
   * Useful for auto-completing animations.
   */
  afterDelay<A>(
    ms: number,
    create: (dispatch: Dispatch<A>) => void
  ): Effect<A> {
    return {
      _tag: 'Run',
      execute: async (dispatch) => {
        await new Promise(resolve => setTimeout(resolve, ms));
        create(dispatch);
      }
    };
  }
};
```

### 4.2 `Effect.animated()`

```typescript
/**
 * Create an effect that coordinates with animation lifecycle.
 * Automatically dispatches completion events.
 */
export const Effect = {
  animated<A>(config: {
    duration: number;
    onComplete: A;
  }): Effect<A> {
    return Effect.afterDelay(config.duration, (dispatch) => {
      dispatch(config.onComplete);
    });
  }
};

// Usage
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

### 4.3 `Effect.transition()`

```typescript
/**
 * Create a presentation effect with automatic lifecycle management.
 */
export const Effect = {
  transition<A, Content>(config: {
    content: Content;
    presentDuration?: number;
    dismissDuration?: number;
    createPresentationEvent: (event: PresentationEvent) => A;
  }): {
    present: Effect<A>;
    dismiss: Effect<A>;
  } {
    return {
      present: Effect.animated({
        duration: config.presentDuration ?? 300,
        onComplete: config.createPresentationEvent({
          type: 'presentationCompleted'
        })
      }),
      dismiss: Effect.animated({
        duration: config.dismissDuration ?? 200,
        onComplete: config.createPresentationEvent({
          type: 'dismissalCompleted'
        })
      })
    };
  }
};

// Usage
const transition = Effect.transition({
  content: destination,
  presentDuration: 300,
  dismissDuration: 200,
  createPresentationEvent: (event) => ({
    type: 'presentation',
    event
  })
});

// In reducer
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

## 5. Component Integration

### 5.1 Basic Animation Component (Using Svelte Transitions)

**Implementation Note**: This uses **Svelte's built-in transitions** (confirmed default approach).

```svelte
<!-- lib/composable/navigation-components/AnimatedModal.svelte -->
<script lang="ts">
  import { scale, fade } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';
  import type { Snippet } from 'svelte';
  import type { PresentationState } from '$lib/composable/navigation';

  interface Props {
    presentation: PresentationState<any>;
    onPresentationComplete?: () => void;
    onDismissalComplete?: () => void;
    children: Snippet;
  }

  let {
    presentation,
    onPresentationComplete,
    onDismissalComplete,
    children
  }: Props = $props();

  // Determine if modal should be in DOM
  const shouldMount = $derived(
    presentation.status === 'presenting' ||
    presentation.status === 'presented' ||
    presentation.status === 'dismissing'
  );

  // Determine visibility for transitions
  const isVisible = $derived(
    presentation.status === 'presenting' ||
    presentation.status === 'presented'
  );

  // Animation callbacks
  function handleIntroEnd() {
    if (presentation.status === 'presenting' && onPresentationComplete) {
      onPresentationComplete();
    }
  }

  function handleOutroEnd() {
    if (presentation.status === 'dismissing' && onDismissalComplete) {
      onDismissalComplete();
    }
  }
</script>

{#if shouldMount}
  <div class="modal-backdrop" transition:fade={{ duration: 200 }}>
    {#if isVisible}
      <div
        class="modal-content"
        in:scale={{ duration: 300, start: 0.95, opacity: 0, easing: quintOut }}
        out:scale={{ duration: 200, start: 0.95, opacity: 0, easing: quintOut }}
        onintroend={handleIntroEnd}
        onoutroend={handleOutroEnd}
      >
        {@render children()}
      </div>
    {/if}
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

### 5.2 Enhanced Modal with Store Integration

```svelte
<!-- lib/composable/navigation-components/Modal.svelte -->
<script lang="ts">
  import { scale, fade } from 'svelte/transition';
  import type { Snippet } from 'svelte';
  import type { Store } from '$lib/composable/types';

  interface Props {
    store: Store<any, any>;
    presentationPath?: string; // e.g., 'presentation'
    onBackdropClick?: 'dismiss' | 'ignore';
    children: Snippet;
  }

  let {
    store,
    presentationPath = 'presentation',
    onBackdropClick = 'dismiss',
    children
  }: Props = $props();

  // Extract presentation state
  const presentation = $derived(store.state[presentationPath]);

  const shouldMount = $derived(
    presentation.status !== 'idle' &&
    presentation.status !== 'dismissed'
  );

  const isVisible = $derived(
    presentation.status === 'presenting' ||
    presentation.status === 'presented'
  );

  function handleIntroEnd() {
    if (presentation.status === 'presenting') {
      store.dispatch({
        type: 'presentation',
        event: { type: 'presentationCompleted' }
      });
    }
  }

  function handleOutroEnd() {
    if (presentation.status === 'dismissing') {
      store.dispatch({
        type: 'presentation',
        event: { type: 'dismissalCompleted' }
      });
    }
  }

  function handleBackdrop() {
    if (onBackdropClick === 'dismiss' && presentation.status === 'presented') {
      store.dispatch({ type: 'closeButtonTapped' });
    }
  }
</script>

{#if shouldMount}
  <div
    class="modal-backdrop"
    onclick={handleBackdrop}
    transition:fade={{ duration: 200 }}
  >
    {#if isVisible}
      <div
        class="modal-content"
        onclick={(e) => e.stopPropagation()}
        in:scale={{ duration: 300, start: 0.95 }}
        out:scale={{ duration: 200, start: 0.95 }}
        onintroend={handleIntroEnd}
        onoutroend={handleOutroEnd}
      >
        {@render children()}
      </div>
    {/if}
  </div>
{/if}
```

### 5.3 Usage in Features

```svelte
<!-- features/inventory/Inventory.svelte -->
<script lang="ts">
  import { Modal } from '$lib/composable/navigation-components';
  // scope from navigation-dsl-spec.md
  import { scope } from '$lib/composable/navigation';
  import { createStore } from '$lib/composable/store';
  import AddItemView from './add-item/AddItem.svelte';
  import { initialState } from './state';
  import { inventoryReducer } from './reducer';

  const store = createStore({
    initialState,
    reducer: inventoryReducer
  });

  // Scope to destination (from navigation-dsl-spec.md)
  // Note: scope navigates into 'destination' field, not 'presentation'
  // The presentation field is managed by parent reducer
  const addItemStore = $derived(
    scope(store).into('destination').case('addItem')
  );
</script>

<div class="inventory">
  <button onclick={() => store.dispatch({ type: 'addButtonTapped' })}>
    Add Item
  </button>

  <!-- Modal automatically handles animation lifecycle -->
  <Modal {store} presentationPath="presentation">
    {#if addItemStore}
      <AddItemView store={addItemStore} />
    {/if}
  </Modal>
</div>
```

---

## 6. Error Handling and Timeouts

### 6.1 Problem: Animation Failures

Animations can fail or hang for various reasons:
- **Animation library errors** (CSS transitions interrupted, JS animation crashes)
- **Component unmounted** before animation completes
- **Slow devices** where animation timing is unreliable
- **Race conditions** from rapid user interactions
- **Missing completion events** due to bugs

Without proper error handling, the app can get stuck in `presenting` or `dismissing` states indefinitely.

### 6.2 Timeout Fallback Pattern

**Always include timeout fallbacks for critical state transitions:**

```typescript
// Add timeout tracking to state
interface InventoryState {
  destination: DestinationState | null;
  presentation: PresentationState<DestinationState>;
  animationTimeoutId: string | null; // Track active timeout
}

type InventoryAction =
  // ... existing actions ...
  | { type: 'presentation'; event: PresentationEvent | { type: 'presentationTimeout' } };

// In reducer: Set timeout when starting animation
case 'addButtonTapped': {
  if (state.presentation.status !== 'idle') {
    return [state, Effect.none()];
  }

  return [
    {
      ...state,
      presentation: { status: 'presenting', content: destination, duration: 300 },
      animationTimeoutId: 'present-animation'
    },
    Effect.batch(
      // Normal completion
      Effect.afterDelay(300, (dispatch) => {
        dispatch({ type: 'presentation', event: { type: 'presentationCompleted' } });
      }),
      // Timeout fallback (2x expected duration)
      Effect.afterDelay(600, (dispatch) => {
        dispatch({ type: 'presentation', event: { type: 'presentationTimeout' } });
      })
    )
  ];
}

// Handle timeout event
case 'presentation': {
  if (action.event.type === 'presentationTimeout') {
    // Force completion if still presenting
    if (state.presentation.status === 'presenting') {
      console.warn('Animation timeout - forcing completion');
      return [
        {
          ...state,
          presentation: { status: 'presented', content: state.presentation.content },
          animationTimeoutId: null
        },
        Effect.none()
      ];
    }

    // Already completed, ignore timeout
    return [state, Effect.none()];
  }

  if (action.event.type === 'presentationCompleted') {
    // Only complete if we're actually presenting and timeout hasn't fired
    if (state.presentation.status !== 'presenting') {
      return [state, Effect.none()];
    }

    return [
      {
        ...state,
        presentation: { status: 'presented', content: state.presentation.content },
        animationTimeoutId: null
      },
      Effect.none()
    ];
  }
}
```

### 6.3 Enhanced `Effect.afterDelay()` with Cancellation

For production use, use cancellable effects to prevent memory leaks:

```typescript
// lib/composable/effect.ts

export const Effect = {
  /**
   * Dispatch action after a delay.
   * Uses cancellable effect to prevent memory leaks if component unmounts.
   */
  afterDelay<A>(
    ms: number,
    create: (dispatch: Dispatch<A>) => void,
    id?: string
  ): Effect<A> {
    const effectId = id ?? `afterDelay-${Date.now()}-${Math.random()}`;

    return {
      _tag: 'Cancellable',
      id: effectId,
      execute: async (dispatch) => {
        await new Promise(resolve => setTimeout(resolve, ms));
        create(dispatch);
      }
    };
  }
};
```

### 6.4 Animation Error Boundaries

Wrap animation logic in try-catch when using JS animations:

```typescript
case 'presentation': {
  if (action.event.type === 'animationError') {
    console.error('Animation error:', action.event.error);

    // Recover by forcing completion
    return [
      {
        ...state,
        presentation: {
          status: state.presentation.status === 'presenting' ? 'presented' : 'idle',
          content: state.presentation.content
        }
      },
      Effect.none()
    ];
  }
}

// In component (when using JS animations)
<script>
  async function animateIn(node: HTMLElement) {
    try {
      await node.animate([
        { opacity: 0, transform: 'scale(0.9)' },
        { opacity: 1, transform: 'scale(1)' }
      ], { duration: 300 }).finished;

      onPresentationComplete?.();
    } catch (error) {
      // Dispatch error action
      store.dispatch({
        type: 'presentation',
        event: { type: 'animationError', error: String(error) }
      });
    }
  }
</script>
```

### 6.5 Cleanup on Component Unmount

Always clean up timers when component unmounts:

```svelte
<script lang="ts">
  import { onDestroy } from 'svelte';

  const store = createStore({ initialState, reducer });

  // Clean up pending effects on unmount
  onDestroy(() => {
    store.destroy(); // Cancels all in-flight effects
  });
</script>
```

### 6.6 Recommended Timeout Values

| Animation Type | Expected Duration | Timeout Value | Reason |
|----------------|-------------------|---------------|---------|
| Modal present | 300ms | 600ms (2x) | Allow for slow devices |
| Modal dismiss | 200ms | 400ms (2x) | Allow for slow devices |
| Page transition | 500ms | 1000ms (2x) | More complex animations |
| Micro-interaction | 100ms | 300ms (3x) | Fast feedback needed |

**Rule of thumb**: Set timeout to **2-3x expected duration** to allow for slow devices while still recovering from failures.

### 6.7 Complete Example with Error Handling

```typescript
interface State {
  destination: DestinationState | null;
  presentation: PresentationState<DestinationState>;
  error: string | null;
}

type Action =
  | { type: 'addButtonTapped' }
  | { type: 'closeButtonTapped' }
  | { type: 'presentation'; event: PresentationEvent | TimeoutEvent | ErrorEvent };

type PresentationEvent =
  | { type: 'presentationCompleted' }
  | { type: 'dismissalCompleted' };

type TimeoutEvent =
  | { type: 'presentationTimeout' }
  | { type: 'dismissalTimeout' };

type ErrorEvent =
  | { type: 'animationError'; error: string };

const reducer: Reducer<State, Action> = (state, action) => {
  switch (action.type) {
    case 'addButtonTapped': {
      if (state.presentation.status !== 'idle') {
        return [state, Effect.none()];
      }

      const destination = { type: 'addItem' as const, state: initialAddItemState };

      return [
        {
          ...state,
          presentation: { status: 'presenting', content: destination, duration: 300 },
          error: null
        },
        Effect.batch(
          Effect.afterDelay(300, (d) =>
            d({ type: 'presentation', event: { type: 'presentationCompleted' } })
          , 'present-normal'),
          Effect.afterDelay(600, (d) =>
            d({ type: 'presentation', event: { type: 'presentationTimeout' } })
          , 'present-timeout')
        )
      ];
    }

    case 'presentation': {
      const { event } = action;

      // Handle completion
      if (event.type === 'presentationCompleted') {
        if (state.presentation.status !== 'presenting') {
          return [state, Effect.none()];
        }

        return [
          { ...state, presentation: { status: 'presented', content: state.presentation.content } },
          Effect.none()
        ];
      }

      // Handle timeout
      if (event.type === 'presentationTimeout') {
        if (state.presentation.status === 'presenting') {
          console.warn('Presentation timeout - forcing completion');
          return [
            {
              ...state,
              presentation: { status: 'presented', content: state.presentation.content },
              error: 'Animation timeout (forced completion)'
            },
            Effect.none()
          ];
        }
        return [state, Effect.none()];
      }

      // Handle errors
      if (event.type === 'animationError') {
        console.error('Animation error:', event.error);

        return [
          {
            ...state,
            presentation:
              state.presentation.status === 'presenting'
                ? { status: 'presented', content: state.presentation.content }
                : { status: 'idle' },
            error: event.error
          },
          Effect.none()
        ];
      }

      // Handle dismissal
      if (event.type === 'dismissalCompleted') {
        if (state.presentation.status !== 'dismissing') {
          return [state, Effect.none()];
        }

        return [
          { ...state, destination: null, presentation: { status: 'idle' } },
          Effect.none()
        ];
      }

      return [state, Effect.none()];
    }

    default:
      const _exhaustive: never = action;
      return [state, Effect.none()];
  }
};
```

---

## 7. Animation Coordination

### 7.1 Sequential Animations

```typescript
// Animate out old, then animate in new
case 'switchToEdit': {
  const itemId = action.itemId;

  // Step 1: Start dismissing current
  if (state.presentation.status === 'presented') {
    return [
      {
        ...state,
        presentation: {
          status: 'dismissing',
          content: state.presentation.content
        },
        pendingDestination: {
          type: 'editItem',
          state: createEditState(itemId)
        }
      },
      Effect.animated({
        duration: 200,
        onComplete: {
          type: 'presentation',
          event: { type: 'dismissalCompleted' }
        }
      })
    ];
  }

  return [state, Effect.none()];
}

case 'presentation': {
  if (action.event.type === 'dismissalCompleted') {
    // Step 2: Start presenting new
    if (state.pendingDestination) {
      return [
        {
          ...state,
          destination: state.pendingDestination,
          presentation: {
            status: 'presenting',
            content: state.pendingDestination
          },
          pendingDestination: null
        },
        Effect.animated({
          duration: 300,
          onComplete: {
            type: 'presentation',
            event: { type: 'presentationCompleted' }
          }
        })
      ];
    }
  }
}
```

### 6.2 Parallel Animations

```typescript
// Animate multiple elements simultaneously
case 'showWithSidebar': {
  return [
    {
      ...state,
      modalPresentation: {
        status: 'presenting',
        content: modalContent
      },
      sidebarPresentation: {
        status: 'presenting',
        content: sidebarContent
      }
    },
    Effect.batch(
      Effect.animated({
        duration: 300,
        onComplete: {
          type: 'modalPresentation',
          event: { type: 'presentationCompleted' }
        }
      }),
      Effect.animated({
        duration: 400,
        onComplete: {
          type: 'sidebarPresentation',
          event: { type: 'presentationCompleted' }
        }
      })
    )
  ];
}
```

### 6.3 Interrupting Animations

```typescript
// Cancel in-flight animation and start new one
case 'addButtonTapped': {
  // Can present even if currently dismissing
  const destination = Destination.initial('addItem', initialAddItemState);

  return [
    {
      ...state,
      destination,
      presentation: {
        status: 'presenting',
        content: destination
      }
    },
    Effect.animated({
      duration: 300,
      onComplete: {
        type: 'presentation',
        event: { type: 'presentationCompleted' }
      }
    })
  ];
}
```

View handles interruption automatically:

```svelte
{#if isVisible}
  <!-- If isVisible changes mid-animation, Svelte handles it -->
  <div in:scale out:scale>
    Content
  </div>
{/if}
```

### 6.4 Chained Animations (Multi-step)

```typescript
// Animation chain: present → transform → dismiss
type AnimationPhase =
  | { type: 'presenting' }
  | { type: 'presented' }
  | { type: 'transforming' }
  | { type: 'transformed' }
  | { type: 'dismissing' }
  | { type: 'idle' };

interface State {
  presentation: {
    phase: AnimationPhase;
    content: Content | null;
  };
}

// Phase 1: Present
case 'show':
  return [
    { ...state, presentation: { phase: { type: 'presenting' }, content } },
    Effect.animated({
      duration: 300,
      onComplete: { type: 'animationPhaseCompleted', phase: 'presenting' }
    })
  ];

// Phase 2: Transform
case 'animationPhaseCompleted': {
  if (action.phase === 'presenting') {
    return [
      { ...state, presentation: { phase: { type: 'transforming' }, content: state.presentation.content } },
      Effect.animated({
        duration: 500,
        onComplete: { type: 'animationPhaseCompleted', phase: 'transforming' }
      })
    ];
  }

  if (action.phase === 'transforming') {
    return [
      { ...state, presentation: { phase: { type: 'dismissing' }, content: state.presentation.content } },
      Effect.animated({
        duration: 200,
        onComplete: { type: 'animationPhaseCompleted', phase: 'dismissing' }
      })
    ];
  }

  if (action.phase === 'dismissing') {
    return [
      { ...state, presentation: { phase: { type: 'idle' }, content: null } },
      Effect.none()
    ];
  }
}
```

---

## 7. Testing Animations

### 7.1 Testing State Transitions

```typescript
// features/inventory/reducer.test.ts

import { describe, it, expect, vi } from 'vitest';
import { TestStore } from '$lib/composable/test';

describe('animation lifecycle', () => {
  it('transitions through presentation lifecycle', async () => {
    const store = new TestStore({
      initialState,
      reducer: inventoryReducer
    });

    // 1. Start presenting
    await store.send({ type: 'addButtonTapped' }, (state) => {
      expect(state.presentation.status).toBe('presenting');
      expect(state.destination).not.toBeNull();
    });

    // 2. Complete presentation
    await store.receive({
      type: 'presentation',
      event: { type: 'presentationCompleted' }
    }, (state) => {
      expect(state.presentation.status).toBe('presented');
    });

    // 3. Start dismissing
    await store.send({ type: 'closeButtonTapped' }, (state) => {
      expect(state.presentation.status).toBe('dismissing');
      expect(state.destination).not.toBeNull(); // Still there during animation
    });

    // 4. Complete dismissal
    await store.receive({
      type: 'presentation',
      event: { type: 'dismissalCompleted' }
    }, (state) => {
      expect(state.presentation.status).toBe('idle');
      expect(state.destination).toBeNull(); // Now removed
    });
  });

  it('prevents dismissal during presenting', async () => {
    const store = new TestStore({
      initialState: {
        ...initialState,
        presentation: {
          status: 'presenting',
          content: Destination.initial('addItem', initialAddItemState)
        }
      },
      reducer: inventoryReducer
    });

    await store.send({ type: 'closeButtonTapped' }, (state) => {
      // State should not change
      expect(state.presentation.status).toBe('presenting');
    });
  });
});
```

### 7.2 Testing with Fake Timers

```typescript
import { vi, beforeEach, afterEach } from 'vitest';

describe('animation timing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('completes animation after duration', async () => {
    const store = new TestStore({
      initialState,
      reducer: inventoryReducer
    });

    // Start presenting
    await store.send({ type: 'addButtonTapped' });

    // Initially presenting
    expect(store.getState().presentation.status).toBe('presenting');

    // Advance time
    vi.advanceTimersByTime(300);
    await vi.runAllTimersAsync();

    // Should receive completion event
    await store.receive({
      type: 'presentation',
      event: { type: 'presentationCompleted' }
    }, (state) => {
      expect(state.presentation.status).toBe('presented');
    });
  });
});
```

### 7.3 Non-Exhaustive Animation Tests

```typescript
it('presents and dismisses (high-level)', async () => {
  const store = new TestStore({
    initialState,
    reducer: inventoryReducer
  });
  store.exhaustivity = 'off';

  // Present
  await store.send({ type: 'addButtonTapped' });
  expect(store.getState().presentation.status).toBe('presenting');

  // Wait for animation (in real time or fast-forward)
  await new Promise(resolve => setTimeout(resolve, 350));

  // Should be presented now
  expect(store.getState().presentation.status).toBe('presented');

  // Dismiss
  await store.send({ type: 'closeButtonTapped' });

  // Wait for dismissal
  await new Promise(resolve => setTimeout(resolve, 250));

  // Should be idle
  expect(store.getState().presentation.status).toBe('idle');
});
```

---

## 8. Advanced Patterns

### 8.0 Motion One Integration (Optional - Post-1.0)

**Note**: This section describes optional Motion One integration for advanced animations. This is **not required for v1.0.0** release.

For users who need spring physics or gesture-driven animations, provide opt-in Motion One support:

```svelte
<!-- lib/composable/navigation-components/MotionModal.svelte -->
<script lang="ts">
  import type { PresentationState } from '$lib/composable/navigation';

  interface Props {
    presentation: PresentationState<any>;
    spring?: { stiffness: number; damping: number };
    onPresentationComplete?: () => void;
    onDismissalComplete?: () => void;
  }

  let { presentation, spring, onPresentationComplete, onDismissalComplete } = $props();

  const shouldMount = $derived(presentation.status !== 'idle');

  async function animateIn(node: HTMLElement) {
    const { animate, spring: springEasing } = await import('motion');

    const animation = animate(
      node,
      { opacity: [0, 1], scale: [0.95, 1] },
      {
        easing: springEasing({
          stiffness: spring?.stiffness ?? 300,
          damping: spring?.damping ?? 30
        })
      }
    );

    await animation.finished;
    onPresentationComplete?.();
  }

  async function animateOut(node: HTMLElement) {
    const { animate } = await import('motion');

    const animation = animate(
      node,
      { opacity: 0, scale: 0.95 },
      { duration: 0.2 }
    );

    await animation.finished;
    onDismissalComplete?.();
  }
</script>

{#if shouldMount}
  <div use:animateIn use:animateOut>
    <slot />
  </div>
{/if}
```

**Usage**:
```svelte
<MotionModal
  presentation={state.presentation}
  spring={{ stiffness: 400, damping: 35 }}
/>
```

**Benefits of Motion One**:
- Spring physics with natural motion
- Gesture-driven animations (drag to dismiss)
- Web Animations API (GPU-accelerated)
- Small bundle (~5kb when used)

**When to use**:
- Complex multi-stage animations
- Natural spring physics needed
- Gesture-driven interactions
- Performance-critical animations

**Recommendation**: Start with Svelte transitions. Add Motion One only if users request advanced features.

### 8.1 Animation State Machine

**Note**: This example shows a potential future state machine API for complex animations. For now, use the explicit state transitions shown in section 3.

```typescript
// Future: Formal state machine API for complex animations
// import { createMachine } from '$lib/composable/state-machine';

const presentationMachine = createMachine({
  initial: 'idle',
  states: {
    idle: {
      on: {
        PRESENT: 'presenting'
      }
    },
    presenting: {
      on: {
        COMPLETE: 'presented',
        CANCEL: 'dismissing'
      },
      after: {
        300: 'presented'  // Auto-transition after 300ms
      }
    },
    presented: {
      on: {
        DISMISS: 'dismissing',
        PRESENT: 'presenting'  // Can switch to new content
      }
    },
    dismissing: {
      on: {
        COMPLETE: 'idle',
        PRESENT: 'presenting'  // Can interrupt
      },
      after: {
        200: 'idle'
      }
    }
  }
});

// Use in reducer
case 'addButtonTapped': {
  const [nextPhase, effects] = presentationMachine.transition(
    state.presentation.phase,
    'PRESENT'
  );

  return [
    {
      ...state,
      presentation: { phase: nextPhase, content: destination }
    },
    effects
  ];
}
```

### 8.2 Custom Easing Functions

```typescript
// Define easing in state, apply in view
interface PresentationState<T> {
  status: 'presenting' | 'presented' | 'dismissing' | 'idle';
  content: T | null;
  easing?: {
    type: 'spring' | 'ease-in-out' | 'cubic-bezier';
    params?: any;
  };
}

// In reducer
return [
  {
    ...state,
    presentation: {
      status: 'presenting',
      content: destination,
      easing: {
        type: 'spring',
        params: { stiffness: 300, damping: 30 }
      }
    }
  },
  Effect.none()
];

// In view
{#if presentation.status === 'presenting'}
  <div
    in:customTransition={{
      easing: presentation.easing
    }}
  >
    Content
  </div>
{/if}
```

### 8.3 Gesture-Driven Animations

```typescript
// Track gesture progress in state
interface PresentationState<T> {
  status: 'presenting' | 'presented' | 'dismissing' | 'idle';
  content: T | null;
  gestureProgress?: number; // 0-1
}

// User starts gesture
case 'dragStarted':
  return [
    {
      ...state,
      presentation: {
        ...state.presentation,
        gestureProgress: 0
      }
    },
    Effect.none()
  ];

// User drags
case 'dragMoved':
  return [
    {
      ...state,
      presentation: {
        ...state.presentation,
        gestureProgress: action.progress
      }
    },
    Effect.none()
  ];

// User completes gesture
case 'dragEnded':
  if (action.progress > 0.5) {
    // Dismiss
    return [
      {
        ...state,
        presentation: {
          status: 'dismissing',
          content: state.presentation.content
        }
      },
      Effect.animated({
        duration: 200,
        onComplete: { type: 'presentation', event: { type: 'dismissalCompleted' } }
      })
    ];
  } else {
    // Snap back
    return [
      {
        ...state,
        presentation: {
          ...state.presentation,
          gestureProgress: undefined
        }
      },
      Effect.none()
    ];
  }
```

### 8.4 Page Transition Coordinator

```typescript
// Coordinate page transitions with navigation
interface AppState {
  currentPage: Page;
  nextPage: Page | null;
  pageTransition: {
    status: 'idle' | 'exiting' | 'entering';
    direction: 'forward' | 'backward';
  };
}

case 'navigateToPage': {
  return [
    {
      ...state,
      nextPage: action.page,
      pageTransition: {
        status: 'exiting',
        direction: 'forward'
      }
    },
    Effect.animated({
      duration: 300,
      onComplete: { type: 'pageTransition', event: 'exitComplete' }
    })
  ];
}

case 'pageTransition': {
  if (action.event === 'exitComplete') {
    return [
      {
        ...state,
        currentPage: state.nextPage!,
        nextPage: null,
        pageTransition: {
          status: 'entering',
          direction: state.pageTransition.direction
        }
      },
      Effect.animated({
        duration: 300,
        onComplete: { type: 'pageTransition', event: 'enterComplete' }
      })
    ];
  }

  if (action.event === 'enterComplete') {
    return [
      {
        ...state,
        pageTransition: {
          status: 'idle',
          direction: state.pageTransition.direction
        }
      },
      Effect.none()
    ];
  }
}
```

---

## 9. Performance

### 9.1 Optimization Strategies

**1. Avoid Unnecessary Re-renders**
```svelte
<script>
  // Only derive what's needed
  const isAnimating = $derived(
    presentation.status === 'presenting' ||
    presentation.status === 'dismissing'
  );

  // Don't derive entire content if not needed
  const shouldRenderContent = $derived(
    presentation.status !== 'idle'
  );
</script>

{#if shouldRenderContent}
  <!-- Only in DOM when needed -->
  <div class:animating={isAnimating}>
    <Content />
  </div>
{/if}
```

**2. Use CSS Transitions for Simple Animations**
```svelte
<script>
  const isPresented = $derived(presentation.status === 'presented');
</script>

<div class="modal" class:visible={isPresented}>
  <!-- CSS handles animation -->
</div>

<style>
  .modal {
    opacity: 0;
    transform: scale(0.95);
    transition: opacity 300ms, transform 300ms;
  }

  .modal.visible {
    opacity: 1;
    transform: scale(1);
  }
</style>
```

**3. Debounce Rapid State Changes**
```typescript
// Store debounce timers in state to cancel on rapid changes
interface State {
  presentation: PresentationState<any>;
  pendingToggle: boolean;
}

case 'quickToggle': {
  // Mark pending, actual toggle happens after debounce
  return [
    { ...state, pendingToggle: true },
    Effect.afterDelay(100, (dispatch) => {
      // Only toggle if still pending
      if (state.pendingToggle) {
        dispatch({ type: 'actualToggle' });
      }
    })
  ];
}

case 'actualToggle': {
  return [
    { ...state, pendingToggle: false, /* toggle state */ },
    Effect.none()
  ];
}
```

### 9.2 Animation Performance Metrics

Target metrics:
- **State update**: < 1ms
- **Effect creation**: < 0.5ms
- **Animation frame**: 60fps (16.67ms per frame)
- **Total presentation time**: < 350ms
- **Total dismissal time**: < 250ms

### 9.3 Profiling Animations

```typescript
// Add timing to presentation state
interface PresentationState<T> {
  status: 'presenting' | 'presented' | 'dismissing' | 'idle';
  content: T | null;
  timing?: {
    startedAt: number;
    completedAt?: number;
    duration?: number;
  };
}

// Track in reducer
case 'addButtonTapped': {
  return [
    {
      ...state,
      presentation: {
        status: 'presenting',
        content: destination,
        timing: {
          startedAt: Date.now()
        }
      }
    },
    Effect.none()
  ];
}

case 'presentation': {
  if (action.event.type === 'presentationCompleted') {
    const startedAt = state.presentation.timing?.startedAt ?? Date.now();
    const completedAt = Date.now();

    return [
      {
        ...state,
        presentation: {
          status: 'presented',
          content: state.presentation.content,
          timing: {
            startedAt,
            completedAt,
            duration: completedAt - startedAt
          }
        }
      },
      Effect.run(async () => {
        // Fire-and-forget analytics tracking
        analytics.track('animation_completed', {
          duration: completedAt - startedAt
        });
      })
    ];
  }
}
```

---

## 10. Component Library

### 10.1 Provided Components

```typescript
// lib/composable/navigation-components/index.ts

export { default as Modal } from './Modal.svelte';
export { default as Sheet } from './Sheet.svelte';
export { default as Drawer } from './Drawer.svelte';
export { default as Popover } from './Popover.svelte';
export { default as Alert } from './Alert.svelte';
export { default as NavigationStack } from './NavigationStack.svelte';

// Animation helpers
export { default as Animated } from './Animated.svelte';
export { default as Fade } from './Fade.svelte';
export { default as Scale } from './Scale.svelte';
export { default as Slide } from './Slide.svelte';
```

### 10.2 Generic Animated Wrapper

```svelte
<!-- lib/composable/navigation-components/Animated.svelte -->
<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';
  import type { PresentationState } from '$lib/composable/navigation';

  interface Props {
    presentation: PresentationState<T>;
    onIntro?: () => void;
    onOutro?: () => void;
    intro?: (node: Element, params?: any) => any;
    outro?: (node: Element, params?: any) => any;
    children: Snippet<[T]>;
  }

  let {
    presentation,
    onIntro,
    onOutro,
    intro,
    outro,
    children
  }: Props = $props();

  const shouldMount = $derived(presentation.status !== 'idle');
  const isVisible = $derived(
    presentation.status === 'presenting' ||
    presentation.status === 'presented'
  );
</script>

{#if shouldMount && presentation.content}
  {#if isVisible}
    <div
      in:intro
      out:outro
      onintroend={onIntro}
      onoutroend={onOutro}
    >
      {@render children(presentation.content)}
    </div>
  {/if}
{/if}
```

---

## 11. Migration Guide

### 11.1 From Imperative Animations

```typescript
// Before: Imperative
let isOpen = $state(false);
let isAnimating = $state(false);

async function open() {
  isAnimating = true;
  isOpen = true;
  await sleep(300);
  isAnimating = false;
}

async function close() {
  isAnimating = true;
  await sleep(200);
  isOpen = false;
  isAnimating = false;
}

// After: Declarative
interface State {
  presentation: PresentationState<Content>;
}

case 'open':
  return [
    { ...state, presentation: { status: 'presenting', content } },
    Effect.animated({
      duration: 300,
      onComplete: { type: 'presentation', event: { type: 'presentationCompleted' } }
    })
  ];

case 'close':
  return [
    { ...state, presentation: { status: 'dismissing', content: state.presentation.content } },
    Effect.animated({
      duration: 200,
      onComplete: { type: 'presentation', event: { type: 'dismissalCompleted' } }
    })
  ];
```

---

## 12. API Summary

### State Types

```typescript
type PresentationState<T> =
  | { status: 'idle' }
  | { status: 'presenting'; content: T; duration?: number }
  | { status: 'presented'; content: T }
  | { status: 'dismissing'; content: T; duration?: number };

type PresentationEvent =
  | { type: 'presentationStarted' }
  | { type: 'presentationCompleted' }
  | { type: 'dismissalStarted' }
  | { type: 'dismissalCompleted' };
```

### Effect Helpers

```typescript
Effect.afterDelay(ms: number, create: (dispatch) => void): Effect<A>
Effect.animated(config: { duration: number; onComplete: A }): Effect<A>
Effect.transition(config: TransitionConfig): { present: Effect<A>; dismiss: Effect<A> }
```

### Components

```typescript
<Modal store={store} presentationPath="presentation">
<Sheet store={store} presentationPath="presentation">
<Drawer store={store} presentationPath="presentation" side="left|right">
<Animated presentation={state.presentation}>
```

---

## Implementation Summary

### Phase 4 (v1.0.0 - REQUIRED)
**Animation Driver**: Svelte built-in transitions
- ✅ Use `transition:scale`, `transition:fade`, `transition:slide` from `svelte/transition`
- ✅ Use `onintroend` / `onoutroend` for lifecycle events
- ✅ Built-in easing functions from `svelte/easing`
- ✅ Zero additional dependencies
- ✅ Implement Modal, Sheet, Drawer, Alert components

### Post-1.0 (OPTIONAL)
**Advanced Driver**: Motion One integration
- Optional peer dependency for spring physics
- Opt-in via component props or separate component (`MotionModal`)
- Dynamic import to avoid bundling for non-users
- See section 8.0 for implementation details

**Priority**: Ship v1.0.0 with Svelte transitions. Add Motion One only if users request it.

---

**End of Animation Integration Specification**
