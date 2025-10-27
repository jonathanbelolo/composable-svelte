# Phase 3: DSL & Matcher APIs - Detailed Tasks

**Duration**: Week 5-7 (15-20 hours/week, ~3 weeks)
**Deliverable**: `@composable-svelte/core@0.3.0` with ergonomic DSL
**Spec References**:
- `navigation-dsl-spec.md` - DSL patterns and fluent APIs
- `navigation-matcher-spec.md` - Type-safe action matching
**Last Updated**: 2025-10-27
**Status**: 📋 READY TO START

---

## Overview

Phase 3 builds ergonomic, type-safe DSL (Domain-Specific Language) on top of the core navigation system from Phase 2. The goal is to reduce boilerplate by 70-90% while maintaining full type safety through template literal types and advanced TypeScript inference.

**Key Deliverables**:
- `createDestination()` - Auto-generates destination reducer + matcher APIs from child reducer map
- Matcher APIs - Type-safe case path matching (`is()`, `extract()`, `matchCase()`, `match()`, `on()`)
- `integrate()` - Fluent reducer composition builder
- `scopeTo()` - Fluent store scoping for components
- `<DestinationRouter>` - Declarative routing component
- Optional: Action builder utilities
- Complete inventory example demonstrating all DSL features

**Critical Requirements**:
- ✅ Template literal types (MANDATORY - provides autocomplete, typo detection, refactoring safety)
- ✅ Full type inference (no explicit type parameters in common cases)
- ✅ Backward compatible with Phase 2 manual patterns
- ✅ Performance targets: `is()` < 1µs, `match()` < 5µs

**Success Criteria**:
- Reduce destination definition boilerplate by 85%
- Reduce reducer integration boilerplate by 87%
- Reduce view scoping boilerplate by 90%
- Zero runtime overhead compared to manual patterns
- Full IDE autocomplete for case paths

---

## Task Breakdown

### Task 3.1: Destination Builder Core

#### Task 3.1.1: Define Destination Types
**Estimated Time**: 1 hour
**Dependencies**: Phase 2 complete
**File**: `packages/core/src/navigation/types.ts`

**Description**:
Define the core TypeScript types that enable template literal type inference for case paths. These types form the foundation for type-safe matcher APIs.

**What to do**:
- Add `DestinationState<T>` mapped type that extracts state union from reducer map
- Add `DestinationAction<T>` mapped type that extracts action union from reducer map
- Add `DestinationCasePath<T>` template literal type that generates valid case paths
- Add helper types for case path parsing (extract case type, extract action type)
- Ensure types work with discriminated unions (require `type` field)
- Add comprehensive JSDoc with examples showing type inference

**Spec Reference**:
- `navigation-matcher-spec.md` Section 2 - "Type System Foundation"
- `navigation-dsl-spec.md` Section 2.1 - "Type Generation"

**Acceptance Criteria**:
- [ ] `DestinationState<T>` correctly infers state union from reducer map
- [ ] `DestinationAction<T>` correctly infers action union from reducer map
- [ ] `DestinationCasePath<T>` generates template literal union (e.g., `'addItem.saveButtonTapped' | 'editItem.deleteButtonTapped'`)
- [ ] Type helper utilities extract case type and action type from path strings
- [ ] TypeScript compiler provides autocomplete for case paths
- [ ] Types work with at least 10 different reducers in map (no type system limits)

---

#### Task 3.1.2: Implement createDestination() Core
**Estimated Time**: 2.5 hours
**Dependencies**: Task 3.1.1
**File**: `packages/core/src/navigation/destination.ts`

**Description**:
Implement the core `createDestination()` function that takes a map of child reducers and auto-generates a destination reducer plus helper functions.

