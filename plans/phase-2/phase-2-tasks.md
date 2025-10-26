# Phase 2: Navigation System - Detailed Tasks

**Duration**: Week 3-5 (15-20 hours/week, ~3 weeks)
**Deliverable**: `@composable-svelte/core@0.2.0` with navigation system
**Spec Reference**: `navigation-spec.md`
**Last Updated**: 2025-10-26
**Status**: ✅ READY TO START

**Timeline Extension**: Extended from 2 weeks to 3 weeks to include desktop-focused navigation components (Sidebar, Tabs, Popover) in addition to mobile-first components.

---

## Overview

Phase 2 implements the navigation system that enables tree-based and stack-based navigation patterns. This phase provides the foundation for modal dialogs, sheets, drawers, navigation stacks, and other presentation styles - all managed through state.

**Key Deliverables**:
- Navigation types (PresentationAction, StackAction)
- Navigation operators (ifLet, createDestinationReducer, matchPresentationAction)
- **Mobile-First Components**: Modal, Sheet, Drawer, NavigationStack, Alert
- **Desktop-First Components**: Sidebar, Tabs, Popover (NEW)
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

**Important**: The spec (Section 7.2) defines TWO helper functions. Implement both:
1. `matchPresentationAction<T>(action, path)` - Extracts action if path matches
2. `isActionAtPath<T>(action, path, predicate)` - Boolean check with predicate

**What to do**:
- Implement `matchPresentationAction()` that unwraps presented actions
  - Support deep path matching (e.g., `['destination', 'presented', 'addItem']`)
  - Return null if action doesn't match the path
  - Return unwrapped child action if it matches
- Implement `isActionAtPath()` for predicate-based matching
  - Combines path matching with type-safe predicate
  - Returns boolean instead of extracted action
- Add type guards for safer extraction
- Include examples of parent observing child actions

**Spec Reference**: `navigation-spec.md` Section 7.2 - "Helper: Deep Action Matching" (lines 1537-1602)

**Implementation Notes**:
```typescript
// Example from spec
const innerAction = matchPresentationAction(
  action,
  ['destination', 'presented', 'addItem']
);
if (innerAction?.type === 'saveButtonTapped') {
  // Handle save
}

// Predicate variant
if (isActionAtPath(
  action,
  ['destination', 'presented', 'addItem'],
  (a) => a.type === 'saveButtonTapped'
)) {
  // Handle save - more concise
}
```

**Acceptance Criteria**:
- [ ] matchPresentationAction() unwraps presented actions
- [ ] isActionAtPath() provides predicate-based matching
- [ ] Supports single-level matching
- [ ] Supports deep path matching with dot notation
- [ ] Returns null for non-matching actions (matchPresentationAction)
- [ ] Returns boolean for predicate checks (isActionAtPath)
- [ ] Type guards ensure type safety
- [ ] JSDoc shows parent observation pattern for both functions

---

### Task 2.2.4: Implement scopeToDestination() Helper
**Estimated Time**: 1-2 hours
**Dependencies**: Task 2.2.2
**File**: `packages/core/src/navigation/operators.ts`

**Description**:
Create helper for creating scoped stores from destination state for use in navigation components.

**Important**: This is the Phase 2 implementation. In Phase 3, a more ergonomic fluent API `scopeTo()` will be added that wraps this function. This implementation will remain as the underlying engine.

**What to do**:
- Accept parent store and destination field selector
- Return scoped store that reads from destination field
- Handle null destination by returning null store
- Support optional case type filtering for enum destinations
- Enable components to receive focused stores
- Document usage in Modal/Sheet components
- **Add JSDoc note about Phase 3 upgrade path**

**Spec Reference**: `navigation-spec.md` Section 4.8 - "Scoped Stores for Components"

**Phase 3 Upgrade Path**:
```typescript
// Phase 2: scopeToDestination() (functional API)
const addItemStore = $derived(
  scopeToDestination(store, ['destination'], 'addItem', 'destination')
);

// Phase 3: scopeTo() (fluent API) - wraps scopeToDestination()
const addItemStore = $derived(
  scopeTo(store)
    .into('destination')
    .case('addItem')
);
```

**JSDoc Template**:
```typescript
/**
 * Create a scoped store for a specific destination case.
 *
 * Note: In Phase 3, the fluent `scopeTo()` API will provide a more
 * ergonomic way to create scoped stores. This function will remain
 * as the underlying implementation.
 *
 * @example
 * // Phase 2 usage
 * const childStore = $derived(
 *   scopeToDestination(store, ['destination'], 'addItem', 'destination')
 * );
 *
 * @see navigation-dsl-spec.md for the Phase 3 fluent API
 */
```

