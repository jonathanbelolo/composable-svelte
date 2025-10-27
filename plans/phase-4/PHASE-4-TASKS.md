# Phase 4: Animation Integration - Detailed Task Breakdown

**Duration**: 2-3 weeks (60-80 hours)
**Deliverable**: `@composable-svelte/core@0.4.0` with Motion One-based animations
**Spec Reference**: `specs/frontend/animation-integration-spec.md`
**Status**: In Progress

---

## Overview

Phase 4 integrates **Motion One**-based animations into the navigation system, providing state-driven, spring-physics animations for all presentation components. This phase enforces a single, consistent animation approach throughout the architecture.

**Key Design Decision**: **Motion One Only** (no Svelte transitions)
- Ensures one consistent way to animate across the library
- Forces proper `PresentationState` lifecycle usage
- Provides natural spring physics by default
- GPU-accelerated via Web Animations API

**Core Principle**: Animations are STATE, not side effects. Animation lifecycle is tracked in reducers via `PresentationState<T>`, making animations fully testable and time-travel debuggable.

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

**Spec Reference**: animation-integration-spec.md section 2.1-2.2

**Acceptance Criteria**:
- [x] `PresentationState<T>` has all four states (idle, presenting, presented, dismissing)
- [x] Optional `duration` field for presenting/dismissing states
- [x] `PresentationEvent` covers all lifecycle events
- [x] Types exported from core package

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

**Important**: These are library-agnostic - they work with ANY animation approach (Motion One, CSS, manual setTimeout, etc.). They just dispatch actions after durations.

**Spec Reference**: animation-integration-spec.md section 4.2-4.3

**Acceptance Criteria**:
- [x] `Effect.animated()` dispatches action after duration
- [x] `Effect.transition()` returns { present, dismiss } effect pair
- [x] Negative duration throws TypeError
- [x] Effects integrate with existing Effect.map() and Effect.batch()

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
- Verify tree-shaking works (bundle only includes used functions)

**Important**: Motion One is ~11kb full, but tree-shakeable. Core `animate()` function is ~5kb. This is acceptable for the quality and consistency benefits.

**Acceptance Criteria**:
- [ ] `motion` added to `dependencies` (not `devDependencies` or `peerDependencies`)
- [ ] Package installs without errors
- [ ] Can import `{ animate, spring }` from `motion`

---

### Task 4.2.2: Create Animation Utilities
**Estimated Time**: 3 hours
**Dependencies**: Task 4.2.1
**Files**: `packages/core/src/navigation-components/utils/animate.ts`

**Description**:
Create reusable animation utilities that wrap Motion One with opinionated defaults for the Composable Svelte architecture. These utilities should provide spring-physics animations, handle completion callbacks, and integrate with `PresentationState` lifecycle.

**What to do**:
- Create `animateIn(node, options)` function for presentation animations
- Create `animateOut(node, options)` function for dismissal animations
- Define default spring configs for different presentation types (modal, sheet, drawer)
- Handle animation completion callbacks
- Provide error handling for failed animations

**Important Design Decisions**:
- **Default Springs**: Modal (300/30), Sheet (250/28), Drawer (280/25)
- **Default Animations**: opacity + scale for modals, translateY for sheets, translateX for drawers
- **Error Handling**: Catch animation failures, call completion anyway to prevent stuck states

**Spec Reference**: animation-integration-spec.md section 5.1-5.2, section 6 (error handling)

