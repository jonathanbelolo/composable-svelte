# Phase 2: Navigation System - Detailed Tasks

**Duration**: Week 3-4 (15-20 hours/week)
**Deliverable**: `@composable-svelte/core@0.2.0` with navigation system
**Spec Reference**: `navigation-spec.md`
**Last Updated**: 2025-10-26
**Status**: ✅ READY TO START

---

## Overview

Phase 2 implements the navigation system that enables tree-based and stack-based navigation patterns. This phase provides the foundation for modal dialogs, sheets, drawers, navigation stacks, and other presentation styles - all managed through state.

**Key Deliverables**:
- Navigation types (PresentationAction, StackAction)
- Navigation operators (ifLet, createDestinationReducer, matchPresentationAction)
- Navigation components (Modal, Sheet, Drawer, NavigationStack, Alert)
- Dismiss dependency for child self-dismissal
- Stack navigation utilities
- Optional: SvelteKit integration (can be deferred to Phase 6)

**Important Note**: SvelteKit integration (section 2.5 in implementation plan) is **OPTIONAL** for this phase. It can be deferred to Phase 6 or implemented as a separate package. Focus on core navigation primitives first.

---

## Task 2.1: Navigation Types

### Task 2.1.1: Define PresentationAction Type
**Estimated Time**: 30 minutes
**Dependencies**: None
**File**: `packages/core/src/navigation/types.ts`

**Description**:
Create the PresentationAction discriminated union that wraps child actions to enable parent observation of child navigation events.

**What to do**:
- Define PresentationAction<T> as discriminated union with 'presented' and 'dismiss' variants
- 'presented' variant wraps the child action
- 'dismiss' variant has no payload (simple dismissal signal)
- Add comprehensive JSDoc with examples
- Export type from navigation module

**Spec Reference**: `navigation-spec.md` Section 3.2 - "PresentationAction Pattern"

**Acceptance Criteria**:
- [ ] PresentationAction<T> type defined correctly
- [ ] Type is a discriminated union with 'presented' and 'dismiss'
- [ ] JSDoc includes usage examples
- [ ] Type exported from navigation/types.ts
- [ ] TypeScript inference works without explicit type parameters

---

### Task 2.1.2: Define StackAction Type
**Estimated Time**: 45 minutes
**Dependencies**: None
**File**: `packages/core/src/navigation/types.ts`

**Description**:
Create the StackAction discriminated union for stack-based navigation (push, pop, popToRoot, setPath).

**What to do**:
- Define StackAction<A, S> with four variants: push, pop, popToRoot, setPath
- push: contains screen state to add to stack
- pop: no payload, removes top screen
- popToRoot: no payload, clears to root
- setPath: contains array of screen states for deep linking
- Add element action wrapper for dispatching actions at stack indices
- Include JSDoc with stack navigation examples

**Spec Reference**: `navigation-spec.md` Section 5 - "Stack-Based Navigation"

**Acceptance Criteria**:
- [ ] StackAction<A, S> type defined with all variants
- [ ] Element action variant included for dispatching at indices
- [ ] Types support generic screen state
- [ ] JSDoc documents all action types
- [ ] Examples show typical stack operations

---

### Task 2.1.3: Create Navigation Types Index
**Estimated Time**: 15 minutes
**Dependencies**: Tasks 2.1.1, 2.1.2
**File**: `packages/core/src/navigation/types.ts`

**Description**:
Export all navigation types from a single module with organized documentation.

**What to do**:
- Create barrel export for PresentationAction and StackAction
- Add module-level JSDoc explaining navigation patterns
- Group related types with comments
- Ensure clean public API

**Acceptance Criteria**:
- [ ] All types exported from navigation/types.ts
- [ ] Module has clear documentation
- [ ] Types are properly categorized
- [ ] Import path works: `import type { PresentationAction } from '@composable-svelte/core/navigation'`

---

## Task 2.2: Navigation Operators

### Task 2.2.1: Implement ifLet() Operator
**Estimated Time**: 3-4 hours
**Dependencies**: Task 2.1.1
**File**: `packages/core/src/navigation/operators.ts`

**Description**:
Implement the ifLet() operator for integrating optional child state into parent reducers. This is the core primitive for optional navigation (modals, sheets, etc.).