**Acceptance Criteria**:
- [ ] scopeToDestination() creates scoped stores
- [ ] Returns null when destination is null
- [ ] Supports case filtering for enum destinations
- [ ] Scoped store dispatches wrap actions with parent action
- [ ] Type safety maintained through scoping
- [ ] JSDoc shows component integration
- [ ] JSDoc documents Phase 3 upgrade path

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

## Task 2.4: Component Styling Setup

**Reference Guide**: See `plans/phase-2/radix-shadcn-reuse-guide.md` for comprehensive adaptation strategy.

**Philosophy**: Leverage battle-tested patterns from Radix UI (accessibility, logic) and shadcn/ui (styling) rather than reinventing the wheel. We adapt their React implementations to our Svelte + store-driven architecture.

---

### Task 2.4.1: Copy shadcn/ui Tailwind Configuration
**Estimated Time**: 30 minutes
**Dependencies**: None
**Files**:
- `packages/core/tailwind.config.ts`
- `packages/core/src/styles/globals.css`

**Description**:
Copy shadcn/ui's Tailwind configuration and CSS variables for consistent theming.

**What to do**:
- Copy `shadcn/ui/apps/www/tailwind.config.js` → our `tailwind.config.ts`
- Adapt content paths to our project structure
- Copy `shadcn/ui/apps/www/app/globals.css` → our `globals.css`
- Include all CSS variables (light + dark mode)
- Copy color definitions, border radius variables
- Install `tailwindcss-animate` plugin

**Source Files**:
- https://github.com/shadcn-ui/ui/blob/main/apps/www/tailwind.config.js
- https://github.com/shadcn-ui/ui/blob/main/apps/www/app/globals.css

**Acceptance Criteria**:
- [ ] Tailwind config copied and adapted
- [ ] CSS variables defined (light + dark mode)
- [ ] tailwindcss-animate plugin installed
- [ ] Test builds successfully
- [ ] All shadcn color variables available

---

### Task 2.4.2: Create Shared Component Utilities
**Estimated Time**: 1 hour
**Dependencies**: None
**Files**:
- `packages/core/src/lib/actions/clickOutside.ts`
- `packages/core/src/lib/actions/portal.ts`
- `packages/core/src/lib/actions/keyboard.ts`

**Description**:
Create Svelte-specific utilities adapted from Radix UI patterns.

**What to do**:
- Create `clickOutside.ts` action (adapt from Radix DismissableLayer)
- Create `portal.ts` action wrapper for teleporting content to document.body
  - **Decision**: Use custom Svelte action approach for maximum control
  - Wraps `document.body.appendChild()` / `removeChild()` in Svelte action
  - Alternative considered: `svelte-portal` library (adds dependency, but simpler)
  - If custom implementation proves complex, can switch to `svelte-portal`
- Create `keyboard.ts` utilities for common keyboard patterns (Tab trap, arrow navigation)
- Add TypeScript types for all utilities

**Portal Implementation Strategy**:
```typescript
// Custom portal action (recommended for zero deps)
export function portal(node: HTMLElement, target: HTMLElement | string = 'body') {
  const targetEl = typeof target === 'string' ? document.querySelector(target) : target;
  if (!targetEl) throw new Error(`Portal target not found: ${target}`);

  targetEl.appendChild(node);

  return {
    destroy() {
      if (node.parentNode === targetEl) {
        targetEl.removeChild(node);
      }
    }
  };
}
```

**Fallback Option**:
If custom portal proves insufficient, install `svelte-portal`:
```bash
npm install svelte-portal
```

**Reference**:
- Radix DismissableLayer: `radix-ui/primitives/packages/react/dismissable-layer/src/DismissableLayer.tsx`

**Acceptance Criteria**:
- [ ] clickOutside action implemented
- [ ] Portal helper created (if needed)
- [ ] Keyboard utils created
- [ ] All utilities typed
- [ ] Unit tests for utilities

---

### Task 2.4.3: Install Component Dependencies
**Estimated Time**: 15 minutes
**Dependencies**: None
**File**: `packages/core/package.json`

**Description**:
Install required dependencies for component implementation.

**What to do**:
- Install `@floating-ui/dom` (for Popover positioning, same library Radix uses)
- Install `svelte-portal` (if not using Svelte 5 built-in portals)
- Install `tailwindcss-animate` (dev dependency)
- Update peer dependencies (Tailwind CSS)

**Dependencies**:
```json
{
  "dependencies": {
    "@floating-ui/dom": "^1.6.0"
  },
  "peerDependencies": {
    "tailwindcss": "^3.4.0",
    "svelte": "^5.0.0"
  },
  "devDependencies": {
    "tailwindcss-animate": "^1.0.7"
  }
}
```

**Notes**:
- `@floating-ui/dom` version ^1.6.0 is the latest stable (as of October 2025)
- Matches version used by Radix UI Popover implementation
- Svelte 5 added to peer dependencies for clarity

