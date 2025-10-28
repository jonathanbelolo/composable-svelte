# Animation Guidelines for Composable Svelte

This document defines when and how to use animations in Composable Svelte components.

## Core Principle

**State-Driven Animation Requirement**: Any component with lifecycle animations (appearing, disappearing, expanding, collapsing) MUST use state-driven animations via our animation system. This enables animation choreography and maintains state consistency.

## When to Use Motion One (State-Driven)

### REQUIRED: Component Lifecycle Animations

Use Motion One with PresentationState for:

1. **Modal/Dialog Animations**
   - Fade in/out
   - Scale animations
   - Backdrop animations
   - Example: Modal, Sheet, Drawer, AlertDialog

2. **Dropdown/Popup Animations**
   - Appear/disappear
   - Slide/scale transitions
   - Example: DropdownMenu, Select, Combobox, Popover, Tooltip

3. **Expand/Collapse Animations**
   - Height transitions
   - Accordion items
   - Collapsible sections
   - Example: Accordion, Collapsible, TreeView

4. **Toast/Alert Animations**
   - Slide in from edge
   - Fade animations
   - Stacked toast coordination
   - Example: Toast, Alert

5. **Navigation Animations**
   - Page transitions
   - Stack push/pop
   - Example: NavigationStack

### Pattern: PresentationState Lifecycle

```typescript
// State includes presentation tracking
interface ComponentState {
  content: ContentType | null;
  presentation: PresentationState<ContentType>;
}

// Actions include presentation events
type ComponentAction =
  | { type: 'show'; content: ContentType }
  | { type: 'hide' }
  | { type: 'presentation'; event: PresentationEvent };

// Reducer manages lifecycle
case 'show': {
  return [
    {
      ...state,
      content,
      presentation: {
        status: 'presenting',
        content,
        duration: 0.3
      }
    },
    Effect.run(async (dispatch) => {
      await new Promise(r => setTimeout(r, 300));
      dispatch({
        type: 'presentation',
        event: { type: 'presentationCompleted' }
      });
    })
  ];
}

// Component uses Motion One
$effect(() => {
  if (!element) return;

  if (store.state.presentation.status === 'presenting') {
    animateIn(element).then(() => {
      store.dispatch({
        type: 'presentation',
        event: { type: 'presentationCompleted' }
      });
    });
  }
});
```

## When to Use CSS Animations (Exceptions)

### ALLOWED: Pure CSS Animations

CSS animations are acceptable for:

1. **Infinite Loop Animations**
   - Spinners
   - Progress indicators
   - Loading states
   - Example: Spinner component (@keyframes spin)

2. **Decorative Animations**
   - Skeleton shimmer effects
   - Background patterns
   - Non-interactive visual effects
   - Example: Skeleton component (@keyframes shimmer)

3. **Performance-Critical Transitions** (Case-by-Case)
   - High-frequency updates
   - 60fps requirements
   - GPU-accelerated transforms
   - Example: Carousel slides (UNDER REVIEW)

### Pattern: CSS Animation (Exceptions Only)

```css
/* ✅ GOOD: Infinite spinner animation */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spinner {
  animation: spin 1s linear infinite;
}

/* ✅ GOOD: Skeleton shimmer */
@keyframes shimmer {
  0% { background-position: -100% 0; }
  100% { background-position: 200% 0; }
}

.skeleton {
  animation: shimmer 2s ease-in-out infinite;
}
```

## When to AVOID CSS Transitions

### PROHIBITED: Hover/Interaction Transitions

**DO NOT** use CSS transitions for:

1. **Hover States**
   - Color changes
   - Background changes
   - Border changes

2. **Focus States**
   - Outline animations
   - Glow effects

3. **Click/Active States**
   - Button press feedback
   - Scale effects

### Rationale

These transitions:
- Cannot be coordinated with other animations
- Are not tracked in component state
- Violate the state-driven principle
- Make testing animation sequences impossible

### Examples

```css
/* ❌ BAD: CSS transitions removed */
.button {
  /* transition: background-color 0.2s; */ /* REMOVED */
}

.button:hover {
  background: #blue;
  /* Instant change - no transition */
}

/* ❌ BAD: Tailwind transition classes removed */
/* <div class="transition-colors duration-200"> */ /* REMOVED */
<div class="hover:bg-gray-100">
```

## Atomic Components (No Animation)

**Pattern A** components have ZERO animation:

- Badge
- Button
- Card
- Checkbox
- Input
- Label
- Radio
- Separator
- Slider
- Switch
- Textarea

These components are pure presentational and should provide instant visual feedback.

## Animation Choreography

### Why State-Driven Matters

State-driven animations enable parent components to coordinate multiple child animations:

```typescript
// Parent can sequence animations
case 'showAll': {
  return [
    {
      ...state,
      modalPresentation: { status: 'presenting', content, duration: 0.3 },
      formPresentation: { status: 'idle' } // Wait
    },
    Effect.run(async (dispatch) => {
      // Wait for modal to complete
      await new Promise(r => setTimeout(r, 300));

      // Then start form animation
      dispatch({ type: 'showForm' });
    })
  ];
}
```