**What to do**:
- Implement ifLet() function with same signature as scope() but handling null child state
- Return early with Effect.none() when child state is null
- Extract child state, run child reducer, embed result when non-null
- Map child effects to parent effects using Effect.map()
- Handle PresentationAction.dismiss by setting child state to null
- Add comprehensive JSDoc with modal/sheet examples

**Important**:
- ifLet() is similar to scope() but adds null-handling logic
- When child state is null, any parent actions targeting it are ignored
- dismiss action always sets child state to null regardless of current state

**Spec Reference**: `navigation-spec.md` Section 3.3 - "ifLet() Operator"

**Acceptance Criteria**:
- [ ] ifLet() correctly handles null child state
- [ ] Returns [state, Effect.none()] when child is null
- [ ] Runs child reducer when child state is non-null
- [ ] PresentationAction.dismiss sets child to null
- [ ] Child effects properly lifted to parent actions
- [ ] Type inference works without explicit parameters
- [ ] JSDoc includes complete usage example

---

### Task 2.2.2: Implement createDestinationReducer() Helper
**Estimated Time**: 2-3 hours
**Dependencies**: Task 2.1.1
**File**: `packages/core/src/navigation/operators.ts`

**Description**:
Create a helper function that simplifies enum-based destination routing by automatically dispatching to the correct child reducer based on destination type.

**What to do**:
- Accept a map of destination type strings to reducers
- Return a reducer that pattern-matches on destination.type
- Route presented actions to the appropriate child reducer
- Handle dismiss by setting destination to null
- Support optional state validation per destination type
- Add type inference for destination unions
- Document with multi-destination example (add/edit pattern)

**Spec Reference**: `navigation-spec.md` Section 4.3 - "createDestinationReducer()"

**Acceptance Criteria**:
- [ ] createDestinationReducer() accepts reducer map
- [ ] Correctly routes to child reducer based on destination type
- [ ] Handles dismiss action by nullifying destination
- [ ] Type inference works for destination discriminated unions
- [ ] Returns Effect.none() for unknown destination types
- [ ] JSDoc shows typical usage with multiple destinations

---

### Task 2.2.3: Implement matchPresentationAction() Helper
**Estimated Time**: 1-2 hours
**Dependencies**: Task 2.1.1
**File**: `packages/core/src/navigation/operators.ts`

**Description**:
Create utility functions for deep matching of PresentationAction to simplify parent observation of child events.

**What to do**:
- Implement matchPresentationAction() that unwraps presented actions
- Support deep path matching (e.g., 'addItem.saveButtonTapped')
- Return null if action doesn't match the path
- Return unwrapped child action if it matches
- Add type guards for safer extraction
- Include examples of parent observing child actions

**Spec Reference**: `navigation-spec.md` Section 7.2 - "Helper Functions"

**Acceptance Criteria**:
- [ ] matchPresentationAction() unwraps presented actions
- [ ] Supports single-level matching
- [ ] Supports deep path matching with dot notation
- [ ] Returns null for non-matching actions
- [ ] Type guards ensure type safety
- [ ] JSDoc shows parent observation pattern

---

### Task 2.2.4: Implement scopeToDestination() Helper
**Estimated Time**: 1-2 hours
**Dependencies**: Task 2.2.2
**File**: `packages/core/src/navigation/operators.ts`

**Description**:
Create helper for creating scoped stores from destination state for use in navigation components.

**What to do**:
- Accept parent store and destination field selector
- Return scoped store that reads from destination field
- Handle null destination by returning null store
- Support optional case type filtering for enum destinations
- Enable components to receive focused stores
- Document usage in Modal/Sheet components

**Spec Reference**: `navigation-spec.md` Section 4.8 - "Scoped Stores for Components"

**Acceptance Criteria**:
- [ ] scopeToDestination() creates scoped stores
- [ ] Returns null when destination is null
- [ ] Supports case filtering for enum destinations
- [ ] Scoped store dispatches wrap actions with parent action
- [ ] Type safety maintained through scoping
- [ ] JSDoc shows component integration

---

### Task 2.2.5: Create Navigation Operators Index
**Estimated Time**: 15 minutes
**Dependencies**: Tasks 2.2.1-2.2.4
**File**: `packages/core/src/navigation/operators.ts`

**Description**:
Export all navigation operators from operators module with clear organization.

**What to do**:
- Export ifLet, createDestinationReducer, matchPresentationAction, scopeToDestination
- Add module documentation explaining when to use each operator
- Organize exports logically (core operators first, helpers second)