**Acceptance Criteria**:
- [ ] @floating-ui/dom installed
- [ ] Portal solution decided and installed
- [ ] tailwindcss-animate installed
- [ ] Peer dependencies documented
- [ ] No version conflicts

---

## Task 2.5: Dismiss Dependency

### Task 2.5.1: Define Dismiss Dependency Interface
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

### Task 2.5.2: Implement createDismissDependency() Factory
**Estimated Time**: 1-2 hours
**Dependencies**: Task 2.5.1
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

## Task 2.6: Navigation Components

**IMPORTANT**: See `radix-shadcn-reuse-guide.md` in this folder for detailed guidance on adapting Radix UI and shadcn/ui patterns to our architecture.

**Architecture Decision**: Two-layer component system
1. **Primitives** (headless, logic-only) - for maximum flexibility
2. **Styled components** (Tailwind-based defaults) - for quick starts

Users can choose their level of customization:
- Use styled components as-is
- Customize styled components with Tailwind
- Use primitives with their own styling
- Build from scratch using store state directly

**Phase 2 Focus**: Functionality over animations
- NO animations in Phase 2 (deferred to Phase 4)
- Simple show/hide logic
- Portal/teleport to body
- Keyboard and click-outside handling
- Basic Tailwind styling (optional via `unstyled` prop)

**Component Categories**:
- **Mobile-First** (5 components): Modal, Sheet, Drawer, NavigationStack, Alert
- **Desktop-First** (3 components): Sidebar, Tabs, Popover
- **Total**: 8 components × 2 variants each = 16 component tasks

---

### Task 2.6.1: Implement ModalPrimitive Component
**Estimated Time**: 2 hours
**Dependencies**: Task 2.2.4, Task 2.4.2
**File**: `packages/core/src/navigation-components/primitives/ModalPrimitive.svelte`

**Reference**: See `radix-shadcn-reuse-guide.md` → "Modal Component" section for Radix UI patterns to adapt.

**Description**:
Create headless Modal primitive with pure logic, no styling or animations. Adapt logic from Radix UI Dialog.

**What to do**:
- Accept scoped child store as prop
- Show/hide based on store being null or not (no animations)
- Portal content to document.body
- Handle Escape key to dismiss (emit event)
- Handle click-outside to dismiss (emit event)
- Provide `visible` slot prop for conditional rendering
- Provide slot for child component
- NO STYLES, NO ANIMATIONS

**Important**:
- Focus management deferred to Phase 5
- Animations deferred to Phase 4
- Component only manages logic and DOM structure

**Spec Reference**: `navigation-spec.md` Section 6.1 - "Modal Component"

**Acceptance Criteria**:
- [ ] Shows when store is non-null
- [ ] Hides when store is null
- [ ] Portals to body
- [ ] Escape key emits dismiss event
- [ ] Click-outside emits dismiss event
- [ ] No styling applied
- [ ] Child slot provided

---

### Task 2.6.2: Implement Modal Styled Component
**Estimated Time**: 1.5 hours
**Dependencies**: Task 2.6.1, Task 2.4.1
**File**: `packages/core/src/navigation-components/Modal.svelte`

**Reference**: See `radix-shadcn-reuse-guide.md` → "Modal Component" section for shadcn/ui classes to copy.

**Description**:
Create styled Modal using ModalPrimitive + Tailwind CSS. Copy classes directly from shadcn/ui Dialog component.

**What to do**:
- Wrap ModalPrimitive
- Add backdrop overlay with Tailwind classes
- Add content container with centering
- Support `unstyled` prop to disable all styling
- Support `class` prop to override content classes
- Support `backdropClass` prop to override backdrop classes
- Use CSS variables for theme colors
- NO ANIMATIONS (just opacity changes)

**Spec Reference**: `navigation-spec.md` Section 6.1 - "Modal Component"

**Acceptance Criteria**:
- [ ] Uses ModalPrimitive internally
- [ ] Backdrop overlay styled with Tailwind
- [ ] Content centered with good defaults
- [ ] `unstyled` prop works
- [ ] Class overrides work
- [ ] No animations (instant show/hide)
- [ ] Peer dependency on Tailwind documented

---

### Task 2.6.3: Implement SheetPrimitive Component
**Estimated Time**: 2 hours
**Dependencies**: Task 2.2.4
**File**: `packages/core/src/navigation-components/primitives/SheetPrimitive.svelte`

**Description**:
Create headless Sheet primitive for bottom-drawer presentations.

**What to do**:
- Similar to ModalPrimitive but positioned at bottom
- Portal to body
- Handle Escape key
- Handle click-outside
- Support partial height configuration
- Provide visible slot prop
- NO STYLES, NO ANIMATIONS

**Spec Reference**: `navigation-spec.md` Section 6.2 - "Sheet Component"

