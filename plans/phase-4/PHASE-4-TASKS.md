# Phase 4: Animation Integration - Detailed Task Breakdown

**Duration**: 2-3 weeks (60-80 hours)
**Deliverable**: `@composable-svelte/core@0.4.0` with Motion One-based animations
**Spec Reference**: `specs/frontend/animation-integration-spec.md`
**Status**: In Progress
**Last Updated**: 2025-10-27

---

## Overview

Phase 4 integrates **Motion One**-based animations into the navigation system, providing **state-driven**, spring-physics animations for all presentation components. This phase enforces a single, consistent animation approach throughout the architecture.

**Key Design Decisions**:

1. **Motion One Only** (no Svelte transitions)
   - Ensures one consistent way to animate across the library
   - Forces proper `PresentationState` lifecycle usage
   - Provides natural spring physics by default
   - GPU-accelerated via Web Animations API (~11kb tree-shakeable)

2. **State-Driven Animations** (not DOM-lifecycle driven)
   - Animations triggered by `$effect` watching `presentation.status` changes
   - NOT triggered by Svelte's mount/unmount lifecycle (`use:` actions)
   - Enables coordination between sequential/parallel animations
   - Makes animations deterministic, testable, and debuggable

**Core Principle**: Animations are STATE, not side effects. Animation lifecycle is tracked in reducers via `PresentationState<T>`, making animations fully testable and time-travel debuggable.

**Why State-Driven?**: Enables coordination that DOM-lifecycle animations cannot provide:
```typescript
// Sequential: Dismiss Modal A → Wait 300ms → Present Sheet B
// Parallel: Fade out modal + backdrop simultaneously
// Conditional: Only present B if A dismissed successfully (not cancelled)
// Staggered: Present modal, wait 100ms, present tooltip
```

---

## Major Milestones

1. **M4.1**: Foundation (Types & Effects) ✅ COMPLETE
2. **M4.2**: Motion One Integration (Package + Utils)
3. **M4.3**: Component Updates (Modal, Sheet, Drawer, Alert)
4. **M4.4**: Testing & Validation
5. **M4.5**: Example Migration & Documentation

---

## Section 1: Foundation (COMPLETE ✅)

### Task 4.1.1: Animation Types
**Estimated Time**: 1 hour ✅ DONE
**Dependencies**: None
**Files**: `packages/core/src/navigation/types.ts`

**Description**:
Define TypeScript types for animation lifecycle tracking. `PresentationState<T>` provides a discriminated union tracking the four-state animation lifecycle: idle → presenting → presented → dismissing → idle.

**What was done**:
- Added `PresentationState<T>` discriminated union type
- Added `PresentationEvent` type for lifecycle transitions
- Exported types from navigation and core modules
- Comprehensive JSDoc with lifecycle examples
- Documented dual-field pattern (destination + presentation)

**Spec Reference**: animation-integration-spec.md section 2.1-2.2

**Acceptance Criteria**:
- [x] `PresentationState<T>` has all four states (idle, presenting, presented, dismissing)
- [x] Optional `duration` field for presenting/dismissing states
- [x] `PresentationEvent` covers all lifecycle events
- [x] Types exported from core package
- [x] JSDoc explains why destination/presentation are separate fields

---

### Task 4.1.2: Effect Helpers
**Estimated Time**: 2 hours ✅ DONE
**Dependencies**: Task 4.1.1
**Files**: `packages/core/src/effect.ts`

**Description**:
Implement convenience Effect helpers for animation timing. `Effect.animated()` provides a clean API for duration-based state transitions, while `Effect.transition()` generates symmetric present/dismiss effect pairs.

**What was done**:
- Implemented `Effect.animated({ duration, onComplete })` helper
- Implemented `Effect.transition({ presentDuration?, dismissDuration?, createPresentationEvent })` helper
- Added validation for negative durations (throws TypeError)
- Comprehensive JSDoc with timeout fallback examples
- Defaults: 300ms present, 200ms dismiss

**Important**: These are library-agnostic - they work with ANY animation approach (Motion One, CSS, manual setTimeout, etc.). They just dispatch actions after durations.

**Spec Reference**: animation-integration-spec.md section 4.2-4.3

**Acceptance Criteria**:
- [x] `Effect.animated()` dispatches action after duration
- [x] `Effect.transition()` returns { present, dismiss } effect pair
- [x] Negative duration throws TypeError
- [x] Effects integrate with existing Effect.map() and Effect.batch()
- [x] JSDoc includes timeout fallback patterns

---

## Section 2: Motion One Integration

### Task 4.2.1: Install Motion One Dependency
**Estimated Time**: 0.5 hours
**Dependencies**: None
**Files**: `packages/core/package.json`

**Description**:
Add Motion One as a required dependency (NOT peer dependency). This enforces the architectural decision to use Motion One everywhere for consistency.

**What to do**:
- Add `motion` to dependencies (version `^11.11.17` or latest)
- Run `pnpm install` to verify installation
- Verify tree-shaking works (only `animate` and `spring` imported)
- Test bundle size impact (~5kb for core functions)

**Important**: Motion One is ~11kb full, but tree-shakeable. Core `animate()` + `spring()` is ~5kb. This is acceptable for the quality and consistency benefits.

**Acceptance Criteria**:
- [ ] `motion` added to `dependencies` (not `devDependencies` or `peerDependencies`)
- [ ] Package installs without errors
- [ ] Can import `{ animate, spring }` from `motion`
- [ ] Verify tree-shaking in build output

---

### Task 4.2.2: Create Animation Utility Functions
**Estimated Time**: 3 hours
**Dependencies**: Task 4.2.1
**Files**: `packages/core/src/navigation-components/utils/animate.ts`