**Acceptance Criteria**:
- [ ] All operators exported
- [ ] Module documentation is clear
- [ ] Import paths work correctly

---

## Task 2.3: Stack Navigation Utilities

### Task 2.3.1: Implement Stack State Helpers
**Estimated Time**: 2 hours
**Dependencies**: Task 2.1.2
**File**: `packages/core/src/navigation/stack.ts`

**Description**:
Implement utilities for managing stack-based navigation state.

**What to do**:
- Create helper to push screen onto stack
- Create helper to pop screen from stack
- Create helper to pop to root (keep only first screen)
- Create helper to set entire path (deep linking)
- Handle edge cases (empty stacks, invalid indices)
- Return immutable stack updates

**Spec Reference**: `navigation-spec.md` Section 5.2 - "Stack State Management"

**Acceptance Criteria**:
- [ ] Push operation adds to end of stack
- [ ] Pop operation removes from end
- [ ] PopToRoot keeps only first element
- [ ] SetPath replaces entire stack
- [ ] All operations return new array (immutable)
- [ ] Edge cases handled gracefully

---

### Task 2.3.2: Implement handleStackAction() Reducer Helper
**Estimated Time**: 2-3 hours
**Dependencies**: Tasks 2.1.2, 2.3.1
**File**: `packages/core/src/navigation/stack.ts`

**Description**:
Create reducer helper that processes StackActions and updates stack state accordingly.

**What to do**:
- Accept current stack state and StackAction
- Dispatch to appropriate stack helper based on action type
- Handle element actions by running reducer at specific index
- Collect effects from all affected screens
- Return updated stack and batched effects
- Support generic screen state and actions

**Spec Reference**: `navigation-spec.md` Section 5.3 - "Stack Reducers"

**Acceptance Criteria**:
- [ ] handleStackAction() processes all StackAction types
- [ ] Element actions dispatch to correct index
- [ ] Effects from modified screens are collected
- [ ] Returns batched effects
- [ ] Type safety for screen state and actions
- [ ] Handles out-of-bounds indices gracefully

---

### Task 2.3.3: Create Stack Navigation Index
**Estimated Time**: 15 minutes
**Dependencies**: Tasks 2.3.1, 2.3.2
**File**: `packages/core/src/navigation/stack.ts`

**Description**:
Export stack navigation utilities with documentation.

**What to do**:
- Export all stack helpers and handleStackAction
- Add module docs explaining stack navigation patterns
- Include examples of typical stack usage

**Acceptance Criteria**:
- [ ] All stack utilities exported
- [ ] Clear documentation provided
- [ ] Examples show common patterns

---

## Task 2.4: Dismiss Dependency

### Task 2.4.1: Define Dismiss Dependency Interface
**Estimated Time**: 1 hour
**Dependencies**: None
**File**: `packages/core/src/dependencies/dismiss.ts`

**Description**:
Create dependency injection interface for child features to dismiss themselves.

**What to do**:
- Define DismissDependency interface with dismiss() method
- Create factory function for creating dismiss dependencies
- Support async dismiss (returns Promise<void>)
- Handle dismiss errors gracefully
- Document usage pattern for child features

**Spec Reference**: `navigation-spec.md` Section 8 - "Dismissal Patterns"

**Acceptance Criteria**:
- [ ] DismissDependency interface defined
- [ ] Factory function creates dismiss dependency
- [ ] dismiss() method accepts no parameters
- [ ] Supports async dismissal
- [ ] JSDoc shows child feature usage

---

### Task 2.4.2: Implement createDismissDependency() Factory
**Estimated Time**: 1-2 hours
**Dependencies**: Task 2.4.1
**File**: `packages/core/src/dependencies/dismiss.ts`

**Description**:
Implement factory that creates dismiss dependencies bound to parent dispatch.

**What to do**:
- Accept parent dispatch function
- Create action wrapper (usually PresentationAction.dismiss)
- Return dependency object with dismiss() method
- Ensure dismiss dispatches the correct parent action
- Support custom dismiss actions (not just PresentationAction)
- Add examples showing integration with child reducers

**Spec Reference**: `navigation-spec.md` Section 8.2 - "Creating Dismiss Dependencies"

**Acceptance Criteria**:
- [ ] Factory creates working dismiss dependency
- [ ] Dismiss dispatches to parent correctly
- [ ] Supports custom dismiss actions
- [ ] Child features can inject and use dependency
- [ ] Example shows complete integration