**Acceptance Criteria**:
- [ ] Shows when store is non-null
- [ ] Hides when store is null
- [ ] Portals to body
- [ ] Escape and click-outside handled
- [ ] Height configurable
- [ ] No styling applied

---

### Task 2.6.4: Implement Sheet Styled Component
**Estimated Time**: 1.5 hours
**Dependencies**: Task 2.6.3
**File**: `packages/core/src/navigation-components/Sheet.svelte`

**Description**:
Create styled Sheet using SheetPrimitive + Tailwind.

**What to do**:
- Wrap SheetPrimitive
- Position at bottom of viewport
- Support partial height
- Backdrop overlay
- Support `unstyled`, `class`, `backdropClass` props
- NO ANIMATIONS (instant show/hide)

**Spec Reference**: `navigation-spec.md` Section 6.2 - "Sheet Component"

**Acceptance Criteria**:
- [ ] Uses SheetPrimitive internally
- [ ] Positioned at bottom
- [ ] Height configurable
- [ ] Styled with Tailwind
- [ ] No animations

---

### Task 2.6.5: Implement DrawerPrimitive Component
**Estimated Time**: 2 hours
**Dependencies**: Task 2.2.4
**File**: `packages/core/src/navigation-components/primitives/DrawerPrimitive.svelte`

**Description**:
Create headless Drawer primitive for side-panel presentations.

**What to do**:
- Portal to body
- Support left or right side positioning
- Handle Escape key
- Handle click-outside
- Support partial width configuration
- Provide visible slot prop
- NO STYLES, NO ANIMATIONS

**Spec Reference**: `navigation-spec.md` Section 6.3 - "Drawer Component"

**Acceptance Criteria**:
- [ ] Shows when store is non-null
- [ ] Side configurable (left/right)
- [ ] Width configurable
- [ ] Keyboard/click handling
- [ ] No styling applied

---

### Task 2.6.6: Implement Drawer Styled Component
**Estimated Time**: 1.5 hours
**Dependencies**: Task 2.6.5
**File**: `packages/core/src/navigation-components/Drawer.svelte`

**Description**:
Create styled Drawer using DrawerPrimitive + Tailwind.

**What to do**:
- Wrap DrawerPrimitive
- Position on left or right
- Support partial width
- Backdrop overlay
- Support `unstyled`, `class`, `backdropClass` props
- NO ANIMATIONS (instant show/hide)

**Spec Reference**: `navigation-spec.md` Section 6.3 - "Drawer Component"

**Acceptance Criteria**:
- [ ] Uses DrawerPrimitive internally
- [ ] Side selection works
- [ ] Width configurable
- [ ] Styled with Tailwind
- [ ] No animations

---

### Task 2.6.7: Implement NavigationStackPrimitive Component
**Estimated Time**: 2.5 hours
**Dependencies**: Tasks 2.3.2, 2.2.4
**File**: `packages/core/src/navigation-components/primitives/NavigationStackPrimitive.svelte`

**Description**:
Create headless NavigationStack primitive for managing stack rendering.

**What to do**:
- Accept array of screen stores
- Provide currentIndex slot prop
- Emit navigation events (back, forward)
- Manage which screen is visible
- Provide context to child screens (index, isTop)
- NO STYLES, NO ANIMATIONS

**Spec Reference**: `navigation-spec.md` Section 6.4 - "NavigationStack Component"

**Acceptance Criteria**:
- [ ] Renders screens from store array
- [ ] Provides screen context
- [ ] Emits navigation events
- [ ] No styling applied

---

### Task 2.6.8: Implement NavigationStack Styled Component
**Estimated Time**: 2 hours
**Dependencies**: Task 2.6.7
**File**: `packages/core/src/navigation-components/NavigationStack.svelte`

**Description**:
Create styled NavigationStack using primitive + Tailwind.

**What to do**:
- Wrap NavigationStackPrimitive
- Add back button for non-root screens
- Stack container styling
- Screen transition container
- Support `unstyled`, `class` props
- NO ANIMATIONS (just show top screen)

**Important**:
- Phase 2 only shows top screen, no transitions
- Phase 4 will add slide animations

**Spec Reference**: `navigation-spec.md` Section 6.4 - "NavigationStack Component"

**Acceptance Criteria**:
- [ ] Uses NavigationStackPrimitive internally
- [ ] Back button on non-root screens
- [ ] Only top screen visible
- [ ] Styled with Tailwind
- [ ] No animations

---

### Task 2.6.9: Implement AlertPrimitive Component
**Estimated Time**: 1 hour
**Dependencies**: Task 2.2.4
**File**: `packages/core/src/navigation-components/primitives/AlertPrimitive.svelte`

**Description**:
Create headless Alert primitive for confirmation dialogs.

**What to do**:
- Portal to body
- Handle Escape key
- Emit button click events
- Provide visible slot prop
- NO STYLES, NO ANIMATIONS