Without state-driven animations, this coordination is impossible.

## Available Animation Functions

### Motion One Helpers

Located in `packages/core/src/animation/animate.ts`:

- `animateModalIn/Out(element)` - Modal/dialog animations
- `animateBackdropIn/Out(element)` - Backdrop fade
- `animateSheetIn/Out(element)` - Sheet slide from edge
- `animateDrawerIn/Out(element)` - Drawer slide
- `animateAlertIn/Out(element)` - Alert animations
- `animateTooltipIn/Out(element)` - Tooltip fade/scale
- `animateToastIn/Out(element)` - Toast slide from edge
- `animateDropdownIn/Out(element)` - Dropdown fade/scale
- `animateAccordionExpand/Collapse(element)` - Height transitions

### Adding New Animations

1. Add function to `animate.ts`
2. Use Motion One's `animate()` function
3. Return the animation promise
4. Example:

```typescript
export async function animateCustomIn(element: HTMLElement): Promise<void> {
  await animate(
    element,
    { opacity: [0, 1], scale: [0.95, 1] },
    { duration: 0.2, easing: 'ease-out' }
  ).finished;
}
```

## Decision Tree

```
Does component have animation?
├─ NO → Pattern A (Atomic) - No animation system needed
└─ YES → What kind of animation?
    ├─ Infinite loop (spinner, shimmer)
    │   └─ Use CSS @keyframes
    ├─ Hover/focus/click
    │   └─ NO TRANSITION - Instant feedback
    └─ Lifecycle (appear/disappear/expand/collapse)
        └─ Use Motion One + PresentationState
```

## Testing

### Testing State-Driven Animations

```typescript
// Test presentation lifecycle
await store.send({ type: 'show', content: data }, (state) => {
  expect(state.presentation.status).toBe('presenting');
});

await store.receive({
  type: 'presentation',
  event: { type: 'presentationCompleted' }
}, (state) => {
  expect(state.presentation.status).toBe('presented');
});
```

### Testing CSS Animations

CSS animations (spinners, skeletons) don't require state testing - they're purely visual.

## Migration Guide

### Removing CSS Transitions

If you find a component with CSS transitions:

1. **Identify the transition type**
   - Lifecycle? → Add PresentationState
   - Hover/focus? → Remove transition entirely

2. **For lifecycle transitions**
   - Add `presentation` field to state
   - Add `presentation` action to reducer
   - Implement lifecycle in reducer (presenting → presented → dismissing → idle)
   - Add Motion One animation in component $effect
   - Remove CSS transitions/animations

3. **For hover/focus/click**
   - Simply remove the transition
   - Keep the hover/focus styles
   - Visual change happens instantly

### Example: Calendar Fix

**Before** (Calendar.svelte):
```css
.calendar-day {
  transition: all 0.2s; /* REMOVED */
}

.calendar-day:hover {
  background: #f3f4f6;
}
```

**After**:
```css
.calendar-day {
  /* No transition */
}

.calendar-day:hover {
  background: #f3f4f6; /* Instant change */
}
```

## Documented Exceptions

### Current Exceptions

1. **Spinner** (Pattern A)
   - Uses: `@keyframes spin`
   - Rationale: Infinite loop, pure CSS acceptable

2. **Skeleton** (Pattern A)
   - Uses: `@keyframes shimmer`
   - Rationale: Infinite loop, pure CSS acceptable

3. **Progress** (Pattern A)
   - Uses: CSS for bar fills
   - Rationale: Pure visual, no lifecycle

### Approved Exceptions

1. **Carousel** (Pattern B)
   - Uses: CSS `transition-transform` for slide animations
   - Rationale:
     - **Performance**: 60fps transforms require GPU acceleration
     - **State-Driven**: `currentIndex` is managed via reducer (compliant)
     - **CSS Transform**: Using `transform: translateX()` which is GPU-accelerated
     - **Simplicity**: CSS transitions are more performant than JavaScript for this use case
   - Note: The animation is still state-driven (currentIndex in reducer), only the visual transition uses CSS for performance
   - Exception type: Performance-critical continuous transforms

## Summary

| Animation Type | Approach | Example |
|---------------|----------|---------|
| Lifecycle (Modal/Dialog) | Motion One + PresentationState | Modal, Sheet, Drawer |
| Lifecycle (Dropdown) | Motion One + PresentationState | DropdownMenu, Select |
| Lifecycle (Expand/Collapse) | Motion One + PresentationState | Accordion, Collapsible |
| Infinite Loop | CSS @keyframes | Spinner, Skeleton |
| Hover/Focus/Click | No transition (instant) | Button, Calendar, FileUpload |

## Questions?

When in doubt:
- **Does it appear/disappear/expand/collapse?** → Use Motion One + PresentationState
- **Is it an infinite loop?** → CSS @keyframes is OK
- **Is it hover/focus/click?** → No transition needed

---

*Last Updated: Phase 6 Architecture Review (2025)*