---

## Task 2.5: Navigation Components

### Task 2.5.1: Implement Modal Component
**Estimated Time**: 2-3 hours
**Dependencies**: Task 2.2.4
**File**: `packages/core/src/navigation-components/Modal.svelte`

**Description**:
Create reusable Modal component for presenting child features in modal dialogs.

**What to do**:
- Accept scoped child store as prop
- Render modal overlay and content container
- Show/hide based on store being null or not
- Use Svelte transitions for enter/exit animations
- Support close on overlay click (optional prop)
- Support close on escape key
- Provide slot for child component
- Style with basic modal layout

**Important**:
- Component should be headless/unstyled or provide minimal default styles
- Focus management not required in Phase 2 (defer to Phase 4 or 5)

**Spec Reference**: `navigation-spec.md` Section 6.1 - "Modal Component"

**Acceptance Criteria**:
- [ ] Modal renders when store is non-null
- [ ] Modal hides when store is null
- [ ] Transitions work smoothly
- [ ] Overlay click dismisses (if enabled)
- [ ] Escape key dismisses
- [ ] Child component slot provided
- [ ] Basic styling applied

---

### Task 2.5.2: Implement Sheet Component
**Estimated Time**: 2-3 hours
**Dependencies**: Task 2.2.4
**File**: `packages/core/src/navigation-components/Sheet.svelte`

**Description**:
Create Sheet component for bottom-drawer presentations.

**What to do**:
- Similar to Modal but slides from bottom
- Support partial height (not full screen)
- Slide-up/slide-down transitions
- Overlay dimming
- Drag-to-dismiss gesture (optional in Phase 2)
- Provide content slot

**Spec Reference**: `navigation-spec.md` Section 6.2 - "Sheet Component"

**Acceptance Criteria**:
- [ ] Sheet slides from bottom
- [ ] Partial height supported
- [ ] Transitions smooth
- [ ] Overlay dims background
- [ ] Child content slot provided
- [ ] Basic styling applied

---

### Task 2.5.3: Implement Drawer Component
**Estimated Time**: 2-3 hours
**Dependencies**: Task 2.2.4
**File**: `packages/core/src/navigation-components/Drawer.svelte`

**Description**:
Create Drawer component for side-panel presentations.

**What to do**:
- Slide from left or right (prop-controlled)
- Support partial width
- Slide transitions
- Overlay dimming
- Close on overlay click
- Provide content slot

**Spec Reference**: `navigation-spec.md` Section 6.3 - "Drawer Component"

**Acceptance Criteria**:
- [ ] Drawer slides from specified side
- [ ] Width configurable
- [ ] Transitions smooth
- [ ] Overlay support
- [ ] Child content slot provided
- [ ] Basic styling applied

---

### Task 2.5.4: Implement NavigationStack Component
**Estimated Time**: 3-4 hours
**Dependencies**: Tasks 2.3.2, 2.2.4
**File**: `packages/core/src/navigation-components/NavigationStack.svelte`

**Description**:
Create NavigationStack component for stack-based navigation (like mobile app navigation).

**What to do**:
- Accept array of screen stores
- Render screens in stack with transitions
- Support push/pop transitions (slide left/right)
- Show back button for non-root screens
- Handle back navigation
- Provide screen slot with index context

**Important**:
- Complex transitions can be simplified in Phase 2
- Focus on basic push/pop functionality
- Polish transitions in Phase 4 (animation phase)

**Spec Reference**: `navigation-spec.md` Section 6.4 - "NavigationStack Component"

**Acceptance Criteria**:
- [ ] Renders all screens in stack
- [ ] Only top screen visible (or slide transition)
- [ ] Back button on non-root screens
- [ ] Push/pop transitions work
- [ ] Screen slot receives context
- [ ] Basic navigation works

---

### Task 2.5.5: Implement Alert Component
**Estimated Time**: 1-2 hours
**Dependencies**: Task 2.2.4
**File**: `packages/core/src/navigation-components/Alert.svelte`

**Description**:
Create simple Alert component for confirmation dialogs.

**What to do**:
- Accept title, message, and button configuration
- Support OK, Cancel, and custom buttons
- Center modal style
- Simple fade transition
- Dispatch button actions to parent
- Minimal styling