**Spec Reference**: `navigation-spec.md` Section 6.5 - "Alert Component"

**Acceptance Criteria**:
- [ ] Shows when store is non-null
- [ ] Escape key handled
- [ ] Button events emitted
- [ ] No styling applied

---

### Task 2.6.10: Implement Alert Styled Component
**Estimated Time**: 1 hour
**Dependencies**: Task 2.6.9
**File**: `packages/core/src/navigation-components/Alert.svelte`

**Description**:
Create styled Alert using AlertPrimitive + Tailwind.

**What to do**:
- Wrap AlertPrimitive
- Accept title, message, buttons configuration
- Center modal style
- Button styling with variants (primary, secondary)
- Support `unstyled`, `class` props
- NO ANIMATIONS

**Spec Reference**: `navigation-spec.md` Section 6.5 - "Alert Component"

**Acceptance Criteria**:
- [ ] Uses AlertPrimitive internally
- [ ] Title and message display
- [ ] Buttons configurable
- [ ] Styled with Tailwind
- [ ] No animations

---

### Task 2.6.11: Implement SidebarPrimitive Component
**Estimated Time**: 2 hours
**Dependencies**: Task 2.2.4
**File**: `packages/core/src/navigation-components/primitives/SidebarPrimitive.svelte`

**Description**:
Create headless Sidebar primitive for persistent/collapsible navigation panels (desktop-first pattern).

**What to do**:
- Accept expanded state as prop
- Support left or right positioning
- Handle collapse/expand toggle
- Support keyboard navigation (Arrow keys, Tab)
- Emit toggle events
- Provide visible slot prop
- NO STYLES, NO ANIMATIONS
- NO mobile responsiveness (primitive is desktop-only)

**Important**:
- This is a **persistent** navigation pattern (not portal-based like modals)
- Renders in-place, not portaled to body
- Desktop-first: mobile adaptation happens in styled variant

**Acceptance Criteria**:
- [ ] Shows/hides based on expanded prop
- [ ] Side configurable (left/right)
- [ ] Toggle event emitted
- [ ] Keyboard navigation supported
- [ ] No styling applied
- [ ] No mobile logic in primitive

---

### Task 2.6.12: Implement Sidebar Styled Component
**Estimated Time**: 2 hours
**Dependencies**: Task 2.6.11, Task 2.6.5 (DrawerPrimitive - required for mobile fallback)
**File**: `packages/core/src/navigation-components/Sidebar.svelte`

**Description**:
Create styled Sidebar using SidebarPrimitive + Tailwind with responsive behavior.

**Important**: This component uses DrawerPrimitive as a fallback on mobile devices, so DrawerPrimitive (Task 2.6.5) must be completed first.

**What to do**:
- Wrap SidebarPrimitive
- Add Tailwind classes for width, transitions
- Support icons + text labels
- **Responsive behavior**:
  - Desktop: Full sidebar with collapse
  - Tablet/Mobile: Transform to Drawer (overlay)
- Support `unstyled`, `class` props
- Width configurable (default 240px expanded, 64px collapsed)
- NO ANIMATIONS (instant collapse/expand)

**Important**:
- Uses Tailwind responsive classes to switch between sidebar and drawer
- Desktop (>= 1024px): Fixed sidebar
- Mobile (< 1024px): Drawer overlay (uses DrawerPrimitive internally)

**Acceptance Criteria**:
- [ ] Uses SidebarPrimitive for desktop
- [ ] Falls back to Drawer on mobile/tablet
- [ ] Collapse/expand works
- [ ] Icon + text label support
- [ ] Styled with Tailwind
- [ ] Responsive breakpoints work
- [ ] No animations

---

### Task 2.6.13: Implement TabsPrimitive Component
**Estimated Time**: 1.5 hours
**Dependencies**: Task 2.2.4
**File**: `packages/core/src/navigation-components/primitives/TabsPrimitive.svelte`

**Description**:
Create headless Tabs primitive for horizontal tabbed navigation.

**What to do**:
- Accept tabs array and activeTab as props
- Emit tab change events
- Support keyboard arrow navigation (Left/Right arrows)
- Support Home/End keys
- ARIA roles (role="tablist", role="tab", role="tabpanel")
- Horizontal only (vertical tabs are rare)
- NO STYLES, NO ANIMATIONS

**Important**:
- State-driven: activeTab controlled by parent
- No tab content rendering (just navigation)
- Component only handles tab selection UI

**Tab Interface**:
```typescript
interface Tab {
  id: string;
  label: string;
  disabled?: boolean;
}
```

**Acceptance Criteria**:
- [ ] Renders tabs from array
- [ ] Active tab controllable
- [ ] Arrow key navigation works
- [ ] Home/End keys work
- [ ] ARIA roles applied
- [ ] Disabled tabs skip navigation
- [ ] No styling applied

