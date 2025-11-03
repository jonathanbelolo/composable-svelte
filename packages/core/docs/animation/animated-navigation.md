# Animated Navigation

State-driven animation system for Composable Svelte navigation components.

## Table of Contents

1. [Overview](#overview)
2. [Animation System Architecture](#animation-system-architecture)
3. [PresentationState Lifecycle](#presentationstate-lifecycle)
4. [Animation Helpers](#animation-helpers)
5. [Effect.afterDelay() for Timing](#effectafterdelay-for-timing)
6. [State Guards](#state-guards)
7. [Timeout Fallbacks](#timeout-fallbacks)
8. [Integration with Navigation Components](#integration-with-navigation-components)
9. [Testing Animated Features](#testing-animated-features)
10. [CSS Animations vs Motion One](#css-animations-vs-motion-one)
11. [Best Practices](#best-practices)
12. [Common Pitfalls](#common-pitfalls)

## Overview

Composable Svelte provides a **state-driven animation system** where animations are controlled through state transitions rather than imperative commands. This approach enables:

- **Predictable Timing**: Animation state is tracked explicitly
- **Full Testability**: Test animation lifecycles without running actual animations
- **Coordination**: Sequence multiple animations declaratively
- **Cancellation**: Interrupt animations by changing state
- **Time-Travel Debugging**: See exact animation state at any point

### Key Principles

1. **Animations are State**: Animation lifecycle is part of your domain state
2. **Declarative Intent**: State declares what should animate, components handle how
3. **Separate Concerns**: Logical state (`destination`) is separate from animation state (`presentation`)
4. **Type-Safe**: Full TypeScript support for animation lifecycles

### Quick Example

```typescript
// State includes both logical destination and animation lifecycle
interface FeatureState {
  destination: AddItemState | null;  // What to show
  presentation: PresentationState<AddItemState>;  // Animation lifecycle
}

// Actions include presentation events
type FeatureAction =
  | { type: 'addButtonTapped' }
  | { type: 'closeButtonTapped' }
  | { type: 'presentation'; event: PresentationEvent };

// Reducer manages lifecycle
case 'addButtonTapped': {
  return [
    {
      ...state,
      destination: initialAddItemState,
      presentation: {
        status: 'presenting',
        content: initialAddItemState,
        duration: 300
      }
    },
    Effect.afterDelay(300, (d) => d({
      type: 'presentation',
      event: { type: 'presentationCompleted' }
    }))
  ];
}
```

## Animation System Architecture

### Motion One Foundation

Composable Svelte uses **Motion One** as its animation engine, providing:

- **Spring Physics**: Natural, realistic motion via visual duration and bounce
- **GPU Acceleration**: Smooth 60fps animations using Web Animations API
- **Small Bundle Size**: ~5kb minified + gzipped
- **Promise-Based**: Await animation completion for coordination
- **Type-Safe**: Full TypeScript support

### Why Motion One?

```typescript
// Declarative spring configuration
const config = {
  visualDuration: 0.3,  // Seconds, not milliseconds!
  bounce: 0.25          // 0 = no bounce, 1 = very bouncy
};

// GPU-accelerated transform animations
await animate(
  element,
  { opacity: [0, 1], scale: [0.95, 1] },
  { type: 'spring', ...config }
).finished;
```

Motion One abstracts complex spring physics into two intuitive parameters that map to how animations feel visually.

### Animation Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      FEATURE STATE                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  destination: DestinationState | null                       │
│  ┌─────────────────────────────────────────┐               │
│  │ Logical Destination (WHAT)              │               │
│  │ - Which screen to show                  │               │
│  │ - Data for that screen                  │               │
│  │ - Remains set during dismissal          │               │
│  └─────────────────────────────────────────┘               │
│                                                             │
│  presentation: PresentationState<DestinationState>          │
│  ┌─────────────────────────────────────────┐               │
│  │ Animation Lifecycle (HOW)               │               │
│  │ - idle | presenting | presented |       │               │
│  │   dismissing                            │               │
│  │ - Duration for timeout fallbacks        │               │
│  │ - Independent of destination data       │               │
│  └─────────────────────────────────────────┘               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         │                                          │
         │                                          │
         ▼                                          ▼
┌─────────────────────┐                  ┌──────────────────┐
│   REDUCER LOGIC     │                  │   COMPONENT      │
│                     │                  │   (View Layer)   │
│ - State transitions │                  │                  │
│ - Effect.afterDelay │                  │ - Motion One     │
│ - State guards      │                  │ - $effect()      │
│ - Timeout fallbacks │                  │ - Animation fns  │
└─────────────────────┘                  └──────────────────┘
```

### Dual-Field Pattern

**Why separate `destination` and `presentation`?**

```typescript
// During dismissal, destination is STILL SET
{
  destination: { type: 'addItem', name: 'Coffee', quantity: 2 },
  presentation: { status: 'dismissing', content: {...}, duration: 200 }
}
// Component needs destination data to animate it out!
// Both cleared atomically when dismissal completes.
```

This pattern ensures:
- Components can render destination data during exit animations
- Animation state is explicit and inspectable
- State transitions are atomic and predictable

## PresentationState Lifecycle

### The Four States

PresentationState tracks animation through four explicit states:

```typescript
type PresentationState<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'presenting'; readonly content: T; readonly duration?: number }
  | { readonly status: 'presented'; readonly content: T }
  | { readonly status: 'dismissing'; readonly content: T; readonly duration?: number };
```

### Lifecycle Diagram

```
    User Action               Animation Complete
         │                           │
         ▼                           ▼
┌──────────────┐          ┌──────────────────┐
│     IDLE     │────────▶ │   PRESENTING     │
│              │          │  (animating in)  │
└──────────────┘          └──────────────────┘
         ▲                           │
         │                           │
         │                           ▼
         │                ┌──────────────────┐
         │                │    PRESENTED     │
         │                │  (fully visible) │
         │                └──────────────────┘
         │                           │
         │                           │ User dismisses
         │                           ▼
┌──────────────┐          ┌──────────────────┐
│     IDLE     │◀─────────│   DISMISSING     │
│              │          │  (animating out) │
└──────────────┘          └──────────────────┘
    Animation Complete
```

### State Transitions in Code

```typescript
// 1. IDLE → PRESENTING (user action)
case 'openModal': {
  return [
    {
      ...state,
      destination: initialAddItemState,
      presentation: {
        status: 'presenting',
        content: initialAddItemState,
        duration: 300  // For timeout fallback (2-3x = 600-900ms)
      }
    },
    Effect.afterDelay(300, (d) => d({
      type: 'presentation',
      event: { type: 'presentationCompleted' }
    }))
  ];
}

// 2. PRESENTING → PRESENTED (animation complete)
case 'presentation': {
  if (action.event.type === 'presentationCompleted') {
    // Guard: only transition if we're actually presenting
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

// 3. PRESENTED → DISMISSING (user dismisses)
case 'closeModal': {
  // Guard: only dismiss when fully presented
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
    Effect.afterDelay(200, (d) => d({
      type: 'presentation',
      event: { type: 'dismissalCompleted' }
    }))
  ];
}

// 4. DISMISSING → IDLE (animation complete)
case 'presentation': {
  if (action.event.type === 'dismissalCompleted') {
    // Guard: only transition if we're actually dismissing
    if (state.presentation.status !== 'dismissing') {
      return [state, Effect.none()];
    }

    return [
      {
        ...state,
        destination: null,  // Clear both atomically
        presentation: { status: 'idle' }
      },
      Effect.none()
    ];
  }
}
```

### PresentationEvent Types

```typescript
type PresentationEvent =
  | { readonly type: 'presentationStarted' }      // Optional
  | { readonly type: 'presentationCompleted' }    // Required
  | { readonly type: 'dismissalStarted' }         // Optional
  | { readonly type: 'dismissalCompleted' }       // Required
  | { readonly type: 'presentationTimeout' }      // Fallback
  | { readonly type: 'dismissalTimeout' };        // Fallback
```

Only `presentationCompleted` and `dismissalCompleted` are required. The others are for advanced coordination and error recovery.

## Animation Helpers

### Spring Configuration

All animation helpers accept optional spring configuration:

```typescript
interface SpringConfig {
  visualDuration?: number;  // In SECONDS (not milliseconds!)
  bounce?: number;          // 0 = no bounce, 1 = very bouncy
}
```

### Spring Presets

```typescript
import { springPresets } from '@composable-svelte/core/animation';

springPresets.modal    // { visualDuration: 0.3, bounce: 0.25 }
springPresets.sheet    // { visualDuration: 0.35, bounce: 0.3 }
springPresets.drawer   // { visualDuration: 0.35, bounce: 0.25 }
springPresets.alert    // { visualDuration: 0.25, bounce: 0.2 }
springPresets.tooltip  // { visualDuration: 0.15, bounce: 0.1 }
springPresets.toast    // { visualDuration: 0.4, bounce: 0.3 }
```

### Modal Animations

```typescript
import {
  animateModalIn,
  animateModalOut,
  animateBackdropIn,
  animateBackdropOut
} from '@composable-svelte/core/animation';

// Animate modal in (scale + fade)
await animateModalIn(modalElement);
await animateModalIn(modalElement, { visualDuration: 0.2 });

// Animate modal out
await animateModalOut(modalElement);

// Animate backdrop (fade only)
await animateBackdropIn(backdropElement);
await animateBackdropOut(backdropElement);
```

**Key Detail**: Modal animations preserve CSS `translate(-50%, -50%)` centering by composing transforms:

```typescript
// From animate.ts
{
  transform: [
    'translate(-50%, -50%) scale(0.95)',
    'translate(-50%, -50%) scale(1)'
  ]
}
```

### Sheet Animations

```typescript
import { animateSheetIn, animateSheetOut } from '@composable-svelte/core/animation';

// Slide from bottom (default)
await animateSheetIn(sheetElement);
await animateSheetIn(sheetElement, 'bottom');

// Slide from left
await animateSheetIn(sheetElement, 'left');

// Slide from right with custom config
await animateSheetIn(sheetElement, 'right', { bounce: 0.4 });

// Animate out (reverses direction)
await animateSheetOut(sheetElement, 'bottom');
```

### Drawer Animations

```typescript
import { animateDrawerIn, animateDrawerOut } from '@composable-svelte/core/animation';

// Slide from left (default)
await animateDrawerIn(drawerElement);
await animateDrawerIn(drawerElement, 'left');

// Slide from right
await animateDrawerIn(drawerElement, 'right');

// Custom spring
await animateDrawerIn(drawerElement, 'left', {
  visualDuration: 0.4,
  bounce: 0.3
});

await animateDrawerOut(drawerElement, 'left');
```

### Alert Animations

```typescript
import { animateAlertIn, animateAlertOut } from '@composable-svelte/core/animation';

// Subtle scale + fade (less dramatic than modal)
await animateAlertIn(alertElement);
await animateAlertOut(alertElement);
```

Alerts use `scale(0.98)` instead of `scale(0.95)` for a more subtle entrance.

### Tooltip Animations

```typescript
import { animateTooltipIn, animateTooltipOut } from '@composable-svelte/core/animation';

// Very fast animations (visualDuration: 0.15s)
await animateTooltipIn(tooltipElement);
await animateTooltipOut(tooltipElement);  // 30% faster exit
```

### Toast Animations

```typescript
import { animateToastIn, animateToastOut } from '@composable-svelte/core/animation';

// Scale + fade + slide
await animateToastIn(toastElement);
await animateToastOut(toastElement);
```

### Popover Animations

```typescript
import { animatePopoverIn, animatePopoverOut } from '@composable-svelte/core/animation';

// Preserves positioning transforms
await animatePopoverIn(popoverElement);

// With positioning transform from floating-ui
const positionTransform = 'translateX(10px) translateY(-5px)';
await animatePopoverIn(popoverElement, positionTransform);
await animatePopoverOut(popoverElement, positionTransform);
```

### NavigationStack Animations

```typescript
import {
  animateStackPushIn,
  animateStackPushOut,
  animateStackPopIn,
  animateStackPopOut
} from '@composable-svelte/core/animation';

// Push: new screen slides in from right
await animateStackPushIn(newScreenElement);

// Push: previous screen slides slightly left (depth effect)
await animateStackPushOut(previousScreenElement);

// Pop: current screen slides out to right
await animateStackPopOut(currentScreenElement);

// Pop: previous screen slides back from left
await animateStackPopIn(previousScreenElement);
```

iOS-style navigation with parallax depth effect.

### Accordion/Collapsible Animations

```typescript
import {
  animateAccordionExpand,
  animateAccordionCollapse
} from '@composable-svelte/core/animation';

// Height + fade animations
await animateAccordionExpand(contentElement);
await animateAccordionCollapse(contentElement);
```

Uses cubic bezier easing instead of springs for smoother height transitions.

### Error Handling

All animation helpers catch errors and log them without throwing:

```typescript
try {
  await animateModalIn(element);
} catch (error) {
  console.error('[animateModalIn] Animation failed:', error);
  // Element is still visible - animation failure doesn't break UI
}
```

This ensures animation failures are gracefully handled and don't crash your application.

## Effect.afterDelay() for Timing

### Purpose

`Effect.afterDelay()` schedules an action to be dispatched after a specified delay. This is the primary mechanism for transitioning between animation states.

```typescript
Effect.afterDelay(ms: number, create: (dispatch) => void): Effect<Action>
```

### Basic Usage

```typescript
// Dispatch action after 300ms
Effect.afterDelay(300, (dispatch) => {
  dispatch({
    type: 'presentation',
    event: { type: 'presentationCompleted' }
  });
});

// Shorthand with arrow function
Effect.afterDelay(300, (d) => d({
  type: 'presentation',
  event: { type: 'presentationCompleted' }
}));
```

### Animation State Transitions

```typescript
case 'openModal': {
  return [
    {
      ...state,
      destination: initialState,
      presentation: {
        status: 'presenting',
        content: initialState,
        duration: 300
      }
    },
    // Schedule presentationCompleted after animation duration
    Effect.afterDelay(300, (d) => d({
      type: 'presentation',
      event: { type: 'presentationCompleted' }
    }))
  ];
}
```

### Why Not Component Callbacks?

You might wonder why we use `Effect.afterDelay()` instead of waiting for component animation callbacks:

```typescript
// ❌ DON'T: Rely solely on component callbacks
// Component calls onPresentationComplete when animation finishes
<Modal
  onPresentationComplete={() => store.dispatch({...})}
/>

// ✅ DO: Use Effect.afterDelay() for state management
case 'openModal': {
  return [
    state,
    Effect.afterDelay(300, (d) => d({...}))  // Guaranteed timing
  ];
}
```

**Reasons**:
1. **Testability**: Tests can verify state transitions without running animations
2. **Predictability**: State changes happen at known times
3. **Timeout Fallbacks**: Can add longer delays as fallbacks (see next section)
4. **Coordination**: Can sequence multiple state changes declaratively

Components still dispatch callbacks, but they're supplementary to the Effect-based timing.

### Multiple Delays

```typescript
// Wait for multiple steps
case 'complexAnimation': {
  return [
    state,
    Effect.batch(
      Effect.afterDelay(300, (d) => d({ type: 'step1Complete' })),
      Effect.afterDelay(600, (d) => d({ type: 'step2Complete' })),
      Effect.afterDelay(900, (d) => d({ type: 'step3Complete' }))
    )
  ];
}
```

### Cancellation

Effects are automatically cancelled when superseded:

```typescript
case 'openModal': {
  return [
    state,
    Effect.afterDelay(300, ...)
  ];
}

case 'openModal': {
  // Dispatching openModal again cancels the previous afterDelay
  return [
    state,
    Effect.afterDelay(300, ...)  // New delay starts
  ];
}
```

## State Guards

### Purpose

State guards prevent invalid transitions by checking current state before applying actions. This is critical for animation safety.

### Basic Guards

```typescript
case 'closeModal': {
  // Guard: only allow dismissal when fully presented
  if (state.presentation.status !== 'presented') {
    return [state, Effect.none()];  // No-op
  }

  return [
    {
      ...state,
      presentation: { status: 'dismissing', ... }
    },
    Effect.afterDelay(200, ...)
  ];
}
```

### Guard Patterns

```typescript
// 1. Prevent actions during animation
case 'submitForm': {
  if (state.presentation.status === 'presenting' ||
      state.presentation.status === 'dismissing') {
    console.warn('[submitForm] Cannot submit during animation');
    return [state, Effect.none()];
  }
  // ... proceed with submission
}

// 2. Prevent double-dismissal
case 'presentation': {
  if (action.event.type === 'dismissalCompleted') {
    // Only process if we're actually dismissing
    if (state.presentation.status !== 'dismissing') {
      console.warn('[dismissalCompleted] Received but not dismissing');
      return [state, Effect.none()];
    }
    // ... proceed with cleanup
  }
}

// 3. Prevent re-presentation
case 'openModal': {
  // Don't re-open if already presenting or presented
  if (state.presentation.status !== 'idle') {
    console.warn('[openModal] Modal already active');
    return [state, Effect.none()];
  }
  // ... proceed with presentation
}

// 4. Validate content exists
case 'presentation': {
  if (action.event.type === 'presentationCompleted') {
    if (state.presentation.status !== 'presenting' ||
        !state.presentation.content) {
      return [state, Effect.none()];
    }
    // ... proceed with transition
  }
}
```

### Guard Best Practices

1. **Always guard state transitions**: Check current status before changing it
2. **Log guard triggers**: Help debug unexpected states
3. **Return no-op**: `[state, Effect.none()]` when guard blocks transition
4. **Guard early**: Check conditions at the top of case handlers
5. **Be defensive**: Multiple guards are better than one missed edge case

## Timeout Fallbacks

### Purpose

Animations can fail due to:
- Browser performance issues
- User interactions interrupting animations
- Component unmounting before completion
- Motion One errors

Timeout fallbacks ensure your app recovers from these failures.

### Fallback Pattern

```typescript
case 'openModal': {
  const duration = 300;  // Expected animation duration

  return [
    {
      ...state,
      presentation: {
        status: 'presenting',
        content: initialState,
        duration  // Store for timeout calculation
      }
    },
    Effect.batch(
      // Normal completion
      Effect.afterDelay(duration, (d) => d({
        type: 'presentation',
        event: { type: 'presentationCompleted' }
      })),

      // Timeout fallback (2-3x expected duration)
      Effect.afterDelay(duration * 2, (d) => d({
        type: 'presentation',
        event: { type: 'presentationTimeout' }
      }))
    )
  ];
}
```

### Handling Timeouts

```typescript
case 'presentation': {
  if (action.event.type === 'presentationCompleted' ||
      action.event.type === 'presentationTimeout') {

    if (state.presentation.status !== 'presenting') {
      return [state, Effect.none()];
    }

    // Log timeout for monitoring
    if (action.event.type === 'presentationTimeout') {
      console.warn('[Animation] Presentation timeout - forcing completion');
      // Optional: send analytics event
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

### Timeout Multipliers

```typescript
// Modal: 2x (critical UX)
Effect.afterDelay(300 * 2, ...)

// Sheet: 2.5x (larger elements, slower)
Effect.afterDelay(400 * 2.5, ...)

// Tooltip: 3x (very fast, higher variance)
Effect.afterDelay(150 * 3, ...)

// Complex animations: 3x (multiple steps)
Effect.afterDelay(600 * 3, ...)
```

### Cleanup Timeouts

Dismissal timeouts are even more important because they control cleanup:

```typescript
case 'closeModal': {
  const duration = 200;

  return [
    {
      ...state,
      presentation: { status: 'dismissing', content: state.presentation.content, duration }
    },
    Effect.batch(
      Effect.afterDelay(duration, (d) => d({
        type: 'presentation',
        event: { type: 'dismissalCompleted' }
      })),

      // Longer timeout for cleanup (3x)
      Effect.afterDelay(duration * 3, (d) => d({
        type: 'presentation',
        event: { type: 'dismissalTimeout' }
      }))
    )
  ];
}

case 'presentation': {
  if (action.event.type === 'dismissalTimeout') {
    console.error('[Animation] Dismissal timeout - forcing cleanup');
    // Force cleanup even if animation didn't complete
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

### Why Longer Dismissal Timeouts?

Dismissal timeouts should be longer (3x vs 2x) because:
- They control resource cleanup (memory leaks if stuck)
- User can't interact during stuck dismissal
- Better to wait longer than leak resources

## Integration with Navigation Components

### Component Contract

Navigation components expect:

1. **Scoped Store**: Store for destination content
2. **Presentation State**: Current animation lifecycle
3. **Callbacks**: `onPresentationComplete` and `onDismissalComplete`

### Modal Example

```typescript
import Modal from '@composable-svelte/core/navigation-components/Modal.svelte';

<Modal
  store={modalStore}
  presentation={state.presentation}
  onPresentationComplete={() => store.dispatch({
    type: 'presentation',
    event: { type: 'presentationCompleted' }
  })}
  onDismissalComplete={() => store.dispatch({
    type: 'presentation',
    event: { type: 'dismissalCompleted' }
  })}
>
  {#snippet children({ store: scopedStore })}
    <div>
      <h2>Modal Title</h2>
      <p>{scopedStore.state.message}</p>
      <button onclick={() => scopedStore.dismiss()}>Close</button>
    </div>
  {/snippet}
</Modal>
```

### Component Animation Logic

Inside the component:

```typescript
// Watch presentation status and trigger animations
$effect(() => {
  if (!presentation || !modalElement) return;

  if (presentation.status === 'presenting') {
    animateModalIn(modalElement, springConfig).then(() => {
      queueMicrotask(() => onPresentationComplete?.());
    });
  }

  if (presentation.status === 'dismissing') {
    animateModalOut(modalElement, springConfig).then(() => {
      queueMicrotask(() => onDismissalComplete?.());
    });
  }
});
```

### Visibility Logic

```typescript
// Component remains mounted during dismissing state
const visible = $derived(
  (store !== null && store.state !== null) ||
  (presentation?.status !== 'idle' && presentation?.status !== undefined)
);

// Only allow interactions when fully presented
const interactionsEnabled = $derived(
  presentation ? presentation.status === 'presented' : visible
);
```

### Complete Integration Example

```typescript
// State
interface AppState {
  addItemDestination: AddItemState | null;
  presentation: PresentationState<AddItemState>;
}

// Actions
type AppAction =
  | { type: 'addButtonTapped' }
  | { type: 'destination'; action: PresentationAction<AddItemAction> }
  | { type: 'presentation'; event: PresentationEvent };

// Reducer
const reducer: Reducer<AppState, AppAction> = (state, action) => {
  switch (action.type) {
    case 'addButtonTapped': {
      return [
        {
          ...state,
          addItemDestination: initialAddItemState,
          presentation: {
            status: 'presenting',
            content: initialAddItemState,
            duration: 300
          }
        },
        Effect.batch(
          Effect.afterDelay(300, (d) => d({
            type: 'presentation',
            event: { type: 'presentationCompleted' }
          })),
          Effect.afterDelay(600, (d) => d({
            type: 'presentation',
            event: { type: 'presentationTimeout' }
          }))
        )
      ];
    }

    case 'presentation': {
      if (action.event.type === 'presentationCompleted' ||
          action.event.type === 'presentationTimeout') {
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

      if (action.event.type === 'dismissalCompleted' ||
          action.event.type === 'dismissalTimeout') {
        if (state.presentation.status !== 'dismissing') {
          return [state, Effect.none()];
        }

        return [
          {
            ...state,
            addItemDestination: null,
            presentation: { status: 'idle' }
          },
          Effect.none()
        ];
      }

      return [state, Effect.none()];
    }

    case 'destination': {
      if (action.action.type === 'dismiss') {
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
          Effect.batch(
            Effect.afterDelay(200, (d) => d({
              type: 'presentation',
              event: { type: 'dismissalCompleted' }
            })),
            Effect.afterDelay(600, (d) => d({
              type: 'presentation',
              event: { type: 'dismissalTimeout' }
            }))
          )
        ];
      }

      // Handle presented child actions via ifLet
      return ifLet(...)(state, action);
    }
  }
};

// Component
<Modal
  store={addItemStore}
  presentation={state.presentation}
  onPresentationComplete={() => store.dispatch({
    type: 'presentation',
    event: { type: 'presentationCompleted' }
  })}
  onDismissalComplete={() => store.dispatch({
    type: 'presentation',
    event: { type: 'dismissalCompleted' }
  })}
>
  {#snippet children({ store: scopedStore })}
    <AddItemForm store={scopedStore} />
  {/snippet}
</Modal>
```

## Testing Animated Features

### TestStore Support

TestStore automatically handles animation timing:

```typescript
import { createTestStore } from '@composable-svelte/core';

const store = createTestStore({
  initialState,
  reducer
});

// Test presentation lifecycle
await store.send({ type: 'openModal' }, (state) => {
  expect(state.presentation.status).toBe('presenting');
  expect(state.destination).toBeDefined();
});

// TestStore automatically processes Effect.afterDelay
await store.receive({
  type: 'presentation',
  event: { type: 'presentationCompleted' }
}, (state) => {
  expect(state.presentation.status).toBe('presented');
});

// Test dismissal
await store.send({ type: 'closeModal' }, (state) => {
  expect(state.presentation.status).toBe('dismissing');
});

await store.receive({
  type: 'presentation',
  event: { type: 'dismissalCompleted' }
}, (state) => {
  expect(state.presentation.status).toBe('idle');
  expect(state.destination).toBeNull();
});
```

### Guard Testing

```typescript
// Test guard prevents invalid transition
await store.send({ type: 'closeModal' }, (state) => {
  // State unchanged (guard blocked it)
  expect(state.presentation.status).toBe('idle');
});

await store.send({ type: 'openModal' });
await store.receive({ type: 'presentation', event: { type: 'presentationCompleted' }});

// Now guard allows it
await store.send({ type: 'closeModal' }, (state) => {
  expect(state.presentation.status).toBe('dismissing');
});
```

### Timeout Testing

```typescript
// Test timeout fallback
await store.send({ type: 'openModal' });

// Skip to timeout event
await store.receive({
  type: 'presentation',
  event: { type: 'presentationTimeout' }
}, (state) => {
  expect(state.presentation.status).toBe('presented');
});
```

### Browser Tests (Playwright/Vitest Browser)

```typescript
import { test, expect } from '@playwright/test';

test('modal animates in', async ({ page }) => {
  await page.goto('/modal-demo');

  // Click to open
  await page.click('[data-testid="open-modal"]');

  // Wait for presenting state
  await expect(page.locator('[data-testid="presentation-status"]'))
    .toHaveText('presenting');

  // Wait for animation to complete
  await expect(page.locator('[data-testid="presentation-status"]'))
    .toHaveText('presented', { timeout: 1000 });

  // Verify modal is visible
  await expect(page.locator('[data-testid="modal-content"]'))
    .toBeVisible();
});
```

### Testing Animation Coordination

```typescript
// Test sequenced animations
await store.send({ type: 'showAll' });

await store.receive({ type: 'step1Complete' }, (state) => {
  expect(state.step1Done).toBe(true);
});

await store.receive({ type: 'step2Complete' }, (state) => {
  expect(state.step2Done).toBe(true);
});
```

## CSS Animations vs Motion One

### When to Use CSS Animations

Use pure CSS animations ONLY for:

1. **Infinite Loop Animations**
   ```css
   @keyframes spin {
     from { transform: rotate(0deg); }
     to { transform: rotate(360deg); }
   }

   .spinner {
     animation: spin 1s linear infinite;
   }
   ```

2. **Decorative Animations**
   ```css
   @keyframes shimmer {
     0% { background-position: -100% 0; }
     100% { background-position: 200% 0; }
   }

   .skeleton {
     animation: shimmer 2s ease-in-out infinite;
   }
   ```

3. **Performance-Critical (Case-by-Case)**
   ```css
   /* Carousel with state-driven currentIndex */
   .carousel-track {
     transform: translateX(calc(var(--index) * -100%));
     transition: transform 0.3s ease-out;
   }
   ```

### When to Use Motion One

Use Motion One for ALL lifecycle animations:

1. **Modal/Dialog** - Appear/disappear with PresentationState
2. **Dropdown/Popover** - Show/hide with state tracking
3. **Sheet/Drawer** - Slide in/out with lifecycle
4. **Accordion** - Expand/collapse with state
5. **Toast/Alert** - Enter/exit with coordination
6. **NavigationStack** - Push/pop with sequencing

### Why NOT CSS Transitions for Lifecycle?

```typescript
// ❌ BAD: CSS transition on hover
.button {
  transition: background-color 0.2s;
}

.button:hover {
  background: blue;
}
```

Problems:
- Cannot coordinate with other animations
- Not tracked in state (untestable)
- Cannot sequence or cancel
- No access to completion events

```typescript
// ✅ GOOD: Motion One for lifecycle
$effect(() => {
  if (state.presentation.status === 'presenting') {
    animateModalIn(element).then(() => {
      onPresentationComplete();
    });
  }
});
```

Benefits:
- Full state tracking
- Testable lifecycle
- Sequenceable and cancellable
- Completion callbacks

### Decision Tree

```
Does component have animation?
├─ NO → No animation code needed
└─ YES → What kind?
    ├─ Infinite loop (spinner/shimmer)
    │   └─ Use CSS @keyframes
    ├─ Hover/focus/click state changes
    │   └─ NO TRANSITION (instant feedback)
    └─ Lifecycle (appear/disappear/expand/collapse)
        └─ Use Motion One + PresentationState
```

## Best Practices

### 1. Always Use State Guards

```typescript
// ✅ GOOD
case 'closeModal': {
  if (state.presentation.status !== 'presented') {
    return [state, Effect.none()];
  }
  // ... proceed
}

// ❌ BAD
case 'closeModal': {
  return [
    { ...state, presentation: { status: 'dismissing', ... } },
    ...
  ];
}
```

### 2. Include Timeout Fallbacks

```typescript
// ✅ GOOD
Effect.batch(
  Effect.afterDelay(300, ...),  // Normal
  Effect.afterDelay(600, ...)   // Fallback
)

// ❌ BAD
Effect.afterDelay(300, ...)  // No fallback
```

### 3. Clear State Atomically

```typescript
// ✅ GOOD
return [
  {
    ...state,
    destination: null,
    presentation: { status: 'idle' }
  },
  Effect.none()
];

// ❌ BAD (destination cleared but presentation remains)
return [
  { ...state, destination: null },
  Effect.none()
];
```

### 4. Disable UI During Animation

```typescript
// ✅ GOOD
<button
  disabled={state.presentation.status === 'presenting' ||
            state.presentation.status === 'dismissing'}
>
  Submit
</button>

// ❌ BAD (allows actions during animation)
<button onclick={...}>Submit</button>
```

### 5. Log State Transitions

```typescript
// ✅ GOOD
case 'presentation': {
  if (action.event.type === 'presentationTimeout') {
    console.warn('[Modal] Presentation timeout - forcing completion');
  }
  // ...
}
```

### 6. Store Duration in State

```typescript
// ✅ GOOD
presentation: {
  status: 'presenting',
  content: data,
  duration: 300  // Used for timeout calculation
}

// Timeout = duration * 2
Effect.afterDelay(state.presentation.duration * 2, ...)
```

### 7. Use queueMicrotask for Callbacks

```typescript
// ✅ GOOD
animateModalIn(element).then(() => {
  queueMicrotask(() => onPresentationComplete?.());
});

// ❌ RISKY (callback may run during $effect)
animateModalIn(element).then(() => {
  onPresentationComplete?.();
});
```

### 8. Test Animation Lifecycles

```typescript
// ✅ GOOD: Test all four states
test('modal lifecycle', async () => {
  await store.send({ type: 'open' }, s => expect(s.presentation.status).toBe('presenting'));
  await store.receive(..., s => expect(s.presentation.status).toBe('presented'));
  await store.send({ type: 'close' }, s => expect(s.presentation.status).toBe('dismissing'));
  await store.receive(..., s => expect(s.presentation.status).toBe('idle'));
});
```

### 9. Handle Deep Linking

```typescript
// ✅ GOOD: Start in 'presented' state for deep links
if (initialDestination) {
  initialState = {
    destination: initialDestination,
    presentation: {
      status: 'presented',  // Skip animation
      content: initialDestination
    }
  };
}
```

### 10. Compose Transforms Carefully

```typescript
// ✅ GOOD: Preserve existing transforms
{
  transform: [
    'translate(-50%, -50%) scale(0.95)',
    'translate(-50%, -50%) scale(1)'
  ]
}

// ❌ BAD: Overwrites centering
{
  scale: [0.95, 1]  // Breaks translate(-50%, -50%)
}
```

## Common Pitfalls

### 1. Forgetting State Guards

```typescript
// ❌ Problem: Can dismiss while presenting
case 'closeModal': {
  return [
    { ...state, presentation: { status: 'dismissing', ... } },
    ...
  ];
}

// ✅ Solution: Guard the transition
case 'closeModal': {
  if (state.presentation.status !== 'presented') {
    return [state, Effect.none()];
  }
  // ...
}
```

### 2. No Timeout Fallbacks

```typescript
// ❌ Problem: Stuck in presenting state if animation fails
Effect.afterDelay(300, (d) => d({ type: 'presentationCompleted' }))

// ✅ Solution: Add timeout fallback
Effect.batch(
  Effect.afterDelay(300, (d) => d({ type: 'presentationCompleted' })),
  Effect.afterDelay(600, (d) => d({ type: 'presentationTimeout' }))
)
```

### 3. Not Clearing Destination

```typescript
// ❌ Problem: Memory leak, destination never cleared
case 'dismissalCompleted': {
  return [
    { ...state, presentation: { status: 'idle' } },
    Effect.none()
  ];
}

// ✅ Solution: Clear both atomically
case 'dismissalCompleted': {
  return [
    {
      ...state,
      destination: null,
      presentation: { status: 'idle' }
    },
    Effect.none()
  ];
}
```

### 4. Enabling Interactions Too Early

```typescript
// ❌ Problem: User can click during animation
{#if state.destination}
  <button onclick={...}>Submit</button>
{/if}

// ✅ Solution: Check presentation status
<button
  disabled={state.presentation.status !== 'presented'}
  onclick={...}
>
  Submit
</button>
```

### 5. Wrong Duration Units

```typescript
// ❌ Problem: Motion One uses SECONDS, not milliseconds
await animate(element, {...}, {
  type: 'spring',
  visualDuration: 300  // Wrong! Should be 0.3
});

// ✅ Solution: Use seconds
await animate(element, {...}, {
  type: 'spring',
  visualDuration: 0.3  // Correct
});
```

### 6. Breaking Existing Transforms

```typescript
// ❌ Problem: Modal centering breaks
await animate(element, {
  scale: [0.95, 1]  // Overwrites translate(-50%, -50%)
});

// ✅ Solution: Compose transforms
await animate(element, {
  transform: [
    'translate(-50%, -50%) scale(0.95)',
    'translate(-50%, -50%) scale(1)'
  ]
});
```

### 7. Missing Effect.batch()

```typescript
// ❌ Problem: Only one effect executes
return [
  state,
  Effect.afterDelay(300, ...),
  Effect.afterDelay(600, ...)  // Ignored!
];

// ✅ Solution: Use Effect.batch()
return [
  state,
  Effect.batch(
    Effect.afterDelay(300, ...),
    Effect.afterDelay(600, ...)
  )
];
```

### 8. Not Testing Guards

```typescript
// ❌ Problem: Guard not tested, breaks in production
test('close modal', async () => {
  await store.send({ type: 'closeModal' });
  // Assumes it works!
});

// ✅ Solution: Test guard blocks invalid state
test('close modal guard', async () => {
  // Try to close when not presented
  await store.send({ type: 'closeModal' }, (state) => {
    expect(state.presentation.status).toBe('idle');  // Unchanged
  });

  // Open and present
  await store.send({ type: 'openModal' });
  await store.receive({ type: 'presentationCompleted' });

  // Now close should work
  await store.send({ type: 'closeModal' }, (state) => {
    expect(state.presentation.status).toBe('dismissing');
  });
});
```

### 9. Dispatching in $effect Without queueMicrotask

```typescript
// ❌ Problem: Can cause infinite loops
$effect(() => {
  if (state.presentation.status === 'presenting') {
    animateIn(element).then(() => {
      onPresentationComplete();  // Dangerous!
    });
  }
});

// ✅ Solution: Use queueMicrotask
$effect(() => {
  if (state.presentation.status === 'presenting') {
    animateIn(element).then(() => {
      queueMicrotask(() => onPresentationComplete());
    });
  }
});
```

### 10. Hardcoding Timeouts

```typescript
// ❌ Problem: Timeout not synchronized with duration
case 'openModal': {
  return [
    { ...state, presentation: { ..., duration: 300 } },
    Effect.afterDelay(500, ...)  // Hardcoded!
  ];
}

// ✅ Solution: Calculate from duration
case 'openModal': {
  const duration = 300;
  return [
    { ...state, presentation: { ..., duration } },
    Effect.afterDelay(duration * 2, ...)  // Synchronized
  ];
}
```

---

## Summary

Composable Svelte's animation system provides:

- **State-Driven Architecture**: Animations are state transitions, not imperative commands
- **PresentationState Lifecycle**: Four explicit states (idle → presenting → presented → dismissing)
- **Motion One Integration**: Spring physics with GPU acceleration
- **Effect.afterDelay()**: Declarative timing for state transitions
- **State Guards**: Prevent invalid transitions
- **Timeout Fallbacks**: Recover from animation failures
- **Full Testability**: Test animation lifecycles without running animations
- **Type Safety**: Full TypeScript support

By following these patterns, you can build complex, coordinated animations that are:
- Predictable and debuggable
- Fully testable
- Resilient to failures
- Type-safe end-to-end

For more information, see:
- [Tree-Based Navigation](../navigation/tree-based.md)
- [Effects](../core-concepts/effects.md)
- [Testing](../core-concepts/testing.md)