**Spec Reference**: `navigation-spec.md` Section 6.5 - "Alert Component"

**Acceptance Criteria**:
- [ ] Alert renders with title and message
- [ ] Buttons configurable
- [ ] Button clicks dispatch actions
- [ ] Fade transition
- [ ] Clean minimal design

---

### Task 2.5.6: Create Navigation Components Index
**Estimated Time**: 30 minutes
**Dependencies**: Tasks 2.5.1-2.5.5
**File**: `packages/core/src/navigation-components/index.ts`

**Description**:
Export all navigation components with organized documentation.

**What to do**:
- Export all components from single module
- Add module docs explaining component usage
- Organize by presentation type
- Include import examples

**Acceptance Criteria**:
- [ ] All components exported
- [ ] Clear module documentation
- [ ] Easy import paths

---

## Task 2.6: Testing

### Task 2.6.1: Test ifLet() Operator
**Estimated Time**: 2 hours
**Dependencies**: Task 2.2.1
**File**: `packages/core/tests/navigation/operators.test.ts`

**Description**:
Comprehensive tests for ifLet() operator covering all scenarios.

**What to do**:
- Test null child state (should return unchanged parent state)
- Test presenting child (null → non-null transition)
- Test child state updates (run child reducer)
- Test dismissal (non-null → null transition)
- Test child effects are lifted correctly
- Test type inference

**Acceptance Criteria**:
- [ ] All ifLet() scenarios tested
- [ ] Null handling verified
- [ ] Effect lifting verified
- [ ] All tests pass

---

### Task 2.6.2: Test createDestinationReducer() Helper
**Estimated Time**: 2 hours
**Dependencies**: Task 2.2.2
**File**: `packages/core/tests/navigation/operators.test.ts`

**Description**:
Test enum destination routing and reducer selection.

**What to do**:
- Test routing to correct child reducer based on type
- Test dismiss action nullifies destination
- Test multiple destination types
- Test unknown destination type handling
- Test effect batching from child reducers

**Acceptance Criteria**:
- [ ] Routing logic tested
- [ ] Dismiss handling verified
- [ ] Multiple destinations tested
- [ ] All tests pass

---

### Task 2.6.3: Test Stack Navigation Helpers
**Estimated Time**: 2-3 hours
**Dependencies**: Tasks 2.3.1, 2.3.2
**File**: `packages/core/tests/navigation/stack.test.ts`

**Description**:
Test all stack navigation utilities and reducer helper.

**What to do**:
- Test push operation
- Test pop operation
- Test popToRoot operation
- Test setPath operation
- Test element action dispatching
- Test effect collection
- Test edge cases (empty stack, invalid indices)

**Acceptance Criteria**:
- [ ] All stack operations tested
- [ ] Element actions tested
- [ ] Effect batching verified
- [ ] Edge cases covered
- [ ] All tests pass

---

### Task 2.6.4: Test Dismiss Dependency
**Estimated Time**: 1 hour
**Dependencies**: Task 2.4.2
**File**: `packages/core/tests/dependencies/dismiss.test.ts`

**Description**:
Test dismiss dependency creation and usage.

**What to do**:
- Test factory creates working dependency
- Test dismiss() dispatches correct action
- Test custom dismiss actions
- Test integration with child reducers

**Acceptance Criteria**:
- [ ] Dependency creation tested
- [ ] Dismiss dispatch verified
- [ ] Custom actions tested
- [ ] All tests pass

---

### Task 2.6.5: Test Navigation Components
**Estimated Time**: 3-4 hours
**Dependencies**: Tasks 2.5.1-2.5.5
**File**: `packages/core/tests/navigation-components/*.test.ts`

**Description**:
Component tests for all navigation components.

**What to do**:
- Test Modal show/hide based on store
- Test Sheet transitions
- Test Drawer side selection
- Test NavigationStack push/pop
- Test Alert button actions
- Use @testing-library/svelte for user interactions

**Acceptance Criteria**:
- [ ] All components render correctly
- [ ] Show/hide logic tested
- [ ] User interactions tested
- [ ] All tests pass

---

## Task 2.7: Example Applications

### Task 2.7.1: Create Inventory Navigation Example
**Estimated Time**: 3-4 hours
**Dependencies**: Tasks 2.2.1, 2.5.1
**File**: `examples/inventory-nav/`

**Description**:
Build example app demonstrating tree-based navigation with modals.