---

### Task 2.6.14: Implement Tabs Styled Component
**Estimated Time**: 1.5 hours
**Dependencies**: Task 2.6.13
**File**: `packages/core/src/navigation-components/Tabs.svelte`

**Description**:
Create styled Tabs using TabsPrimitive + Tailwind.

**What to do**:
- Wrap TabsPrimitive
- Add underline or pill style variants
- Active state styling (highlight)
- Support icon + label tabs
- Scrollable on mobile (horizontal scroll)
- Support `unstyled`, `class` props
- Support `variant` prop: 'underline' | 'pills' (default: 'underline')
- NO ANIMATIONS (instant active state change)

**Important**:
- Mobile: Horizontal scroll container
- Desktop: Fixed tab bar
- Active indicator positioning (underline or background)

**Acceptance Criteria**:
- [ ] Uses TabsPrimitive internally
- [ ] Underline variant works
- [ ] Pills variant works
- [ ] Active state styled
- [ ] Scrollable on mobile
- [ ] Styled with Tailwind
- [ ] No animations

---

### Task 2.6.15: Implement PopoverPrimitive Component
**Estimated Time**: 2.5 hours
**Dependencies**: Task 2.2.4
**File**: `packages/core/src/navigation-components/primitives/PopoverPrimitive.svelte`

**Description**:
Create headless Popover primitive for contextual overlays (dropdowns, menus, tooltips).