**Description**:
Create reusable animation utility functions that wrap Motion One with opinionated defaults for the Composable Svelte architecture. These are **pure functions** that accept an element and return a Promise, designed to be called from component `$effect` blocks.

**What to do**:
- Create `animateModalIn(node, options?)` for modal presentation
- Create `animateModalOut(node, options?)` for modal dismissal
- Create `animateSheetIn(node, options?)` for sheet presentation (slide up/side)
- Create `animateSheetOut(node, options?)` for sheet dismissal
- Create `animateDrawerIn(node, options?)` for drawer presentation (slide left/right)
- Create `animateDrawerOut(node, options?)` for drawer dismissal
- Create `animateAlertIn(node, options?)` for alert presentation (subtle)
- Create `animateAlertOut(node, options?)` for alert dismissal
- Export default spring configurations for each component type
- Handle animation errors gracefully (catch, log, resolve Promise anyway)

**Default Spring Configurations**:
```typescript
export const springConfigs = {
  modal: { stiffness: 300, damping: 30 },    // Snappy
  sheet: { stiffness: 250, damping: 28 },    // Softer (larger movement)
  drawer: { stiffness: 280, damping: 25 },   // Smooth
  alert: { stiffness: 350, damping: 35 }     // Very snappy (subtle animation)
};
```

**Default Animations**:
- **Modal**: opacity (0→1) + scale (0.95→1)
- **Sheet**: opacity (0→1) + translateY (100%→0) or translateX (side sheets)
- **Drawer**: opacity (0→1) + translateX (-100%→0 or 100%→0)
- **Alert**: opacity (0→1) + scale (0.98→1) - subtle

**Error Handling Pattern**:
```typescript
export async function animateModalIn(
  node: HTMLElement,
  options?: Partial<SpringConfig>
): Promise<void> {
  try {
    await animate(
      node,
      { opacity: [0, 1], scale: [0.95, 1] },
      { easing: spring({ ...springConfigs.modal, ...options }) }
    ).finished;
  } catch (error) {
    // Log but don't throw - always resolve to prevent stuck states
    console.error('[animate] Modal animation failed:', error);
  }
}
```