**What to do**:
- Create inventory list feature
- Add modal for adding items
- Add modal for editing items
- Use ifLet() for modal state
- Demonstrate parent observing child events
- Show dismiss dependency usage
- Include README with explanation

**Spec Reference**: `navigation-spec.md` Section 3 - "Optional State Navigation"

**Acceptance Criteria**:
- [ ] Example app runs
- [ ] Add item modal works
- [ ] Edit item modal works
- [ ] Navigation state-driven
- [ ] Parent observation demonstrated
- [ ] README explains patterns

---

### Task 2.7.2: Create Stack Navigation Example
**Estimated Time**: 3-4 hours
**Dependencies**: Tasks 2.3.2, 2.5.4
**File**: `examples/stack-nav/`

**Description**:
Build example app demonstrating stack-based navigation.

**What to do**:
- Create multi-screen navigation flow
- Use NavigationStack component
- Demonstrate push/pop operations
- Show deep linking with setPath
- Include back navigation
- Add README explaining stack patterns

**Spec Reference**: `navigation-spec.md` Section 5 - "Stack-Based Navigation"

**Acceptance Criteria**:
- [ ] Example app runs
- [ ] Push/pop navigation works
- [ ] Back button functions
- [ ] Deep linking demonstrated
- [ ] README explains usage

---

## Task 2.8: Documentation & Polish

### Task 2.8.1: Add Navigation API Documentation
**Estimated Time**: 2 hours
**Dependencies**: All implementation tasks
**File**: `packages/core/README.md`

**Description**:
Update package README with navigation system documentation.

**What to do**:
- Add navigation section to README
- Document ifLet() usage
- Document PresentationAction pattern
- Show component integration examples
- Link to navigation spec
- Keep concise (full docs in Phase 5)

**Acceptance Criteria**:
- [ ] Navigation section added
- [ ] Key APIs documented
- [ ] Examples provided
- [ ] Links to specs

---

### Task 2.8.2: Run Full Test Suite
**Estimated Time**: 1 hour
**Dependencies**: All testing tasks
**File**: N/A

**Description**:
Verify all tests pass and navigation system works end-to-end.

**What to do**:
- Run complete test suite
- Verify all navigation tests pass
- Run example apps
- Check TypeScript compilation
- Verify no linter errors
- Test tree-shaking works

**Acceptance Criteria**:
- [ ] All tests pass
- [ ] Examples run successfully
- [ ] TypeScript compiles with no errors
- [ ] No linter warnings
- [ ] Build succeeds

---

### Task 2.8.3: Create Phase 2 Completion Summary
**Estimated Time**: 30 minutes
**Dependencies**: Task 2.8.2
**File**: `plans/phase-2/PHASE-2-COMPLETE.md`

**Description**:
Document Phase 2 completion with metrics and verification.

**What to do**:
- List all completed tasks
- Record test coverage
- Document files created
- Verify success criteria
- Note any deviations or deferred items
- Confirm readiness for Phase 3

**Acceptance Criteria**:
- [ ] Completion doc created
- [ ] All metrics recorded
- [ ] Success criteria verified
- [ ] Ready for Phase 3

---

## Summary

**Total Estimated Time**: 50-65 hours (3-4 weeks at 15-20 hours/week)

**Critical Path**:
1. Navigation types (2.1.x) → Operators (2.2.x) → Components (2.5.x)
2. Stack types (2.1.2) → Stack helpers (2.3.x) → NavigationStack (2.5.4)
3. Testing (2.6.x) can happen in parallel with component development
4. Examples (2.7.x) after core implementation
5. Documentation (2.8.x) at the end

**Deferred Items**:
- SvelteKit integration (optional, can be Phase 6)
- Advanced animations (Phase 4)
- DSL utilities (Phase 3)
- Focus management (Phase 5)

**Phase 2 Success Criteria**:
- Users can implement tree-based navigation with modals/sheets
- Stack-based navigation works for multi-screen flows
- Children can dismiss themselves via dependency
- All navigation is state-driven and testable
- Components provide good defaults with customization
- Examples demonstrate real-world usage

**Key Principles**:
- State drives navigation (non-null = show, null = hide)
- Parent features observe child navigation events
- Navigation is composable through reducers
- Components are presentation-only, logic in reducers
- Testing uses TestStore for deterministic navigation flows

---

Ready to implement Phase 2! 🚀