**What to do**:
- Accept anchor element reference
- Accept position preference: 'top' | 'bottom' | 'left' | 'right'
- Auto-positioning (flip if doesn't fit)
- Portal to document.body
- Handle click-outside to close
- Handle Escape key to close
- Emit open/close events
- Provide visible slot prop
- NO STYLES, NO ANIMATIONS

**Important**:
- Auto-positioning: Calculate available space, flip if needed
- Anchor tracking: Position relative to anchor element
- Z-index management

**Positioning Logic**:
1. Calculate anchor position
2. Check available space in preferred direction
3. Flip to opposite side if insufficient space
4. Align to anchor (start, center, end)

**Acceptance Criteria**:
- [ ] Positions relative to anchor
- [ ] Auto-flips when space insufficient
- [ ] Portals to body
- [ ] Click-outside closes
- [ ] Escape key closes
- [ ] Position updates on scroll/resize
- [ ] No styling applied

---

### Task 2.6.16: Implement Popover Styled Component
**Estimated Time**: 2 hours
**Dependencies**: Task 2.6.15
**File**: `packages/core/src/navigation-components/Popover.svelte`

**Description**:
Create styled Popover using PopoverPrimitive + Tailwind.

**What to do**:
- Wrap PopoverPrimitive
- Add shadow, border, background
- Support arrow indicator (optional)
- Arrow positioning based on side
- Support `unstyled`, `class` props
- Support `showArrow` prop (default: true)
- Responsive positioning (always fits viewport)
- NO ANIMATIONS (instant show/hide)

**Important**:
- Arrow SVG or CSS triangle
- Arrow points to anchor
- Min/max width constraints

**Use Cases**:
- Dropdown menus
- User menus
- Context menus
- Notification panels
- Quick actions

**Acceptance Criteria**:
- [ ] Uses PopoverPrimitive internally
- [ ] Shadow and border styled
- [ ] Arrow indicator works
- [ ] Arrow positioning correct
- [ ] Styled with Tailwind
- [ ] Responsive positioning
- [ ] No animations

---

### Task 2.6.17: Create Navigation Components Index
**Estimated Time**: 45 minutes
**Dependencies**: Tasks 2.6.1-2.6.16
**Files**:
- `packages/core/src/navigation-components/index.ts`
- `packages/core/src/navigation-components/primitives/index.ts`
- `packages/core/package.json` (exports field)

**Description**:
Export all navigation components with organized documentation and clear import paths, including proper package.json exports configuration.

**What to do**:
- Export styled components from main index
- Export primitives from primitives/index
- **Configure package.json exports field** for proper module resolution
- Add module docs explaining:
  - Two-layer architecture (primitives + styled)
  - Mobile-first vs Desktop-first components
  - Customization patterns
  - Tailwind peer dependency
  - `unstyled` prop usage
- Organize exports logically
- Include import examples

**Components to Export**:
- Mobile-First: Modal, Sheet, Drawer, NavigationStack, Alert
- Desktop-First: Sidebar, Tabs, Popover
- Total: 8 styled + 8 primitives = 16 components

**package.json Exports Configuration**:
```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "svelte": "./dist/index.js",
      "default": "./dist/index.js"
    },
    "./navigation": {
      "types": "./dist/navigation/index.d.ts",
      "svelte": "./dist/navigation/index.js",
      "default": "./dist/navigation/index.js"
    },
    "./navigation-components": {
      "types": "./dist/navigation-components/index.d.ts",
      "svelte": "./dist/navigation-components/index.js",
      "default": "./dist/navigation-components/index.js"
    },
    "./navigation-components/primitives": {
      "types": "./dist/navigation-components/primitives/index.d.ts",
      "svelte": "./dist/navigation-components/primitives/index.js",
      "default": "./dist/navigation-components/primitives/index.js"
    }
  }
}
```

**Acceptance Criteria**:
- [ ] All 8 styled components exported from main index
- [ ] All 8 primitives exported from primitives/index
- [ ] package.json exports field properly configured
- [ ] Clear documentation provided
- [ ] Import paths work:
  - `import { Modal, Sidebar, Tabs } from '@composable-svelte/core/navigation-components'`
  - `import { ModalPrimitive, SidebarPrimitive } from '@composable-svelte/core/navigation-components/primitives'`
- [ ] TypeScript types resolve correctly for all import paths

---

### Task 2.6.18: Add Tailwind Configuration Guide
**Estimated Time**: 1 hour
**Dependencies**: Task 2.6.17
**File**: `packages/core/src/navigation-components/README.md`

**Description**:
Create guide for setting up Tailwind with navigation components, including behavior when Tailwind is missing.

**What to do**:
- Document Tailwind peer dependency requirements
- Provide example tailwind.config.js
- Show how to customize CSS variables
- Document `unstyled` prop usage
- Show customization patterns (4 levels)
- Include shadcn-inspired theming approach
- Document mobile-first vs desktop-first component behavior
- **Document behavior when Tailwind is missing**

**Tailwind Peer Dependency Behavior**:

1. **Using Styled Components (requires Tailwind)**:
   ```typescript
   // ❌ Will render but styles won't work without Tailwind
   import { Modal } from '@composable-svelte/core/navigation-components';
   ```
   - If Tailwind CSS is not installed, component will render but appear unstyled
   - Classes like `bg-background`, `rounded-lg` won't apply
   - **Recommendation**: Show console warning in development if Tailwind classes don't resolve

2. **Using Primitives (no Tailwind required)**:
   ```typescript
   // ✅ Works without Tailwind - bring your own styles
   import { ModalPrimitive } from '@composable-svelte/core/navigation-components/primitives';
   ```
   - Primitives have zero styling dependencies
   - User provides all styles (CSS modules, vanilla CSS, other frameworks)

3. **Using `unstyled` prop (no Tailwind required)**:
   ```svelte
   <!-- ✅ Disables all default styles -->
   <Modal store={myStore} unstyled>
     <div class="my-custom-modal">
       <!-- Your own styling -->
     </div>
   </Modal>
   ```

**Customization Levels**:
1. **Level 0**: Use primitives with custom CSS (no Tailwind)
2. **Level 1**: Use styled components as-is (requires Tailwind)
3. **Level 2**: Customize with Tailwind class overrides
4. **Level 3**: Use `unstyled` prop + custom styles
5. **Level 4**: Build from scratch using store state directly

**Installation Instructions**:
```bash
# Required for styled components
npm install -D tailwindcss@^3.4.0 tailwindcss-animate@^1.0.7

# Copy our tailwind.config.js and globals.css
# (provide templates in docs)
```

**Acceptance Criteria**:
- [ ] Tailwind setup documented
- [ ] Customization levels explained
- [ ] CSS variables documented
- [ ] Examples provided
- [ ] Mobile/desktop component usage documented

---

## Task 2.7: Testing

### Task 2.7.1: Test ifLet() Operator
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

### Task 2.7.2: Test createDestinationReducer() Helper
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

### Task 2.7.3: Test Stack Navigation Helpers
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

### Task 2.7.4: Test Dismiss Dependency
**Estimated Time**: 1 hour
**Dependencies**: Task 2.5.2
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

### Task 2.7.5: Test Navigation Components
**Estimated Time**: 5-6 hours
**Dependencies**: Tasks 2.6.1-2.6.16
**File**: `packages/core/tests/navigation-components/*.test.ts`

**Description**:
Component tests for all navigation components (mobile + desktop).

**What to do**:
- **Mobile-First Components**:
  - Test Modal show/hide based on store
  - Test Sheet transitions
  - Test Drawer side selection
  - Test NavigationStack push/pop
  - Test Alert button actions
- **Desktop-First Components**:
  - Test Sidebar collapse/expand
  - Test Sidebar responsive behavior (desktop → drawer)
  - Test Tabs keyboard navigation
  - Test Tabs variant styles
  - Test Popover positioning and auto-flip
  - Test Popover anchor tracking
- Use @testing-library/svelte for user interactions
- Test primitives independently from styled components

**Acceptance Criteria**:
- [ ] All 8 styled components tested
- [ ] All 8 primitives tested
- [ ] Show/hide logic tested
- [ ] User interactions tested (keyboard, click)
- [ ] Responsive behavior tested (Sidebar)
- [ ] Auto-positioning tested (Popover)
- [ ] All tests pass

---

## Task 2.8: Example Applications

### Task 2.8.1: Create Inventory Navigation Example
**Estimated Time**: 3-4 hours
**Dependencies**: Tasks 2.2.1, 2.6.1
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

### Task 2.8.2: Create Stack Navigation Example
**Estimated Time**: 3-4 hours
**Dependencies**: Tasks 2.3.2, 2.6.7
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

### Task 2.8.3: Create Desktop Navigation Example
**Estimated Time**: 3-4 hours
**Dependencies**: Tasks 2.6.11-2.6.16
**File**: `examples/desktop-nav/`

**Description**:
Build example app demonstrating desktop-focused navigation patterns (Sidebar, Tabs, Popover).

**What to do**:
- Create admin panel layout with Sidebar
- Implement multi-section content with Tabs
- Add user menu with Popover
- Demonstrate responsive behavior (sidebar → drawer on mobile)
- Show tab navigation for settings pages
- Include popover for notifications/quick actions
- Add README explaining desktop patterns

**Spec Reference**: Custom implementation (desktop patterns not in navigation-spec.md)

**Example Features**:
- Collapsible sidebar navigation
- Settings page with tabs
- User menu popover (profile, settings, logout)
- Notifications popover
- Responsive layout

**Acceptance Criteria**:
- [ ] Example app runs
- [ ] Sidebar collapse/expand works
- [ ] Tabs switch content correctly
- [ ] Popover menus work
- [ ] Responsive behavior demonstrated
- [ ] README explains desktop patterns

---

## Task 2.9: Documentation & Polish

### Task 2.9.1: Add Navigation API Documentation
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

### Task 2.9.2: Run Full Test Suite
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

### Task 2.9.3: Create Phase 2 Completion Summary
**Estimated Time**: 30 minutes
**Dependencies**: Task 2.9.2
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

**Total Estimated Time**: 69-87 hours (~3 weeks at 23-29 hours/week)

**Time Breakdown by Section**:
- Task 2.1 (Types): 1.5 hours
- Task 2.2 (Operators): 8-11 hours
- Task 2.3 (Stack): 4-5 hours
- Task 2.4 (Component Styling Setup): 1.5-2 hours
- Task 2.5 (Dismiss): 2-3 hours
- Task 2.6 (Components): 28-32 hours (16 component tasks + 2 infrastructure)
- Task 2.7 (Testing): 12-16 hours
- Task 2.8 (Examples): 9-12 hours
- Task 2.9 (Docs): 3.5 hours

**Note**: The upper range (87 hours) requires ~29 hours/week, which is above the initial target of 25 hours/week. Desktop components (Sidebar, Tabs, Popover) can be deferred to "Phase 2.5" if needed, saving ~14-18 hours.

**Critical Path**:
1. **Setup**: Component styling setup (2.4.x) must be done first
2. Navigation types (2.1.x) → Operators (2.2.x) → Components (2.6.x)
3. Stack types (2.1.2) → Stack helpers (2.3.x) → NavigationStack (2.6.7-2.6.8)
4. Testing (2.7.x) can happen in parallel with component development
5. Examples (2.8.x) after core implementation
6. Documentation (2.9.x) at the end

**Component Implementation Order** (recommended):
1. **First**: Complete setup tasks (2.4.1-2.4.3) - Tailwind config, utilities, dependencies
2. Start with Modal (2.6.1-2.6.2) to establish pattern - reference shadcn/Radix
3. Sheet and Drawer (mobile overlays) - copy Modal pattern
4. Sidebar (desktop persistent navigation) - new pattern
5. Tabs (desktop tabbed content) - keyboard navigation from Radix
6. Popover (contextual menus) - Floating UI positioning
7. NavigationStack and Alert last

**Deferred Items**:
- SvelteKit integration (optional, can be Phase 6)
- Advanced animations (Phase 4)
- DSL utilities (Phase 3)
- Focus management (Phase 5)

**Phase 2 Success Criteria**:
- Users can implement tree-based navigation with modals/sheets
- Stack-based navigation works for multi-screen flows
- Desktop navigation patterns supported (sidebar, tabs, popover)
- Mobile-first components work responsively
- Children can dismiss themselves via dependency
- All navigation is state-driven and testable
- Components provide good defaults with customization
- Primitives allow full styling control
- Examples demonstrate real-world usage (mobile + desktop)

**Key Principles**:
- State drives navigation (non-null = show, null = hide)
- Parent features observe child navigation events
- Navigation is composable through reducers
- Components are presentation-only, logic in reducers
- Testing uses TestStore for deterministic navigation flows

---

Ready to implement Phase 2! 🚀