**Important Design Decision**: Functions return `Promise<void>`, NOT the Animation object. This keeps the API simple and prevents misuse (users shouldn't cancel/pause manually - state controls everything).

**Spec Reference**: animation-integration-spec.md section 5.1-5.2, section 6 (error handling)

**Acceptance Criteria**:
- [ ] 8 animation functions exported (4 components × 2 directions)
- [ ] All functions return `Promise<void>`
- [ ] Default spring configs exported and documented
- [ ] Animation errors caught and logged (don't throw)
- [ ] Functions always resolve (even on error) to prevent stuck states
- [ ] JSDoc includes usage examples with `$effect`

---

### Task 4.2.3: Create Spring Configuration Types
**Estimated Time**: 1 hour
**Dependencies**: Task 4.2.2
**Files**: `packages/core/src/navigation-components/utils/spring-config.ts`

**Description**:
Define TypeScript types and helper functions for spring configuration. Provide validated spring config objects that can be passed to animation functions or overridden by users.

**What to do**:
- Define `SpringConfig` interface (stiffness, damping, duration?, mass?)
- Create `createSpringConfig()` helper with validation
- Export preset configs (modal, sheet, drawer, alert)
- Provide `mergeSpringConfig()` helper for user overrides
- Add JSDoc explaining spring physics parameters

**Spring Physics Parameters**:
```typescript
export interface SpringConfig {
  stiffness: number;  // Higher = snappier (100-500)
  damping: number;    // Higher = less bouncy (10-50)
  mass?: number;      // Weight of animated object (0.1-10, default 1)
  duration?: number;  // Max duration fallback (optional)
}
```

**Validation**:
- Stiffness must be > 0
- Damping must be > 0
- Mass must be > 0 (if provided)
- Duration must be >= 0 (if provided)

**Spec Reference**: Motion One documentation, animation-integration-spec.md section 5.2

**Acceptance Criteria**:
- [ ] `SpringConfig` interface defined with all parameters
- [ ] `createSpringConfig()` validates inputs (throws on invalid)
- [ ] `mergeSpringConfig()` safely overrides defaults
- [ ] Preset configs exported for each component
- [ ] JSDoc explains what each parameter does

---

## Section 3: Component Updates

### Task 4.3.1: Update Modal Component with State-Driven Animations
**Estimated Time**: 5 hours
**Dependencies**: Task 4.2.2, Task 4.2.3
**Files**: `packages/core/src/navigation-components/Modal.svelte`

**Description**:
Refactor Modal component to use Motion One animations driven by `PresentationState` lifecycle. Modal uses `$effect` to watch state changes and trigger animations, NOT Svelte's mount/unmount lifecycle.

**What to do**:
- Accept `presentation: PresentationState<any>` prop (replaces simple `store` usage)
- Accept `onPresentationComplete?: () => void` callback prop
- Accept `onDismissalComplete?: () => void` callback prop
- Accept `springConfig?: Partial<SpringConfig>` prop for overrides
- Create `contentElement: HTMLElement` binding
- Create `backdropElement: HTMLElement` binding
- Add `$effect` that watches `presentation.status` and triggers animations:
  - When `presenting`: Call `animateModalIn(contentElement, springConfig)` + `animateBackdropIn(backdropElement)`
  - When `dismissing`: Call `animateModalOut(contentElement, springConfig)` + `animateBackdropOut(backdropElement)`
  - Call appropriate callback when Promise resolves
- Only render when `presentation.status !== 'idle'`
- Keep content mounted during `dismissing` for exit animation

**Component Structure**:
```svelte
<script lang="ts">
  import { animateModalIn, animateModalOut, animateBackdropIn, animateBackdropOut } from './utils/animate';
  import type { PresentationState, SpringConfig } from '$lib/composable';

  interface Props {
    presentation: PresentationState<any>;
    onPresentationComplete?: () => void;
    onDismissalComplete?: () => void;
    springConfig?: Partial<SpringConfig>;
    disableClickOutside?: boolean;
    children: Snippet;
  }

  let {
    presentation,
    onPresentationComplete,
    onDismissalComplete,
    springConfig,
    disableClickOutside = false,
    children
  }: Props = $props();

  let contentElement: HTMLElement;
  let backdropElement: HTMLElement;

  // Watch presentation state and trigger animations
  $effect(() => {
    if (!contentElement || !backdropElement) return;

    if (presentation.status === 'presenting') {
      Promise.all([
        animateModalIn(contentElement, springConfig),
        animateBackdropIn(backdropElement)
      ]).then(() => {
        onPresentationComplete?.();
      });
    }

    if (presentation.status === 'dismissing') {
      Promise.all([
        animateModalOut(contentElement, springConfig),
        animateBackdropOut(backdropElement)
      ]).then(() => {
        onDismissalComplete?.();
      });
    }
  });

  function handleBackdropClick() {
    if (!disableClickOutside && presentation.status === 'presented') {
      onDismissalComplete?.();  // Let parent handle dismissal
    }
  }
</script>

{#if presentation.status !== 'idle'}
  <div
    bind:this={backdropElement}
    class="modal-backdrop"
    onclick={handleBackdropClick}
  >
    <div
      bind:this={contentElement}
      class="modal-content"
      onclick={(e) => e.stopPropagation()}
    >
      {@render children()}
    </div>
  </div>
{/if}
```

**Important Behavior**:
- Element renders when state becomes `presenting` (triggers animation)
- Element stays mounted through `presenting` → `presented` → `dismissing`
- Element unmounts when state becomes `idle` (after animation completes)
- Animations start via `$effect` watching status, NOT on mount
- Parent controls state transitions via presentation events

**Spec Reference**: animation-integration-spec.md section 5.2-5.3

**Acceptance Criteria**:
- [ ] Modal animates in with scale (0.95 → 1) + fade (0 → 1)
- [ ] Modal animates out with reverse animation
- [ ] Animations triggered by `$effect` watching `presentation.status`
- [ ] Callbacks fire when animations complete
- [ ] Backdrop animates independently (fade only)
- [ ] Spring physics configurable via props
- [ ] Component stays mounted during `dismissing`
- [ ] Content not mounted when `idle`

---

### Task 4.3.2: Update Sheet Component with State-Driven Animations
**Estimated Time**: 5 hours
**Dependencies**: Task 4.2.2, Task 4.2.3
**Files**: `packages/core/src/navigation-components/Sheet.svelte`

**Description**:
Refactor Sheet component to use Motion One animations driven by state. Sheet slides up from bottom (mobile) or from side (desktop) with spring physics.

**What to do**:
- Accept `presentation: PresentationState<any>` prop
- Accept `side?: 'bottom' | 'left' | 'right'` prop (default: 'bottom')
- Accept spring configuration override
- Add `$effect` watching `presentation.status`
- Animate translateY (bottom) or translateX (left/right) based on `side`
- Use softer spring than Modal (stiffness: 250, damping: 28)
- Call callbacks on animation completion
- Handle backdrop click to dismiss

**Animation Strategy**:
- **Bottom**: `translateY: [100%, 0]` (slide up)
- **Left**: `translateX: [-100%, 0]` (slide from left)
- **Right**: `translateX: [100%, 0]` (slide from right)
- All include opacity fade

**Important**: Sheet animations should feel slightly softer than Modal due to larger movement distance. This is more natural for larger UI elements.

**Spec Reference**: animation-integration-spec.md section 5.2

**Acceptance Criteria**:
- [ ] Sheet slides in from edge with spring physics
- [ ] Sheet slides out to edge on dismiss
- [ ] Softer spring than Modal (feels natural for large movement)
- [ ] Animations triggered by `$effect` watching state
- [ ] Callbacks fire correctly
- [ ] Works on mobile (bottom) and desktop (side) layouts
- [ ] Backdrop fades in/out independently

---

### Task 4.3.3: Update Drawer Component with State-Driven Animations
**Estimated Time**: 4 hours
**Dependencies**: Task 4.2.2, Task 4.2.3
**Files**: `packages/core/src/navigation-components/Drawer.svelte`

**Description**:
Refactor Drawer component to use Motion One animations driven by state. Drawer slides from left or right with smooth spring physics.

**What to do**:
- Accept `presentation: PresentationState<any>` prop
- Accept `side?: 'left' | 'right'` prop (default: 'left')
- Accept spring configuration override
- Add `$effect` watching `presentation.status`
- Animate translateX based on `side` prop
- Use smooth spring (stiffness: 280, damping: 25)
- Call callbacks on animation completion
- Handle overlay backdrop animation

**Animation Strategy**:
- **Left**: `translateX: [-100%, 0]`
- **Right**: `translateX: [100%, 0]`
- Include opacity fade for backdrop

**Spec Reference**: animation-integration-spec.md section 5.2

**Acceptance Criteria**:
- [ ] Drawer slides in from left or right edge
- [ ] Drawer slides out on dismiss
- [ ] Smooth, polished spring animation
- [ ] Animations triggered by `$effect` watching state
- [ ] Callbacks fire correctly
- [ ] Backdrop fades in/out independently

---

### Task 4.3.4: Update Alert Component with State-Driven Animations
**Estimated Time**: 3 hours
**Dependencies**: Task 4.2.2, Task 4.2.3
**Files**: `packages/core/src/navigation-components/Alert.svelte`

**Description**:
Refactor Alert component to use Motion One animations driven by state. Alert should have subtle scale+fade animation for non-intrusive presentation.

**What to do**:
- Accept `presentation: PresentationState<any>` prop
- Accept spring configuration override
- Add `$effect` watching `presentation.status`
- Use subtle scale (0.98 → 1) + fade (0 → 1)
- Faster animation than Modal (stiffness: 350, damping: 35)
- Call callbacks on completion
- No backdrop (alert is non-modal)

**Animation Strategy**:
- Very subtle scale: `0.98 → 1` (not 0.95 like Modal)
- Snappier spring for quick feedback
- Fade in/out for smoothness

**Important**: Alert should feel snappy and lightweight, not heavy like Modal. User should immediately see feedback without distraction.

**Spec Reference**: animation-integration-spec.md section 5.2

**Acceptance Criteria**:
- [ ] Alert animates in quickly with subtle scale+fade
- [ ] Alert animates out smoothly
- [ ] Faster, snappier spring than Modal
- [ ] Animations triggered by `$effect` watching state
- [ ] Callbacks fire correctly
- [ ] Non-intrusive visual presentation
- [ ] No backdrop required

---

## Section 4: Testing & Quality

### Task 4.4.1: Animation Lifecycle Tests
**Estimated Time**: 6 hours
**Dependencies**: Task 4.3.1-4.3.4
**Files**: `packages/core/tests/navigation-components/animation-lifecycle.test.ts`

**Description**:
Write comprehensive tests for animation lifecycle using TestStore. Verify that presentation state transitions correctly through all four states (idle → presenting → presented → dismissing → idle) and that effects are dispatched properly.

**What to do**:
- Test full lifecycle: idle → presenting → presented → dismissing → idle
- Test state guards prevent invalid transitions:
  - Can't dismiss from `idle`
  - Can't dismiss from `presenting` (optional: can or can't, document decision)
  - Can't present from `dismissing`
  - Can't present from `presenting` (double-tap protection)
- Test `Effect.animated()` dispatches completion actions after duration
- Test `Effect.transition()` generates correct effect pairs
- Test timeout fallback pattern:
  - Batch normal effect (300ms) + timeout effect (600ms)
  - Timeout fires if animation hangs
  - Normal completion prevents timeout from doing anything
- Use Vitest fake timers (`vi.useFakeTimers()`) to control time
- Verify destination remains set during `dismissing` (critical for exit animation)
- Verify both destination and presentation cleared atomically on `idle`

**State Guard Tests**:
```typescript
describe('state guards', () => {
  it('prevents dismissal from presenting state', async () => {
    const store = new TestStore({
      initialState: {
        destination: { type: 'modal', state: {} },
        presentation: { status: 'presenting', content: { type: 'modal', state: {} } }
      },
      reducer
    });

    // Try to dismiss - should be ignored
    await store.send({ type: 'closeButtonTapped' });

    expect(store.state.presentation.status).toBe('presenting'); // Unchanged
  });
});
```

**Timeout Fallback Tests**:
```typescript
describe('timeout fallbacks', () => {
  it('forces completion if animation hangs', async () => {
    vi.useFakeTimers();

    const store = new TestStore({ initialState, reducer });

    await store.send({ type: 'openModal' });
    expect(store.state.presentation.status).toBe('presenting');

    // Normal completion at 300ms
    vi.advanceTimersByTime(300);
    await vi.runAllTimersAsync();

    await store.receive({ type: 'presentation', event: { type: 'presentationCompleted' } });
    expect(store.state.presentation.status).toBe('presented');

    // If animation hung, timeout at 600ms would have forced it
    vi.advanceTimersByTime(600);
    await vi.runAllTimersAsync();
    // No additional effect should fire (normal already completed)
  });
});
```

**Spec Reference**: animation-integration-spec.md section 7 (Testing Animations)

**Acceptance Criteria**:
- [ ] Tests cover all four presentation states
- [ ] Tests verify state transition guards work
- [ ] Tests verify presentation events dispatch correctly
- [ ] Tests verify timeout fallback behavior
- [ ] Tests use fake timers for deterministic timing
- [ ] Tests verify destination persists during dismissing
- [ ] Tests verify atomic clearing on idle
- [ ] All tests pass with 100% success rate
- [ ] 20+ tests written covering edge cases

---

### Task 4.4.2: Component Animation Tests
**Estimated Time**: 5 hours
**Dependencies**: Task 4.3.1-4.3.4
**Files**:
- `packages/core/tests/navigation-components/Modal.test.ts`
- `packages/core/tests/navigation-components/Sheet.test.ts`
- `packages/core/tests/navigation-components/Drawer.test.ts`
- `packages/core/tests/navigation-components/Alert.test.ts`

**Description**:
Write component-level tests for Modal, Sheet, Drawer, and Alert to verify they correctly integrate with Motion One animations and dispatch presentation events. Mock Motion One to make tests fast and deterministic.

**What to do**:
- Test component renders when `presentation.status !== 'idle'`
- Test component doesn't render when `presentation.status === 'idle'`
- Test `onPresentationComplete` callback fires after animation
- Test `onDismissalComplete` callback fires after animation
- Test spring configuration can be overridden via props
- Test backdrop click dismissal (where applicable)
- Test ESC key dismissal (where applicable)
- Mock Motion One's `animate()` function to avoid actual animations
- Verify `$effect` triggers animations at correct times

**Mocking Pattern**:
```typescript
import { vi } from 'vitest';

// Mock Motion One
vi.mock('motion', () => ({
  animate: vi.fn(() => ({
    finished: Promise.resolve()
  })),
  spring: vi.fn((config) => config)
}));
```

**Important**: Mock Motion One to make tests fast and deterministic. Don't run actual animations in unit tests. Save visual testing for E2E.

**Spec Reference**: animation-integration-spec.md section 7.1-7.2

**Acceptance Criteria**:
- [ ] All 4 components tested for correct render behavior
- [ ] All components tested for event callbacks
- [ ] Tests run quickly (< 50ms each) via mocking
- [ ] Tests are deterministic (no flakiness)
- [ ] Coverage includes error cases (animation failures)
- [ ] Tests verify `$effect` triggers animations
- [ ] 10+ tests per component (40+ total)

---

### Task 4.4.3: Integration Tests with Product Gallery
**Estimated Time**: 4 hours
**Dependencies**: Task 4.5.1 (Product Gallery migration)
**Files**: `examples/product-gallery/tests/animation-integration.spec.ts`

**Description**:
Write end-to-end tests using Playwright to verify animations work correctly in a real application. Test the Product Gallery's modal presentations and dismissals with actual Motion One animations running.

**What to do**:
- Test product detail modal animates in smoothly (click product)
- Test quick view modal animates in smoothly (click quick view button)
- Test modal dismisses with animation (backdrop click)
- Test modal dismisses with animation (close button)
- Test modal dismisses with animation (ESC key)
- Test rapid interactions don't cause stuck states:
  - Double-click button (should ignore second click)
  - Click dismiss during presenting (should wait or ignore)
  - Open new modal while one is dismissing (should queue or interrupt)
- Verify no visual glitches during animations
- Take screenshots before/during/after animations for regression testing

**Playwright Pattern**:
```typescript
import { test, expect } from '@playwright/test';

test('modal animates in smoothly', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // Click product to open modal
  await page.click('[data-testid="product-1"]');

  // Wait for modal to appear
  await page.waitForSelector('[data-testid="product-detail-modal"]', {
    state: 'visible',
    timeout: 1000
  });

  // Verify modal is fully visible (opacity: 1)
  const modal = page.locator('[data-testid="product-detail-modal"]');
  await expect(modal).toBeVisible();

  // Optional: Screenshot for visual regression
  await expect(page).toHaveScreenshot('modal-presented.png');
});

test('rapid clicks dont cause stuck states', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // Rapid double-click
  await page.click('[data-testid="product-1"]');
  await page.click('[data-testid="product-1"]');

  // Should only have one modal, not stuck
  await page.waitForTimeout(500);
  const modals = page.locator('[data-testid="product-detail-modal"]');
  await expect(modals).toHaveCount(1);
});
```

**Important**: These are REAL browser tests with REAL animations. They catch visual regressions and timing issues that unit tests miss.

**Spec Reference**: animation-integration-spec.md section 7, navigation-spec section 9 (testing patterns)

**Acceptance Criteria**:
- [ ] Tests run in actual browser (Playwright)
- [ ] Tests verify animations complete visually
- [ ] Tests catch stuck states (via timeouts/assertions)
- [ ] Tests verify rapid clicking doesn't break state
- [ ] Screenshots or videos captured for debugging
- [ ] Tests run in CI (headless mode)
- [ ] 10+ E2E tests covering user flows

---

### Task 4.4.4: Timeout Fallback Helper Implementation
**Estimated Time**: 3 hours
**Dependencies**: Task 4.1.2
**Files**: `packages/core/src/navigation/animation-helpers.ts` (new)

**Description**:
Create reusable timeout fallback patterns to prevent stuck animation states. Provide helper functions that batch normal completion with timeout fallback (2-3x expected duration).

**What to do**:
- Create `withPresentationTimeout()` helper:
  - Accepts duration, createEvent function, timeoutMultiplier (default 2)
  - Returns batched Effect: normal + timeout
  - Ensures state never gets stuck in `presenting`
- Create `withDismissalTimeout()` helper (same pattern for dismissal)
- Create `presentationEffects()` convenience helper for full lifecycle
- Document timeout multiplier recommendations:
  - 2x for fast animations (< 300ms)
  - 3x for slow animations (> 500ms)
  - Higher on mobile (slower devices)
- Add TypeScript types for configuration
- Write usage examples for reducers

**Helper Implementation**:
```typescript
export function withPresentationTimeout<A>(config: {
  duration: number;
  createEvent: (event: { type: 'presentationCompleted' } | { type: 'presentationTimeout' }) => A;
  timeoutMultiplier?: number;
}): Effect<A> {
  const multiplier = config.timeoutMultiplier ?? 2;
  const timeoutDuration = config.duration * multiplier;

  return Effect.batch(
    // Normal completion
    Effect.animated({
      duration: config.duration,
      onComplete: config.createEvent({ type: 'presentationCompleted' })
    }),
    // Timeout fallback
    Effect.animated({
      duration: timeoutDuration,
      onComplete: config.createEvent({ type: 'presentationTimeout' })
    })
  );
}

// Usage in reducer
case 'openModal': {
  return [
    { ...state, presentation: { status: 'presenting', content: modal } },
    withPresentationTimeout({
      duration: 300,
      createEvent: (event) => ({ type: 'presentation', event })
    })
  ];
}

// Handle both events
case 'presentation': {
  if (action.event.type === 'presentationCompleted' ||
      action.event.type === 'presentationTimeout') {
    // Either way, complete the presentation
    if (state.presentation.status !== 'presenting') {
      return [state, Effect.none()];
    }

    if (action.event.type === 'presentationTimeout') {
      console.warn('[Animation] Presentation timeout - forcing completion');
    }

    return [
      { ...state, presentation: { status: 'presented', content: state.presentation.content } },
      Effect.none()
    ];
  }
}
```

**Important**: Timeouts are CRITICAL for production robustness. Animations can fail on:
- Slow devices / CPUs
- Browser tab suspended (battery saver)
- Motion One library bugs
- Network issues (if loading resources)
- User switching tabs mid-animation

**Spec Reference**: animation-integration-spec.md section 6.2-6.3, section 3.5-3.6

**Acceptance Criteria**:
- [ ] `withPresentationTimeout()` creates batched normal + timeout effects
- [ ] `withDismissalTimeout()` creates batched effects for dismissal
- [ ] Default timeout multiplier is 2x (configurable)
- [ ] `presentationEffects()` helper combines both for convenience
- [ ] Clear JSDoc on when/why to use timeouts
- [ ] Examples show reducer integration patterns
- [ ] Tests verify timeout fires if animation never completes
- [ ] Tests verify normal completion prevents timeout from interfering

---

## Section 5: Example Migration & Documentation

### Task 4.5.1: Migrate Product Gallery to Animated Presentations
**Estimated Time**: 8 hours
**Dependencies**: Task 4.3.1-4.3.4, Task 4.4.4
**Files**: `examples/product-gallery/src/**/*.{ts,svelte}`

**Description**:
Migrate the Product Gallery example application to use the new animation system. Add `presentation: PresentationState<DestinationState>` field to state, handle presentation events in reducer, use timeout fallbacks, and verify animations work end-to-end.

**What to do**:
- Add `presentation` field to `AppState` alongside `destination`
- Update `initialState` to include `presentation: { status: 'idle' }`
- Add `{ type: 'presentation', event: PresentationEvent }` to `AppAction`
- Handle presentation events in `appReducer`:
  - `presentationCompleted`: Transition `presenting` → `presented`
  - `dismissalCompleted`: Transition `dismissing` → `idle`, clear destination
  - `presentationTimeout`: Force completion with warning
  - `dismissalTimeout`: Force cleanup with warning
- Update user actions to set presentation state:
  - `productTapped`: Set both `destination` and `presentation: presenting`
  - `quickViewTapped`: Same pattern
  - `closeButtonTapped`: Transition to `dismissing` (keep destination!)
- Use `withPresentationTimeout()` and `withDismissalTimeout()` helpers
- Add state guards to prevent invalid transitions
- Update components to pass `presentation` prop to Modal/Sheet
- Verify smooth animations for all user flows:
  - Product detail modal
  - Quick view modal
  - Share sheet
  - Add to cart success alert

**Reducer Pattern**:
```typescript
case 'productTapped': {
  const product = action.product;
  const destination = Destination.initial('productDetail', {
    product,
    selectedImage: 0
  });

  // Guard: Only present if idle
  if (state.presentation.status !== 'idle') {
    return [state, Effect.none()];
  }

  return [
    {
      ...state,
      destination,
      presentation: {
        status: 'presenting',
        content: destination,
        duration: 300
      }
    },
    withPresentationTimeout({
      duration: 300,
      createEvent: (event) => ({ type: 'presentation', event })
    })
  ];
}

case 'closeButtonTapped': {
  // Guard: Only dismiss if presented
  if (state.presentation.status !== 'presented') {
    return [state, Effect.none()];
  }

  return [
    {
      ...state,
      // DON'T clear destination yet! Need it for exit animation
      presentation: {
        status: 'dismissing',
        content: state.presentation.content,
        duration: 200
      }
    },
    withDismissalTimeout({
      duration: 200,
      createEvent: (event) => ({ type: 'presentation', event })
    })
  ];
}

case 'presentation': {
  if (action.event.type === 'presentationCompleted' ||
      action.event.type === 'presentationTimeout') {
    // Complete presentation
    if (state.presentation.status !== 'presenting') {
      return [state, Effect.none()];
    }

    if (action.event.type === 'presentationTimeout') {
      console.warn('[Product Gallery] Presentation timeout');
    }

    return [
      { ...state, presentation: { status: 'presented', content: state.presentation.content } },
      Effect.none()
    ];
  }

  if (action.event.type === 'dismissalCompleted' ||
      action.event.type === 'dismissalTimeout') {
    // Complete dismissal - clear BOTH destination and presentation
    if (state.presentation.status !== 'dismissing') {
      return [state, Effect.none()];
    }

    if (action.event.type === 'dismissalTimeout') {
      console.warn('[Product Gallery] Dismissal timeout');
    }

    return [
      {
        ...state,
        destination: null,  // NOW we clear destination
        presentation: { status: 'idle' }
      },
      Effect.none()
    ];
  }

  return [state, Effect.none()];
}
```

**Component Pattern**:
```svelte
<script>
  import { Modal } from '@composable-svelte/core';
  import { scopeTo } from '@composable-svelte/core';
  import ProductDetail from './ProductDetail.svelte';

  const productDetailStore = $derived(
    scopeTo(store).into('destination').case('productDetail')
  );
</script>

<Modal
  presentation={store.state.presentation}
  onPresentationComplete={() => {
    store.dispatch({
      type: 'presentation',
      event: { type: 'presentationCompleted' }
    });
  }}
  onDismissalComplete={() => {
    store.dispatch({
      type: 'presentation',
      event: { type: 'dismissalCompleted' }
    });
  }}
>
  {#if productDetailStore}
    <ProductDetail store={productDetailStore} />
  {/if}
</Modal>
```

**Important**: This serves as the canonical example of animation integration. Code quality matters - this is reference implementation for library users.

**Spec Reference**: animation-integration-spec.md section 2-5 (full lifecycle example)

**Acceptance Criteria**:
- [ ] Product detail modal animates smoothly in/out
- [ ] Quick view modal animates smoothly in/out
- [ ] Share sheet animates smoothly in/out
- [ ] Add to cart alert animates subtly
- [ ] All dismissals animate (backdrop, button, ESC key)
- [ ] No stuck states (guards working)
- [ ] No timeout warnings in console (animations completing)
- [ ] Timeout fallbacks present for production safety
- [ ] Code is clean, well-commented, and exemplary
- [ ] Sequential animations work (dismiss → present)

---

### Task 4.5.2: Write Animation Integration Guide
**Estimated Time**: 5 hours
**Dependencies**: Task 4.5.1
**Files**: `docs/guides/animation-integration.md` (new)

**Description**:
Write a comprehensive guide explaining how to integrate animations into Composable Svelte applications. Cover the full lifecycle, state-driven approach, common patterns, coordination, error handling, and best practices.

**What to do**:
- Explain `PresentationState` lifecycle and why it's separate from `destination`
- Explain state-driven approach (why `$effect`, not `use:` actions)
- Show how to add `presentation` field to state
- Show how to handle presentation events in reducer
- Demonstrate `Effect.animated()` and `Effect.transition()` usage
- Explain state guards and when to use them (with guard table)
- Document timeout fallback pattern and when required
- Provide before/after migration example
- Show coordination patterns:
  - Sequential animations (dismiss A → present B)
  - Parallel animations (fade modal + backdrop)
  - Conditional animations (present B only if A dismissed successfully)
  - Staggered animations (present modal, wait, present tooltip)
- Include troubleshooting section:
  - Stuck in `presenting` (guard missing or animation failed)
  - Stuck in `dismissing` (timeout missing)
  - Visual glitches (check `$effect` dependencies)
  - Performance issues (too many animations)
- Provide spring configuration tuning guide

**Guide Sections**:
1. Introduction (Why state-driven animations?)
2. Adding `PresentationState` to your state
3. Handling presentation events in your reducer
4. Using `Effect.animated()` and `Effect.transition()`
5. State guards (preventing invalid transitions)
6. Timeout fallbacks (production robustness)
7. Updating components to use animations
8. Coordination patterns (sequential, parallel, conditional, staggered)
9. Spring physics tuning
10. Troubleshooting
11. Migration checklist

**Spec Reference**: animation-integration-spec.md (entire spec)

**Acceptance Criteria**:
- [ ] Guide covers complete animation lifecycle
- [ ] Guide includes 5+ real-world examples
- [ ] Guide explains state-driven approach vs DOM-driven
- [ ] Guide explains state guards clearly with decision table
- [ ] Guide documents timeout pattern with recommendations
- [ ] Guide shows coordination patterns with code
- [ ] Guide has comprehensive troubleshooting section
- [ ] Code examples are copy-pasteable and tested
- [ ] Guide is 3000+ words with clear headings

---

### Task 4.5.3: Update API Documentation
**Estimated Time**: 2 hours
**Dependencies**: Task 4.1.1, 4.1.2, 4.2.2
**Files**:
- `docs/api/presentation-state.md` (new)
- `docs/api/effect-animated.md` (new)
- `docs/api/effect-transition.md` (new)
- `docs/api/animation-utilities.md` (new)

**Description**:
Create API reference documentation for all animation-related types, Effect helpers, and utility functions. Provide clear API signatures with all parameters, return types, and examples.

**What to do**:
- Document `PresentationState<T>` type with all four states
- Document `PresentationEvent` type with all event types
- Document `Effect.animated()` signature and parameters
- Document `Effect.transition()` signature and parameters
- Document all animation utility functions (`animateModalIn`, etc.)
- Document `SpringConfig` interface and validation
- Document timeout helpers (`withPresentationTimeout`, etc.)
- Add examples for each API
- Link to animation guide for usage patterns
- Include migration notes (breaking changes from Phase 2/3)

**API Reference Template**:
```markdown
# PresentationState<T>

Type-safe representation of animation lifecycle state.

## Type Definition

\`\`\`typescript
type PresentationState<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'presenting'; readonly content: T; readonly duration?: number }
  | { readonly status: 'presented'; readonly content: T }
  | { readonly status: 'dismissing'; readonly content: T; readonly duration?: number };
\`\`\`

## States

### `idle`
Nothing is being presented. Both `destination` and `presentation` should be null/idle.

### `presenting`
Animation in progress (animating IN). Content is being presented to the user.

**Fields:**
- `content: T` - The content being presented (usually DestinationState)
- `duration?: number` - Optional animation duration hint (ms)

### `presented`
Animation complete, content fully visible. User can interact with content.

**Fields:**
- `content: T` - The content being presented

### `dismissing`
Animation in progress (animating OUT). Content is being dismissed.

**Important:** `destination` field remains set during dismissing (needed for exit animation).

**Fields:**
- `content: T` - The content being dismissed
- `duration?: number` - Optional animation duration hint (ms)

## Usage Example

\`\`\`typescript
interface AppState {
  destination: DestinationState | null;
  presentation: PresentationState<DestinationState>;
}

const initialState: AppState = {
  destination: null,
  presentation: { status: 'idle' }
};
\`\`\`

## See Also

- [PresentationEvent](./presentation-event.md)
- [Animation Integration Guide](../guides/animation-integration.md)
- [Effect.animated()](./effect-animated.md)
```

**Spec Reference**: animation-integration-spec.md sections 2-4

**Acceptance Criteria**:
- [ ] All animation types documented with TypeScript signatures
- [ ] All Effect helpers documented with parameters and examples
- [ ] All utility functions documented
- [ ] Examples provided for each API
- [ ] Links to related guides included
- [ ] Migration notes included for breaking changes
- [ ] Documentation renders correctly in Markdown
- [ ] Code examples syntax-highlighted

---

### Task 4.5.4: Create Phase 4 Progress Tracking Document
**Estimated Time**: 1 hour
**Dependencies**: None (can be done anytime)
**Files**: `plans/phase-4/PHASE-4-PROGRESS.md`

**Description**:
Create a progress tracking document for Phase 4, similar to Phase 3's tracking document. Track completion of each task, test counts, bugs found/fixed, time spent, and overall status.

**What to do**:
- Create progress markdown with task checklist (all 15 tasks)
- Track test count metrics (target: 50+ tests)
- Track bugs found and fixed during implementation
- Track time spent vs. estimate per task
- Track overall progress percentage
- Update regularly as tasks complete
- Include "What's Next" section for Phase 5

**Document Sections**:
1. Phase Overview (status, deliverable, dates)
2. Task Completion Checklist (15 tasks)
3. Test Coverage Statistics
4. Bugs Found & Fixed
5. Time Tracking (estimated vs actual)
6. Key Achievements & Metrics
7. Lessons Learned
8. What's Next (Phase 5 preview)

**Spec Reference**: N/A (project management)

**Acceptance Criteria**:
- [ ] Progress document created in `plans/phase-4/` directory
- [ ] All 15 tasks from this document listed with checkboxes
- [ ] Test count tracking included (unit, integration, E2E)
- [ ] Bug tracking section included
- [ ] Time tracking section with estimates vs actuals
- [ ] Updated regularly throughout Phase 4
- [ ] Marked complete when Phase 4 done

---

## Summary

### Total Time Estimate
- **Foundation**: 3 hours ✅ DONE
- **Motion One Integration**: 4.5 hours
- **Component Updates**: 17 hours
- **Testing & Quality**: 18 hours
- **Example & Documentation**: 16 hours
- **Buffer**: 8 hours
- **TOTAL**: 66.5 hours (~2.5-3 weeks at 24 hrs/week)

### Critical Path
1. Install Motion One → Create animation utils (Tasks 4.2.1 → 4.2.2)
2. Update all 4 components (Tasks 4.3.1 → 4.3.4)
3. Write lifecycle tests (Task 4.4.1)
4. Migrate Product Gallery (Task 4.5.1)
5. Write integration guide (Task 4.5.2)

### Dependencies
- **Motion One** ^11.11.17 (~11kb tree-shakeable, core ~5kb)
- **Svelte 5** (for `$effect` runes)
- **Playwright** (for E2E visual tests)
- **Vitest** (for unit tests with fake timers)

### Success Criteria
- [ ] All navigation components use Motion One animations
- [ ] Zero Svelte transitions (consistency enforced)
- [ ] 50+ animation tests passing (unit + integration + E2E)
- [ ] Product Gallery fully animated with smooth transitions
- [ ] No stuck states in any testing (guards + timeouts working)
- [ ] Animation guide published and comprehensive
- [ ] Zero TypeScript errors
- [ ] All animations state-driven (not DOM-driven)

---

## Key Principles for Implementation

### 1. State-Driven, Not DOM-Driven
Animations are triggered by `$effect` watching `presentation.status`, NOT by Svelte's mount/unmount lifecycle. This enables:
- Sequential coordination (dismiss A → present B)
- Parallel coordination (fade modal + backdrop)
- Conditional coordination (present B only if A dismissed)
- Deterministic testing (control state, control animations)

### 2. Animations Are State
Track lifecycle in reducers via `PresentationState<T>`. This makes animations:
- Testable (dispatch actions, assert state)
- Debuggable (inspect state in DevTools)
- Time-travel capable (record/replay actions)
- Deterministic (same actions = same animations)

### 3. State Guards Everywhere
Always validate current state before transitioning:
```typescript
if (state.presentation.status !== 'presented') {
  return [state, Effect.none()]; // Ignore invalid action
}
```

### 4. Timeout Fallbacks for Production
Use `withPresentationTimeout()` and `withDismissalTimeout()` to prevent stuck states:
- Animations can fail (slow devices, bugs, browser issues)
- Timeouts ensure state always progresses (2-3x duration)
- Log warnings but complete successfully

### 5. Spring Physics by Default
Use Motion One's spring easing for natural feel:
- Modal: Snappy (300/30)
- Sheet: Softer (250/28)
- Drawer: Smooth (280/25)
- Alert: Very snappy (350/35)

### 6. Error Handling
Animation functions catch errors and always resolve:
```typescript
try {
  await animate(...).finished;
} catch (error) {
  console.error('[animate] Failed:', error);
  // Still resolve - don't break state machine
}
```

### 7. Keep Content Mounted During Dismissing
Element must stay in DOM during exit animation:
```svelte
{#if presentation.status !== 'idle'}
  <div>Content stays mounted through 'dismissing'</div>
{/if}
```

### 8. Dual-Field Pattern
Separate `destination` (what) from `presentation` (how):
- `destination`: Logical data (remains set during dismissing)
- `presentation`: Animation lifecycle (controls transitions)
- Both cleared atomically when `idle`

---

**Phase 4 Status**: In Progress - Foundation Complete ✅
**Next Task**: Task 4.2.1 - Install Motion One Dependency
**Target Completion**: 2.5-3 weeks from start date
**Last Updated**: 2025-10-27