**What to do**:
- Create `createDestination<Reducers>()` function accepting reducer map
- Generate destination reducer that routes actions to correct child based on type matching
- Implement `initial()` helper for creating initial destination state
- Implement `extract()` helper for extracting child state by case type
- Return object with `{ reducer, initial, extract, _types }` structure
- Use mapped types to infer all return types from input reducers
- Ensure proper effect mapping (child effects must become parent actions)
- Handle edge cases (null state, action doesn't match any case)

**Important**: The generated reducer should have same behavior as manual `createDestinationReducer()` from Phase 2, but with full type inference.

**Spec Reference**:
- `navigation-dsl-spec.md` Section 2 - "createDestination() API"
- `navigation-spec.md` Section 6 - "Enum Destination Pattern" (for reducer behavior)

**Acceptance Criteria**:
- [ ] `createDestination()` accepts reducer map and returns destination object
- [ ] Generated `reducer` correctly routes actions to child reducers
- [ ] `initial(caseType, childState)` creates properly typed destination state
- [ ] `extract(state, caseType)` returns child state or null with correct type
- [ ] All types inferred automatically (no manual type annotations needed)
- [ ] Generated reducer handles null state correctly
- [ ] Child effects properly mapped to parent actions
- [ ] Works with complex reducer maps (5+ children)

---

#### Task 3.1.3: Add Basic Unit Tests for createDestination
**Estimated Time**: 1.5 hours
**Dependencies**: Task 3.1.2
**File**: `packages/core/src/navigation/__tests__/destination.test.ts`

**Description**:
Create comprehensive unit tests for `createDestination()` core functionality, verifying reducer routing, state creation, and type inference.

**What to do**:
- Test destination reducer routes actions to correct child
- Test `initial()` creates correct destination state structure
- Test `extract()` retrieves child state by case type
- Test `extract()` returns null for non-matching case
- Test null state handling in reducer
- Test effect mapping from child to parent
- Test with 2-3 different reducer configurations
- Verify type inference works (using type-level assertions if possible)

**Spec Reference**: `navigation-dsl-spec.md` Section 2.4 - "Testing Patterns"

**Acceptance Criteria**:
- [ ] All basic reducer routing tests pass
- [ ] State creation and extraction tests pass
- [ ] Null handling tests pass
- [ ] Effect mapping verified
- [ ] At least 15 test cases covering core functionality
- [ ] Tests run in < 100ms total

---

### Task 3.2: Store Enhancement for Reactive Matching

#### Task 3.2.1: Add subscribeToActions to Store
**Estimated Time**: 1.5 hours
**Dependencies**: Phase 1 Store implementation
**File**: `packages/core/src/store.svelte.ts`

**Description**:
Enhance the Phase 1 store implementation to support action subscriptions, enabling reactive effects that respond to specific actions. This is required for `Destination.on()` API.

**What to do**:
- Add `subscribeToActions()` method to Store interface
- Maintain a Set of action subscribers internally
- Notify all action subscribers AFTER state updates complete
- Pass both the action and new state to subscribers
- Return unsubscribe function that removes subscriber from Set
- Ensure proper cleanup when store is destroyed
- Handle synchronous dispatch (subscribers called before dispatch returns)

**Important**: Action subscribers must be called AFTER state updates to ensure they see the new state. Order: dispatch → update state → execute effects → notify action subscribers.

**Spec Reference**:
- `navigation-matcher-spec.md` Section 4.6 - "Reactive Subscriptions"
- `composable-svelte-spec.md` Section 2 - "Store Implementation" (for store structure)

**Acceptance Criteria**:
- [ ] `subscribeToActions(listener)` method added to Store
- [ ] Subscribers notified after state updates
- [ ] Subscribers receive action and new state as parameters
- [ ] Unsubscribe function works correctly
- [ ] Multiple subscribers can exist simultaneously
- [ ] Store cleanup removes all action subscribers
- [ ] No memory leaks (subscribers removed on unsubscribe)

---

#### Task 3.2.2: Test subscribeToActions
**Estimated Time**: 1 hour
**Dependencies**: Task 3.2.1
**File**: `packages/core/src/__tests__/store.test.ts` (extend existing)

**Description**:
Add comprehensive tests for action subscription mechanism, verifying correct notification order, cleanup, and edge cases.

**What to do**:
- Test action subscribers receive correct action and state
- Test subscribers notified after state updates (not before)
- Test unsubscribe removes subscriber
- Test multiple subscribers work independently
- Test dispatch with no subscribers doesn't error
- Test store.destroy() cleans up action subscribers
- Test synchronous subscriber doesn't break dispatch flow

**Spec Reference**: `navigation-matcher-spec.md` Section 4.6 - "Reactive Subscriptions"

**Acceptance Criteria**:
- [ ] All action subscription tests pass
- [ ] Notification order verified
- [ ] Cleanup verified (no memory leaks)
- [ ] At least 8 test cases covering edge cases
- [ ] Tests run in < 50ms

---

### Task 3.3: Matcher APIs

#### Task 3.3.1: Implement Destination.is()
**Estimated Time**: 1 hour
**Dependencies**: Task 3.1.2
**File**: `packages/core/src/navigation/destination.ts`

**Description**:
Implement boolean matcher that checks if an action matches a specific case path. Supports both full paths and prefix matching.

**What to do**:
- Add `is(action: unknown, casePath: CasePath): boolean` to createDestination return
- Unwrap action through layers: check parent action → presentation action → case type → child action
- Support full path matching: `'addItem.saveButtonTapped'` matches exact action type
- Support prefix matching: `'addItem'` matches any addItem action
- Return false for non-matching actions (don't throw errors)
- Ensure type safety: casePath must be valid template literal type
- Handle edge cases (null action, malformed action structure)

**Important**: This is the fastest matcher (< 1µs target). Keep implementation simple and avoid allocations.

**Spec Reference**: `navigation-matcher-spec.md` Section 4.1 - "Boolean Matching"

**Acceptance Criteria**:
- [ ] `is()` correctly identifies matching actions
- [ ] Full path matching works
- [ ] Prefix matching works (case type only)
- [ ] Returns false for non-matches (no errors)
- [ ] Type system prevents invalid case paths
- [ ] Performance: < 1µs per call (benchmark with 100k iterations)
- [ ] Handles malformed input gracefully

---

#### Task 3.3.2: Implement Destination.matchCase()
**Estimated Time**: 1.5 hours
**Dependencies**: Task 3.1.2, Task 3.3.1
**File**: `packages/core/src/navigation/destination.ts`

**Description**:
Implement atomic matcher that combines action matching and state extraction in a single operation. This is the most commonly used matcher API.

**What to do**:
- Add `matchCase(action, state, casePath)` to createDestination return
- Return child state if BOTH action matches AND state exists for case type
- Return null if action doesn't match OR state doesn't exist
- Infer return type from case path (e.g., `'addItem'` → `AddItemState | null`)
- Ensure type-safe: return type matches case type in path
- Handle all edge cases (null state, null action, wrong case type)
- Target < 2µs per call performance

**Important**: This replaces the common pattern of checking action type then extracting state. Single function call, fully type-safe.

**Spec Reference**: `navigation-matcher-spec.md` Section 4.3 - "Atomic Matching"

**Acceptance Criteria**:
- [ ] `matchCase()` returns child state when action matches and state exists
- [ ] Returns null when action doesn't match
- [ ] Returns null when action matches but state is for different case
- [ ] Return type correctly inferred from case path
- [ ] Works with all case types in destination
- [ ] Performance: < 2µs per call
- [ ] Handles edge cases without errors

---

#### Task 3.3.3: Implement Destination.match()
**Estimated Time**: 2 hours
**Dependencies**: Task 3.3.2
**File**: `packages/core/src/navigation/destination.ts`

**Description**:
Implement multi-case handler matcher that routes actions to typed handler functions. Enables declarative parent observation pattern.

**What to do**:
- Add `match<T>(action, state, handlers)` to createDestination return
- Accept handlers object mapping case paths to handler functions
- Check each handler in order (first match wins)
- For matching handler: extract state, call handler with state, return result
- Return `{ matched: true, value: T }` on match
- Return `{ matched: false }` if no handlers match
- Ensure handlers receive correctly typed child state
- Support multiple case paths for same case type (different actions)
- Target < 5µs per call with 5 handlers

**Important**: Handler functions must be type-safe. If case path is `'addItem.saveButtonTapped'`, handler receives `AddItemState` as parameter.

**Spec Reference**: `navigation-matcher-spec.md` Section 4.4 - "Multi-Case Matching"

**Acceptance Criteria**:
- [ ] `match()` routes to correct handler based on action
- [ ] Handlers receive correctly typed child state
- [ ] First matching handler wins (short-circuit behavior)
- [ ] Returns typed result from handler
- [ ] Returns `{ matched: false }` when no handlers match
- [ ] Works with 5+ handlers efficiently
- [ ] Performance: < 5µs per call with 5 handlers
- [ ] Type inference works (handler parameters typed automatically)

---

#### Task 3.3.4: Implement Destination.on()
**Estimated Time**: 1 hour
**Dependencies**: Task 3.2.1, Task 3.3.1
**File**: `packages/core/src/navigation/destination.ts`

**Description**:
Implement reactive subscription matcher that calls a handler whenever a specific case path action occurs. Used for analytics, logging, and side effects.

**What to do**:
- Add `on(store, casePath, handler)` to createDestination return
- Subscribe to store's action stream using `subscribeToActions()`
- Filter actions using `is(action, casePath)`
- Extract state using `extract()` or `matchCase()`
- Call handler with extracted state when match occurs
- Return unsubscribe function
- Ensure handler only called when action matches (not every action)
- Handler receives current state at time of action

**Important**: This requires store to implement `subscribeToActions()` from Task 3.2.1. Gracefully handle stores without this method (throw helpful error).

**Spec Reference**: `navigation-matcher-spec.md` Section 4.6 - "Reactive Subscriptions"

**Acceptance Criteria**:
- [ ] `on()` subscribes to store actions
- [ ] Handler called only for matching actions
- [ ] Handler receives correctly typed child state
- [ ] Unsubscribe function works correctly
- [ ] Works with prefix matching (all actions for a case)
- [ ] Throws helpful error if store doesn't support subscribeToActions
- [ ] No memory leaks (unsubscribe cleans up)

---

#### Task 3.3.5: Test All Matcher APIs
**Estimated Time**: 2 hours
**Dependencies**: Tasks 3.3.1-3.3.4
**File**: `packages/core/src/navigation/__tests__/matchers.test.ts`

**Description**:
Create comprehensive test suite for all matcher APIs, including type inference, edge cases, and performance benchmarks.

**What to do**:
- Test `is()` with full paths, prefix paths, non-matches
- Test `matchCase()` with various state/action combinations
- Test `match()` with multiple handlers, no matches, first-match-wins
- Test `on()` subscription, unsubscribe, multiple subscribers
- Test type inference (use type assertions where possible)
- Add performance benchmarks for each matcher
- Test error handling (malformed input, null values)
- Test integration between matchers (e.g., `is()` used in `on()`)

**Spec Reference**: `navigation-matcher-spec.md` Section 6 - "Test Suite"

**Acceptance Criteria**:
- [ ] All matcher APIs have >90% code coverage
- [ ] At least 30 test cases total
- [ ] Performance benchmarks confirm < 1µs (is), < 2µs (matchCase), < 5µs (match)
- [ ] Edge cases handled correctly
- [ ] Type inference verified
- [ ] Tests run in < 200ms total

---

### Task 3.4: Integration DSL

#### Task 3.4.1: Implement integrate() Builder
**Estimated Time**: 2 hours
**Dependencies**: Phase 2 (ifLet operator)
**File**: `packages/core/src/navigation/integrate.ts`

**Description**:
Implement fluent builder API for composing multiple child reducers into a parent reducer, reducing `ifLet()` integration boilerplate.

**What to do**:
- Create `integrate(coreReducer)` function that returns IntegrationBuilder
- Implement `IntegrationBuilder` class with `.with(field, childReducer)` method
- Support chaining multiple `.with()` calls
- Implement `.build()` that returns final composed reducer
- Use `ifLet()` from Phase 2 under the hood for each integration
- Ensure proper effect batching (combine all child effects)
- Maintain type safety throughout chain
- Support both optional fields and destination fields

**Important**: Each `.with()` call wraps previous reducer with `ifLet()`. Order matters - earlier integrations are inner layers.

**Spec Reference**: `navigation-dsl-spec.md` Section 3 - "Reducer Integration DSL"

**Acceptance Criteria**:
- [ ] `integrate(reducer)` returns builder
- [ ] `.with(field, childReducer)` chains correctly
- [ ] `.build()` returns working reducer
- [ ] Composed reducer routes actions to children correctly
- [ ] Effects from all children batched properly
- [ ] Type inference maintains parent/child action types
- [ ] Works with 3+ child integrations
- [ ] Can integrate destination reducers (from createDestination)

---

#### Task 3.4.2: Test integrate() Builder
**Estimated Time**: 1.5 hours
**Dependencies**: Task 3.4.1
**File**: `packages/core/src/navigation/__tests__/integrate.test.ts`

**Description**:
Test fluent integration builder with various reducer configurations, ensuring correct action routing and effect handling.

**What to do**:
- Test single child integration
- Test multiple child integrations (2-3 children)
- Test action routing to correct child
- Test effect batching from multiple children
- Test integration with createDestination results
- Test type safety (if possible with type assertions)
- Test integration order (earlier .with() calls = inner layers)
- Compare behavior to manual ifLet() composition (should be identical)

**Spec Reference**: `navigation-dsl-spec.md` Section 3.3 - "Testing Integration"

**Acceptance Criteria**:
- [ ] Single and multiple integrations work correctly
- [ ] Action routing verified
- [ ] Effect batching verified
- [ ] At least 12 test cases
- [ ] Equivalent to manual ifLet() composition
- [ ] Tests run in < 100ms

---

### Task 3.5: Scope Helpers

#### Task 3.5.1: Implement scopeTo() Fluent API
**Estimated Time**: 2.5 hours
**Dependencies**: Phase 2 (scopeToDestination)
**File**: `packages/core/src/navigation/scope.ts`

**Description**:
Implement fluent store scoping API for components, enabling `.into(field).case(type)` chaining to create scoped stores.

**What to do**:
- Create `scopeTo(store)` function that returns ScopeBuilder
- Implement `ScopeBuilder` class with:
  - `.into(field)` - Navigate into object field
  - `.case(caseType)` - Extract specific case from destination union
  - `.optional()` - Unwrap nullable value
- Return scoped store with `{ state, dispatch }` or null
- Build action wrapper in reverse (innermost to outermost)
- Ensure dispatch wraps actions in correct nested structure
- Support chaining multiple `.into()` calls for deep navigation
- Maintain type safety - each step narrows types correctly

**Important**: Action wrapping must build nested structure in reverse. If path is `store.into('a').into('b')`, action becomes `{ type: 'a', action: { type: 'b', action: childAction } }`.

**Spec Reference**: `navigation-dsl-spec.md` Section 4 - "Scope Helpers"

**Acceptance Criteria**:
- [ ] `scopeTo(store)` returns builder
- [ ] `.into(field)` navigates into object correctly
- [ ] `.case(type)` extracts case from destination
- [ ] `.optional()` unwraps nullable correctly
- [ ] Returns null when path doesn't exist
- [ ] Scoped dispatch wraps actions correctly
- [ ] Type inference works (scoped store has correct types)
- [ ] Supports deep chaining (3+ levels)

---

#### Task 3.5.2: Test scopeTo() API
**Estimated Time**: 1.5 hours
**Dependencies**: Task 3.5.1
**File**: `packages/core/src/navigation/__tests__/scope.test.ts`

**Description**:
Test fluent scoping API with various path configurations, verifying correct state extraction and action wrapping.

**What to do**:
- Test `.into()` navigation
- Test `.case()` extraction
- Test `.optional()` unwrapping
- Test chained paths (`.into('a').into('b')`)
- Test dispatch action wrapping at each level
- Test null handling (path doesn't exist)
- Test integration with createDestination destinations
- Verify type inference (if possible)

**Spec Reference**: `navigation-dsl-spec.md` Section 4.3 - "Testing Scope Helpers"

**Acceptance Criteria**:
- [ ] All scoping operations work correctly
- [ ] Action wrapping verified for nested paths
- [ ] Null handling works
- [ ] At least 15 test cases
- [ ] Works with real destination states
- [ ] Tests run in < 100ms

---

### Task 3.6: View Components

#### Task 3.6.1: Implement DestinationRouter Component
**Estimated Time**: 2 hours
**Dependencies**: Task 3.5.1, Phase 2 navigation components
**File**: `packages/core/src/navigation-components/DestinationRouter.svelte`

**Description**:
Create declarative routing component that maps destination cases to Svelte components and presentation styles, eliminating manual scoping boilerplate in views.

**What to do**:
- Define component props: `store`, `field` (destination field name), `routes` (route config)
- Each route config has: `component`, `presentation` ('modal' | 'sheet' | 'drawer' | etc.)
- Use `scopeTo()` to create scoped store for each active route
- Render appropriate navigation component (Modal/Sheet/etc.) based on presentation
- Pass scoped store to child component
- Support snippet for custom rendering
- Handle route changes reactively
- Use `{#key}` or proper keying to avoid stale component instances

**Important**: Use Svelte 5 generics (`<script generics>`) for type-safe route configuration. Routes object keys should match destination case types.

**Spec Reference**: `navigation-dsl-spec.md` Section 5 - "View Bindings"

**Acceptance Criteria**:
- [ ] Component accepts store, field, and routes props
- [ ] Renders correct component for active destination case
- [ ] Uses correct presentation component (Modal/Sheet/etc.)
- [ ] Scoped store passed to child component correctly
- [ ] Handles route changes reactively
- [ ] Handles null destination (renders nothing)
- [ ] Type-safe route configuration
- [ ] Works with all navigation component types

---

#### Task 3.6.2: Test DestinationRouter Component
**Estimated Time**: 1.5 hours
**Dependencies**: Task 3.6.1
**File**: `packages/core/src/navigation-components/__tests__/DestinationRouter.test.ts`

**Description**:
Test declarative router component with various route configurations, verifying correct rendering and scoping.

**What to do**:
- Test renders correct component for destination case
- Test uses correct presentation component
- Test scoped store passed correctly
- Test null destination (no render)
- Test route switching (case changes)
- Test with 2-3 different route configurations
- Test snippet customization
- Verify reactivity (destination changes update view)

**Spec Reference**: `navigation-dsl-spec.md` Section 5.3 - "Testing Router"

**Acceptance Criteria**:
- [ ] All routing scenarios work correctly
- [ ] Scoped store verified
- [ ] At least 10 test cases
- [ ] Reactivity verified
- [ ] Works with browser mode testing
- [ ] Tests run in < 200ms

---

### Task 3.7: Action Builders (Optional)

#### Task 3.7.1: Implement Function-Based Action Builders
**Estimated Time**: 1.5 hours (optional)
**Dependencies**: Task 3.1.2
**File**: `packages/core/src/navigation/action-builder.ts`

**Description**:
Create utility functions for building deeply nested actions, reducing boilerplate when dispatching to destination children. Function-based approach recommended over proxy for type safety.

**What to do**:
- Create helper function `createActionBuilder(caseType)` for building case actions
- Return builder object with methods matching child action types
- Each method returns properly structured parent action
- Ensure full type inference (no manual type annotations)
- Support both destination actions and presentation actions
- Provide examples in JSDoc
- Keep implementation simple (avoid complex proxy magic)

**Important**: This is optional enhancement. Function-based approach recommended over proxy for better IDE support and refactorability.

**Spec Reference**: `navigation-dsl-spec.md` Section 6 - "Action Builders"

**Acceptance Criteria**:
- [ ] Action builder creates correctly structured actions
- [ ] Type inference works (builder methods typed from child actions)
- [ ] Supports destination and presentation wrapping
- [ ] Simple implementation (no proxies)
- [ ] JSDoc examples provided
- [ ] Works with createDestination destinations

---

### Task 3.8: Testing & Quality

#### Task 3.8.1: Type-Level Tests
**Estimated Time**: 2 hours
**Dependencies**: All core implementation tasks
**File**: `packages/core/src/navigation/__tests__/types.test.ts`

**Description**:
Create type-level tests to verify template literal type inference, autocomplete, and compile-time type safety.

**What to do**:
- Use `tsd` or `vitest` type assertions library
- Test template literal type generation for case paths
- Test invalid case paths cause type errors
- Test type inference through matchers (return types)
- Test type inference through scopeTo chains
- Test type inference through integrate builder
- Test autocomplete (verify expected types exist)
- Document expected type errors (negative tests)

**Spec Reference**: `navigation-matcher-spec.md` Section 3 - "Type System"

**Acceptance Criteria**:
- [ ] Template literal types generate correct case paths
- [ ] Invalid paths rejected at compile time
- [ ] Matcher return types correctly inferred
- [ ] Scope chain types correctly inferred
- [ ] At least 20 type-level assertions
- [ ] Negative tests verify type errors
- [ ] Tests run during type checking

---

#### Task 3.8.2: Performance Benchmarks
**Estimated Time**: 1 hour
**Dependencies**: All matcher tasks complete
**File**: `packages/core/src/navigation/__tests__/performance.bench.ts`

**Description**:
Create performance benchmarks for all matcher APIs to verify they meet performance targets.

**What to do**:
- Benchmark `is()` with 100k iterations (target: < 100ms total = < 1µs per call)
- Benchmark `extract()` with 100k iterations (target: < 50ms total)
- Benchmark `matchCase()` with 100k iterations (target: < 200ms total)
- Benchmark `match()` with 5 handlers, 100k iterations (target: < 500ms total)
- Compare to manual pattern matching (baseline)
- Report results in CI (warn if targets not met)
- Test with realistic action/state objects (not trivial data)

**Spec Reference**: `navigation-matcher-spec.md` Section 7.2 - "Performance Targets"

**Acceptance Criteria**:
- [ ] All matchers meet performance targets
- [ ] Benchmarks run in CI
- [ ] Comparison to manual patterns included
- [ ] Results documented
- [ ] No significant overhead vs manual approach (< 10% difference)

---

#### Task 3.8.3: Integration Testing
**Estimated Time**: 2 hours
**Dependencies**: All implementation complete
**File**: `packages/core/src/navigation/__tests__/integration.test.ts`

**Description**:
Create end-to-end integration tests that combine multiple DSL features in realistic scenarios.

**What to do**:
- Test complete flow: createDestination → integrate → scopeTo → component render
- Test parent observing child with Destination.match()
- Test reactive subscriptions with Destination.on()
- Test DestinationRouter with scoped stores
- Test complex scenarios (3-level nesting, multiple destinations)
- Use TestStore from Phase 1 for deterministic testing
- Verify complete type safety throughout flow
- Compare DSL approach to manual Phase 2 approach (same behavior)

**Acceptance Criteria**:
- [ ] Complete flows work end-to-end
- [ ] All DSL features integrate correctly
- [ ] TestStore assertions pass
- [ ] At least 10 integration scenarios
- [ ] Behavior matches manual Phase 2 patterns
- [ ] Tests run in < 300ms

---

### Task 3.9: Example Application

#### Task 3.9.1: Create Inventory Management Example
**Estimated Time**: 4 hours
**Dependencies**: All core implementation complete
**File**: `examples/inventory/`

**Description**:
Build complete inventory management example application demonstrating all Phase 3 DSL features. This serves as both documentation and integration test.

**What to do**:
- Create inventory app with CRUD operations (Add, Edit, Delete, Detail views)
- Use `createDestination()` for all destinations
- Use `integrate()` for reducer composition
- Use `scopeTo()` in all components for store scoping
- Use `Destination.match()` for parent observation
- Use `DestinationRouter` for declarative routing
- Include at least 4 destination cases
- Add unit tests using TestStore
- Document architecture in README.md
- Show before/after comparison (Phase 2 manual vs Phase 3 DSL)

**Important**: This example should showcase 70-90% boilerplate reduction compared to manual Phase 2 approach. README should highlight the differences.

**Spec Reference**: `navigation-dsl-spec.md` Section 8 - "Complete Example"

**Acceptance Criteria**:
- [ ] Inventory app functional with all CRUD operations
- [ ] All DSL features demonstrated
- [ ] At least 20 tests passing
- [ ] README documents architecture
- [ ] Before/after comparison included
- [ ] Runs without errors
- [ ] Type-safe throughout (zero TypeScript errors)

---

### Task 3.10: Documentation

#### Task 3.10.1: Write DSL Guide
**Estimated Time**: 3 hours
**Dependencies**: All implementation complete
**File**: `docs/DSL-GUIDE.md`

**Description**:
Create comprehensive guide for DSL features, explaining when and how to use each API.

**What to do**:
- Document `createDestination()` with complete example
- Document all matcher APIs (is, extract, matchCase, match, on)
- Document `integrate()` builder
- Document `scopeTo()` chains
- Document `DestinationRouter` component
- Include migration guide from Phase 2 manual patterns
- Add decision tree: when to use which API
- Include common patterns and anti-patterns
- Add performance considerations
- Link to inventory example

**Spec Reference**: `navigation-dsl-spec.md` Section 9 - "Documentation Requirements"

**Acceptance Criteria**:
- [ ] All DSL APIs documented with examples
- [ ] Migration guide included
- [ ] Decision tree for API selection
- [ ] Common patterns documented
- [ ] At least 10 complete code examples
- [ ] Links to relevant specs
- [ ] Integrated with existing documentation

---

#### Task 3.10.2: Update Core README
**Estimated Time**: 1 hour
**Dependencies**: Task 3.10.1
**File**: `packages/core/README.md`

**Description**:
Update main README to include Phase 3 features, DSL quick start, and updated roadmap.

**What to do**:
- Add Phase 3 features to features list
- Add DSL quick start example (createDestination + matchers)
- Update roadmap marking Phase 3 complete
- Add link to DSL-GUIDE.md
- Update examples section with inventory app
- Show before/after: manual vs DSL approach
- Update installation/requirements if needed

**Acceptance Criteria**:
- [ ] Phase 3 features listed
- [ ] DSL quick start included
- [ ] Roadmap updated
- [ ] Links to documentation
- [ ] Before/after comparison clear
- [ ] README renders correctly

---

#### Task 3.10.3: Create Phase 3 Completion Summary
**Estimated Time**: 1 hour
**Dependencies**: All Phase 3 tasks complete
**File**: `plans/phase-3/PHASE-3-COMPLETION-SUMMARY.md`

**Description**:
Create completion summary documenting Phase 3 achievements, metrics, and readiness for Phase 4.

**What to do**:
- Document all features delivered
- Report final test metrics
- Document boilerplate reduction percentages
- Note any deviations from plan
- Verify all success criteria met
- List key learnings
- Assess readiness for Phase 4 (Animation)
- Provide recommendations for Phase 4

**Acceptance Criteria**:
- [ ] All deliverables documented
- [ ] Metrics reported
- [ ] Success criteria verified
- [ ] Completion summary comprehensive
- [ ] Ready for Phase 4 assessment

---

## Summary

### Total Estimated Time
- **Core Implementation**: 18-21 hours
  - Destination builder: 5 hours
  - Store enhancement: 2.5 hours
  - Matcher APIs: 8.5 hours
  - Integration DSL: 3.5 hours
  - Scope helpers: 4 hours
  - View components: 3.5 hours
  - Action builders: 1.5 hours (optional)
- **Testing**: 8.5 hours
  - Unit tests: 5 hours
  - Type tests: 2 hours
  - Performance benchmarks: 1 hour
  - Integration tests: 2 hours
- **Example Application**: 4 hours
- **Documentation**: 5 hours
- **Buffer**: 4-6 hours
- **Total**: 40-44 hours (~2-3 weeks at 15-20 hours/week)

### Critical Path
1. Destination types (3.1.1) → createDestination core (3.1.2) → Basic tests (3.1.3)
2. Matcher APIs (3.3.1-3.3.4) → Matcher tests (3.3.5)
3. Store enhancement (3.2.1-3.2.2) → Destination.on() (3.3.4)
4. Integration DSL (3.4.1-3.4.2) [parallel with matchers]
5. Scope helpers (3.5.1-3.5.2) [parallel with integration]
6. DestinationRouter (3.6.1-3.6.2)
7. Example app (3.9.1) → Documentation (3.10.1-3.10.3)

### Key Principles

1. **Type Safety First**: Template literal types are MANDATORY, not optional
2. **Performance Matters**: All matchers must meet performance targets
3. **Backward Compatible**: Phase 2 manual patterns must still work
4. **Zero Overhead**: DSL should compile to same code as manual patterns
5. **Progressive Enhancement**: Each API usable independently
6. **Documentation Heavy**: DSL requires excellent docs to be discoverable

### Success Metrics
- ✅ 85% reduction in destination definition boilerplate
- ✅ 87% reduction in reducer integration boilerplate
- ✅ 90% reduction in view scoping boilerplate
- ✅ All matchers meet performance targets (< 1µs, < 2µs, < 5µs)
- ✅ Zero TypeScript errors in example app
- ✅ Full IDE autocomplete for case paths
- ✅ 100% test coverage for core APIs

---

**Status**: Ready to begin Phase 3 implementation
**Next Step**: Task 3.1.1 - Define Destination Types
**Deliverable**: `@composable-svelte/core@0.3.0` with complete DSL