**Acceptance Criteria**:
- [ ] `animateIn()` returns Promise that resolves when animation completes
- [ ] `animateOut()` returns Promise that resolves when animation completes
- [ ] Default spring configs exported and documented
- [ ] Animation errors caught and logged (don't throw)
- [ ] Completion callbacks always fire (even on error)

---

### Task 4.2.3: Create Animation Action Directives
**Estimated Time**: 2 hours
**Dependencies**: Task 4.2.2
**Files**: `packages/core/src/navigation-components/utils/use-animate.ts`

**Description**:
Create Svelte action directives (`use:animateIn`, `use:animateOut`) that trigger Motion One animations based on element lifecycle. These integrate with the `animateIn()`/`animateOut()` utilities from Task 4.2.2.

**What to do**:
- Create `useAnimateIn` action that triggers on element mount
- Create `useAnimateOut` action that triggers on element unmount
- Pass spring configuration through action parameters
- Call `onComplete` callback when animation finishes
- Handle cleanup on action destroy

**Important**: Svelte actions run synchronously on mount. Animation starts immediately, then calls completion callback asynchronously.

**Spec Reference**: animation-integration-spec.md section 5.1

**Acceptance Criteria**:
- [ ] `use:animateIn` triggers animation on element mount
- [ ] `use:animateOut` triggers animation before element unmount
- [ ] Actions accept `{ spring?, onComplete? }` parameters
- [ ] Cleanup prevents memory leaks
- [ ] Works with Svelte 5 reactivity (no stale closures)

---

## Section 3: Component Updates

### Task 4.3.1: Update Modal Component
**Estimated Time**: 4 hours
**Dependencies**: Task 4.2.3
**Files**: `packages/core/src/navigation-components/Modal.svelte`

**Description**:
Refactor Modal component to use Motion One animations driven by `PresentationState` lifecycle. Modal should animate in with scale+fade, animate out with reverse, and dispatch presentation events on completion.

**What to do**:
- Replace any existing transition logic with Motion One integration
- Accept `PresentationState` as a prop (instead of simple store)
- Use `use:animateIn` and `use:animateOut` actions
- Dispatch `presentationCompleted` and `dismissalCompleted` events
- Handle backdrop animations (fade in/out)
- Support spring configuration override via props

**Important Behavior**:
- Only render when `presentation.status !== 'idle'`
- Start animation when `presentation.status === 'presenting'`
- Complete presentation transition when animation finishes
- Keep content mounted during `dismissing` (for exit animation)

**Spec Reference**: animation-integration-spec.md section 5.2-5.3

**Acceptance Criteria**:
- [ ] Modal animates in with scale (0.95 → 1) + fade (0 → 1)
- [ ] Modal animates out with reverse animation
- [ ] Dispatches `{ type: 'presentation', event: { type: 'presentationCompleted' } }`
- [ ] Dispatches `{ type: 'presentation', event: { type: 'dismissalCompleted' } }`
- [ ] Backdrop animates independently (fade only)
- [ ] Spring physics configurable via props

---

### Task 4.3.2: Update Sheet Component
**Estimated Time**: 4 hours
**Dependencies**: Task 4.2.3
**Files**: `packages/core/src/navigation-components/Sheet.svelte`

**Description**:
Refactor Sheet component to use Motion One animations. Sheet should slide up from bottom (mobile) or side (desktop) with spring physics, and dispatch presentation events.

**What to do**:
- Replace any existing transition logic with Motion One integration
- Accept `PresentationState` as a prop
- Animate translateY (bottom sheet) or translateX (side sheet) based on `side` prop
- Use softer spring than Modal (stiffness: 250, damping: 28)
- Dispatch presentation events on animation completion
- Support drag-to-dismiss gesture threshold (optional for now)

**Important**: Sheet animations should feel slightly softer than Modal due to larger movement distance.

**Spec Reference**: animation-integration-spec.md section 5.2, section 8.3 (gesture support)

**Acceptance Criteria**:
- [ ] Sheet slides in from edge with spring physics
- [ ] Sheet slides out to edge on dismiss
- [ ] Softer spring than Modal (feels natural for large movement)
- [ ] Dispatches presentation events correctly
- [ ] Works on mobile (bottom) and desktop (side) layouts

---

### Task 4.3.3: Update Drawer Component
**Estimated Time**: 3 hours
**Dependencies**: Task 4.2.3
**Files**: `packages/core/src/navigation-components/Drawer.svelte`

**Description**:
Refactor Drawer component to use Motion One animations. Drawer should slide from left or right with smooth spring physics.

**What to do**:
- Replace any existing transition logic with Motion One integration
- Accept `PresentationState` as a prop
- Animate translateX based on `side` prop (left: -100% → 0, right: 100% → 0)
- Use smooth spring (stiffness: 280, damping: 25)
- Dispatch presentation events on animation completion
- Handle overlay backdrop animation

**Spec Reference**: animation-integration-spec.md section 5.2

**Acceptance Criteria**:
- [ ] Drawer slides in from left or right edge
- [ ] Drawer slides out on dismiss
- [ ] Smooth, polished spring animation
- [ ] Dispatches presentation events correctly
- [ ] Backdrop fades in/out independently

---

### Task 4.3.4: Update Alert Component
**Estimated Time**: 2 hours
**Dependencies**: Task 4.2.3
**Files**: `packages/core/src/navigation-components/Alert.svelte`

**Description**:
Refactor Alert component to use Motion One animations. Alert should have subtle scale+fade animation for non-intrusive presentation.

**What to do**:
- Replace any existing transition logic with Motion One integration
- Accept `PresentationState` as a prop
- Use subtle scale (0.98 → 1) + fade (0 → 1)
- Faster animation than Modal (stiffness: 350, damping: 35)
- Dispatch presentation events on completion

**Important**: Alert should feel snappy and lightweight, not heavy like Modal.

**Spec Reference**: animation-integration-spec.md section 5.2

**Acceptance Criteria**:
- [ ] Alert animates in quickly with subtle scale+fade
- [ ] Alert animates out smoothly
- [ ] Faster, snappier spring than Modal
- [ ] Dispatches presentation events correctly
- [ ] Non-intrusive visual presentation

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
- Test state guards prevent invalid transitions (e.g., dismiss during presenting)
- Test Effect.animated() dispatches completion actions
- Test Effect.transition() generates correct effect pairs
- Test timeout fallback pattern (batch normal + timeout effects)
- Use fake timers to control animation timing
- Verify destination remains set during dismissing (for exit animation)

**Spec Reference**: animation-integration-spec.md section 7 (Testing Animations)

**Acceptance Criteria**:
- [ ] Tests cover all four presentation states
- [ ] Tests verify state transition guards work
- [ ] Tests verify presentation events dispatch correctly
- [ ] Tests verify timeout fallback behavior
- [ ] Tests use fake timers for deterministic timing
- [ ] All tests pass with 100% success rate

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
Write component-level tests for Modal, Sheet, Drawer, and Alert to verify they correctly integrate with Motion One animations and dispatch presentation events.

**What to do**:
- Test component renders when `presentation.status !== 'idle'`
- Test component doesn't render when `presentation.status === 'idle'`
- Test `presentationCompleted` event dispatches after animation
- Test `dismissalCompleted` event dispatches after animation
- Test spring configuration can be overridden
- Mock Motion One's `animate()` to avoid actual animations in tests

**Important**: Mock Motion One to make tests fast and deterministic. Don't run actual animations in unit tests.

**Spec Reference**: animation-integration-spec.md section 7.1-7.2

**Acceptance Criteria**:
- [ ] All components tested for correct render behavior
- [ ] All components tested for event dispatch
- [ ] Tests run quickly (< 100ms each) via mocking
- [ ] Tests are deterministic (no flakiness)
- [ ] Coverage includes error cases (animation failures)

---

### Task 4.4.3: Integration Tests with Product Gallery
**Estimated Time**: 4 hours
**Dependencies**: Task 4.3.1-4.3.4
**Files**: `examples/product-gallery/tests/animation-integration.spec.ts`

**Description**:
Write end-to-end tests using Playwright to verify animations work correctly in a real application. Test the Product Gallery's modal presentations and dismissals.

**What to do**:
- Test product detail modal animates in smoothly
- Test quick view modal animates in smoothly
- Test modal dismisses with animation (backdrop click)
- Test modal dismisses with animation (close button)
- Test rapid interactions don't cause stuck states
- Verify no visual glitches during animations

**Important**: These are visual regression tests. Use Playwright's `expect(page).toHaveScreenshot()` to catch animation regressions.

**Spec Reference**: animation-integration-spec.md section 7, navigation-spec section 9 (testing patterns)

**Acceptance Criteria**:
- [ ] Tests run in actual browser (Playwright)
- [ ] Tests verify animations complete visually
- [ ] Tests catch stuck states (timeouts)
- [ ] Tests verify rapid clicking doesn't break state
- [ ] Screenshots or videos available for debugging

---

### Task 4.4.4: Timeout Fallback Implementation
**Estimated Time**: 3 hours
**Dependencies**: Task 4.1.2
**Files**: `packages/core/src/navigation/animation-patterns.ts` (new helper file)

**Description**:
Create reusable timeout fallback patterns to prevent stuck animation states. Provide helper functions that batch normal completion with timeout fallback (2-3x expected duration).

**What to do**:
- Create `withTimeout()` helper that batches normal + timeout effects
- Create `presentationEffects()` helper for common present/dismiss patterns
- Document timeout multiplier recommendations (2x for fast, 3x for slow)
- Add TypeScript types for timeout configuration
- Write examples showing usage in reducers

**Important**: Timeouts are CRITICAL for production robustness. Animations can fail on slow devices, during browser tab suspension, or due to library bugs.

**Spec Reference**: animation-integration-spec.md section 6.2-6.3

**Acceptance Criteria**:
- [ ] `withTimeout()` helper creates batched normal + timeout effects
- [ ] Default timeout multiplier is 2x (configurable)
- [ ] Clear documentation on when to use timeouts
- [ ] Examples show reducer integration
- [ ] Tests verify timeout fires if animation never completes

---

## Section 5: Example Migration & Documentation

### Task 4.5.1: Migrate Product Gallery to Animations
**Estimated Time**: 6 hours
**Dependencies**: Task 4.3.1-4.3.4
**Files**: `examples/product-gallery/src/**/*.{ts,svelte}`

**Description**:
Migrate the Product Gallery example application to use the new animation system. Add `presentation: PresentationState<DestinationState>` field to state, handle presentation events in reducer, and verify animations work end-to-end.

**What to do**:
- Add `presentation` field to app state alongside `destination`
- Handle `{ type: 'presentation', event: PresentationEvent }` actions in reducer
- Use `Effect.animated()` or `Effect.transition()` for timing
- Add state guards to prevent invalid transitions
- Add timeout fallbacks for production robustness
- Update components to pass `presentation` to Modal/Sheet
- Verify smooth animations for all user flows

**Important**: This serves as the canonical example of animation integration. Code quality matters - this is reference implementation.

**Spec Reference**: animation-integration-spec.md section 2-5 (full lifecycle example)

**Acceptance Criteria**:
- [ ] Product detail modal animates smoothly
- [ ] Quick view modal animates smoothly
- [ ] Share sheet animates smoothly
- [ ] All dismissals animate (backdrop, button, ESC key)
- [ ] No stuck states (guards + timeouts working)
- [ ] Code is clean and well-commented

---

### Task 4.5.2: Write Animation Guide
**Estimated Time**: 4 hours
**Dependencies**: Task 4.5.1
**Files**: `docs/guides/animations.md` (new)

**Description**:
Write a comprehensive guide explaining how to use animations in Composable Svelte. Cover the full lifecycle, common patterns, error handling, and best practices.

**What to do**:
- Explain `PresentationState` lifecycle (idle → presenting → presented → dismissing)
- Show how to handle presentation events in reducers
- Demonstrate `Effect.animated()` and `Effect.transition()` usage
- Explain state guards and when to use them
- Document timeout fallback pattern
- Provide before/after migration example
- Include troubleshooting section (stuck states, performance issues)

**Spec Reference**: animation-integration-spec.md (entire spec)

**Acceptance Criteria**:
- [ ] Guide covers complete animation lifecycle
- [ ] Guide includes 3+ real-world examples
- [ ] Guide explains state guards clearly
- [ ] Guide documents timeout pattern
- [ ] Guide has troubleshooting section
- [ ] Code examples are copy-pasteable

---

### Task 4.5.3: Update API Documentation
**Estimated Time**: 2 hours
**Dependencies**: Task 4.1.1, 4.1.2
**Files**:
- `packages/core/README.md`
- `docs/api/presentation-state.md` (new)
- `docs/api/effect-animated.md` (new)

**Description**:
Update API documentation to include new animation types and Effect helpers. Provide clear API reference with all parameters, return types, and examples.

**What to do**:
- Document `PresentationState<T>` type with all four states
- Document `PresentationEvent` type
- Document `Effect.animated()` signature and parameters
- Document `Effect.transition()` signature and parameters
- Add examples for each API
- Link to animation guide for usage patterns

**Acceptance Criteria**:
- [ ] All animation types documented with TypeScript signatures
- [ ] All Effect helpers documented with parameters
- [ ] Examples provided for each API
- [ ] Links to related guides included
- [ ] Documentation renders correctly in Markdown

---

### Task 4.5.4: Create Phase 4 Progress Tracking
**Estimated Time**: 1 hour
**Dependencies**: None (can be done first)
**Files**: `plans/phase-4/PHASE-4-PROGRESS.md`

**Description**:
Create a progress tracking document for Phase 4, similar to Phase 3's tracking document. Track completion of each task, test counts, bugs found/fixed, and overall status.

**What to do**:
- Create progress markdown with task checklist
- Track test count metrics (target: 40+ tests)
- Track bugs found and fixed
- Track time spent vs. estimate
- Update as tasks complete

**Acceptance Criteria**:
- [ ] Progress document created in phase-4 directory
- [ ] All tasks from this document listed
- [ ] Test count tracking included
- [ ] Bug tracking section included
- [ ] Updated regularly as work progresses

---

## Summary

### Total Time Estimate
- **Foundation**: 3 hours (DONE ✅)
- **Motion One Integration**: 5.5 hours
- **Component Updates**: 13 hours
- **Testing & Quality**: 18 hours
- **Example & Documentation**: 13 hours
- **Buffer**: 8 hours
- **TOTAL**: 60.5 hours (~2.5 weeks at 24 hrs/week)

### Critical Path
1. Motion One Integration (Tasks 4.2.1 → 4.2.3)
2. Component Updates (Tasks 4.3.1 → 4.3.4)
3. Testing (Task 4.4.1 → 4.4.2)
4. Example Migration (Task 4.5.1)

### Dependencies
- Motion One library (~11kb, tree-shakeable)
- Svelte 5 (action directive support)
- Playwright (for E2E animation tests)

### Success Criteria
- [ ] All navigation components use Motion One animations
- [ ] Zero Svelte transitions (consistency enforced)
- [ ] 40+ animation tests passing
- [ ] Product Gallery fully animated
- [ ] No stuck states in testing
- [ ] Animation guide published
- [ ] Zero TypeScript errors

---

## Key Principles for Implementation

1. **Animations Are State**: Track lifecycle in reducers, not components
2. **State Guards**: Always validate current state before transitioning
3. **Timeout Fallbacks**: Production code should include timeouts (2-3x duration)
4. **Spring Physics**: Use Motion One's spring easing for natural feel
5. **Error Handling**: Animations can fail - always call completion callbacks
6. **Consistent API**: All components follow same pattern (PresentationState → events)
7. **Testability**: Mock Motion One in unit tests, use Playwright for visual tests

---

**Phase 4 Status**: In Progress - Foundation Complete ✅
**Next Task**: Task 4.2.1 - Install Motion One Dependency
**Target Completion**: 2-3 weeks from start date
