# Phase 1: Core Architecture - Detailed Tasks

**Duration**: Week 1-2
**Deliverable**: `@composable-svelte/core@0.1.0` with store, effects, composition, testing
**Spec Reference**: `composable-svelte-spec.md`
**Last Updated**: 2025-10-26
**Status**: ✅ READY TO START - Corrections merged from phase-1-corrections.md

---

## Corrections Summary (2025-10-26)

This plan has been corrected and is now **100% aligned** with `composable-svelte-spec.md`. The following critical errors were fixed:

### 1. Effect Types (Task 1.2.1, 1.3.1) - FIXED ✅
- **Removed**: `MergeEffect`, `CancelEffect` (do not exist in spec)
- **Added**: `CancellableEffect`, `DebouncedEffect`, `ThrottledEffect`, `AfterDelayEffect`
- **Total**: 8 effect types (not 6)

### 2. Store Implementation (Task 1.4.1) - FIXED ✅
- **Removed**: Merge effects sequential execution
- **Added**: Cancellable effects with AbortController, debounced effects with timer management, throttled effects with rate limiting, afterDelay effects with setTimeout
- **Added clarity**: `subscribeToActions()` is for Phase 3's `Destination.on()` matcher API

### 3. combineReducers() (Task 1.6.2) - FIXED ✅
- **Corrected description**: Each reducer handles a **different slice of state** (NOT same state sequentially)
- **Added example**: Shows slice-based composition pattern
- **Updated acceptance criteria**: Verifies slice isolation

### 4. Time Estimate - UPDATED ✅
- **Original**: 28-32 hours
- **Revised**: 30-34 hours
- **Reason**: Additional timing-based effects (debounced, throttled, afterDelay) add ~2 hours

All spec references verified and line numbers added where applicable.

---

## Task 1.1: Project Setup & Infrastructure

### Task 1.1.1: Initialize Repository Structure
**Estimated Time**: 1-2 hours
**Dependencies**: None

**Description**:
Set up the monorepo structure with workspaces for the core package and examples. Create the folder hierarchy that matches the Phase 1 file structure defined in the implementation plan.

**What to do**:
- Create `packages/core/` directory structure with `src/` and `tests/` subdirectories
- Create `examples/counter/` directory for the Phase 1 example
- Initialize root `package.json` with workspace configuration for `packages/*` and `examples/*`
- Set up `.gitignore` to exclude build artifacts, dependencies, and IDE files
- Configure package manager workspaces (pnpm recommended)

**Note**: This task has been verified against the spec and is correct as written.

**Acceptance Criteria**:
- [ ] Folder structure matches Phase 1 specification
- [ ] Root package.json correctly references workspaces
- [ ] Build artifacts and node_modules are gitignored
- [ ] Package manager recognizes workspace structure

---

### Task 1.1.2: Configure TypeScript
**Estimated Time**: 1 hour
**Dependencies**: Task 1.1.1

**Description**:
Configure TypeScript with strict mode settings to enforce type safety across the entire codebase. Create separate configurations for source code and tests.

**What to do**:
- Create root `tsconfig.json` with strict mode enabled (no implicit any, strict null checks, etc.)
- Target ES2020 for modern browser support
- Configure module resolution for Svelte and ESM
- Create `packages/core/tsconfig.json` that extends root config
- Create `packages/core/tsconfig.test.json` for test-specific settings
- Enable declaration file generation (.d.ts) for library consumers

**Spec Reference**: Implementation plan - "Key Technical Decisions #2"

**Acceptance Criteria**:
- [ ] TypeScript strict mode fully enabled
- [ ] No `any` types allowed without explicit annotation
- [ ] Declaration files configured to generate
- [ ] Test configuration includes vitest types
- [ ] Module resolution supports Svelte 5

---

### Task 1.1.3: Configure Build Pipeline
**Estimated Time**: 2 hours
**Dependencies**: Task 1.1.2

**Description**:
Set up Vite in library mode to build the package as ES modules with proper TypeScript declaration files. Configure for tree-shaking and optimal bundle size.

**What to do**:
- Install and configure Vite with `@sveltejs/vite-plugin-svelte`
- Create `vite.config.ts` for library mode with ES module output
- Configure build to generate source maps
- Set up TypeScript declaration file generation
- Add build scripts to package.json
- Configure peer dependencies for Svelte 5
- Set up package.json exports field for proper module resolution

**Spec Reference**: CLAUDE.md - "Recommended Build Setup"

**Acceptance Criteria**:
- [ ] `pnpm build` generates ES modules in dist/
- [ ] Declaration files (.d.ts) are generated
- [ ] Source maps are included
- [ ] Svelte files (.svelte.ts) are supported
- [ ] Output is tree-shakeable
- [ ] Package exports field correctly configured

---

### Task 1.1.4: Setup Vitest with Testing Library
**Estimated Time**: 1 hour
**Dependencies**: Task 1.1.3

**Description**:
Configure Vitest as the test runner with jsdom environment for component testing. Set up test utilities and automatic cleanup.

**What to do**:
- Install Vitest, jsdom, and @testing-library/svelte
- Create root `vitest.config.ts` with globals and jsdom environment
- Configure test file patterns to find all `.test.ts` files
- Set up test setup file for automatic cleanup after each test
- Configure coverage reporting (v8 provider)
- Add test scripts to package.json (test, test:ui, test:coverage)

**Spec Reference**: Implementation plan section 1.1 - "Setup Vitest"

**Acceptance Criteria**:
- [ ] `pnpm test` runs vitest
- [ ] DOM environment available for component tests
- [ ] Automatic cleanup runs after each test
- [ ] `pnpm test:ui` opens Vitest UI
- [ ] Coverage reporting configured
- [ ] Test globals available (describe, it, expect)

---

## Task 1.2: Core Types Implementation

### Task 1.2.1: Define Base Types
**Estimated Time**: 2 hours
**Dependencies**: Task 1.1.2
**File**: `packages/core/src/types.ts`

**Description**:
Implement all core TypeScript types and interfaces that form the foundation of the architecture. These types define the contracts for reducers, effects, stores, and dependencies.

**What to do**:
- Define `Reducer<State, Action, Dependencies>` function type
- Define `Dispatch<Action>` callback type
- Define `Dependencies` as extensible record type
- Define `Effect<Action>` as discriminated union with all 8 effect types:
  - NoneEffect
  - RunEffect
  - FireAndForgetEffect
  - BatchEffect
  - CancellableEffect ✅ (cancels in-flight effects by ID)
  - DebouncedEffect ✅ (debounces execution by ID and delay)
  - ThrottledEffect ✅ (throttles execution by ID and interval)
  - AfterDelayEffect ✅ (executes after delay)
- Define `Store<State, Action>` interface with state, dispatch, subscribe, subscribeToActions, destroy
- Define `StoreConfig<State, Action, Dependencies>` for store creation
- Add comprehensive JSDoc comments to all exports

**Spec Reference**: `composable-svelte-spec.md` Section 2 - "Core Types"

**Acceptance Criteria**:
- [ ] All types exported from types.ts
- [ ] Effect is a proper discriminated union
- [ ] Readonly constraints enforced where appropriate
- [ ] JSDoc comments on all public types
- [ ] Type tests verify inference works correctly
- [ ] No `any` types used

---

## Task 1.3: Effect System Implementation

### Task 1.3.1: Implement Effect Constructors
**Estimated Time**: 3 hours
**Dependencies**: Task 1.2.1
**File**: `packages/core/src/effect.ts`

**Description**:
Implement the Effect namespace with all constructor functions. These are pure functions that create effect data structures - they don't execute effects, just describe them.

**What to do**:
- Implement `Effect.none()` - returns NoneEffect (no side effects)
- Implement `Effect.run(execute)` - creates RunEffect with dispatch callback for async work
- Implement `Effect.fireAndForget(execute)` - creates FireAndForgetEffect for non-dispatching async work
- Implement `Effect.batch(...effects)` - combines effects for parallel execution
- Implement `Effect.cancellable(id, execute)` - creates CancellableEffect that can be cancelled by ID ✅
- Implement `Effect.debounced(id, ms, execute)` - creates DebouncedEffect that debounces by ID and delay ✅
- Implement `Effect.throttled(id, ms, execute)` - creates ThrottledEffect that throttles by ID and interval ✅
- Implement `Effect.afterDelay(ms, execute)` - creates AfterDelayEffect that executes after delay ✅
- Implement `Effect.map(effect, transform)` - transforms child actions to parent actions
- Add JSDoc with examples for each constructor

**Important**:
- Effect.map must handle all 8 effect types: none, run, fireAndForget, batch, cancellable ✅, debounced ✅, throttled ✅, afterDelay ✅
- Effect.map should recursively transform nested effects in batch
- Cancellable/debounced/throttled effects preserve their IDs during transformation ✅

**Spec Reference**: `composable-svelte-spec.md` Section 7.1 - Effect Constructors (lines 1060-1211)

**Acceptance Criteria**:
- [ ] All eight effect constructors implemented: none, run, fireAndForget, batch, cancellable ✅, debounced ✅, throttled ✅, afterDelay ✅
- [ ] Effect.map correctly transforms actions for all 8 effect types
- [ ] Effect.map preserves effect structure (batch remains batch, etc.)
- [ ] Effect.map preserves IDs for cancellable/debounced/throttled effects ✅
- [ ] Comprehensive unit tests for each constructor
- [ ] JSDoc examples provided for each function
- [ ] Type inference works without explicit type parameters

---

## Task 1.4: Store Implementation

### Task 1.4.1: Implement createStore with Svelte 5 Runes
**Estimated Time**: 4-5 hours
**Dependencies**: Task 1.3.1
**File**: `packages/core/src/store.svelte.ts`

**Description**:
Implement the core store using Svelte 5's `$state` rune for reactivity. The store manages state updates, executes effects, handles subscriptions, and manages effect lifecycle (including cancellation).

**What to do**:
- Use Svelte 5 `$state` rune to create reactive state
- Implement `dispatch(action)` that runs reducer, updates state, and queues effects
- Implement state subscription mechanism with immediate notification
- Implement action subscription mechanism (`subscribeToActions()` - needed for Destination.on() in Phase 3)
- Build effect execution engine that processes effects after state updates
- Implement batch effects (parallel execution) ✅
- Handle cancellable effects using AbortController ✅
- Implement debounced effects with timer management ✅
- Implement throttled effects with rate limiting ✅
- Implement afterDelay effects with setTimeout ✅
- Track in-flight effects for cleanup (AbortController, timers)
- Implement destroy() to cancel all in-flight effects and clear timers ✅
- Ensure effects are executed asynchronously after state updates complete

**Important design decisions**:
- Effects should execute AFTER state has been updated and subscribers notified
- Effect queue should process asynchronously to avoid blocking state updates
- subscribeToActions() should notify BEFORE reducer runs (for observability)
- State subscribers should be notified AFTER reducer runs
- Cancellation should use AbortController pattern for proper cleanup

**Spec Reference**: `composable-svelte-spec.md` Section 7.2 - Store Implementation (lines 1215-1427)

**Note on subscribeToActions()**: While optional in the spec, this is implemented in Phase 1 for Phase 3's `Destination.on()` matcher API to avoid rework later.

**Acceptance Criteria**:
- [ ] Store state is reactive using Svelte 5 $state rune
- [ ] dispatch() updates state via reducer
- [ ] subscribe() notifies listeners immediately with current state
- [ ] subscribeToActions() implemented for Phase 3 matcher API (Destination.on())
- [ ] Effects execute asynchronously after state updates
- [ ] Batch effects run in parallel ✅
- [ ] Cancellable effects can be cancelled via ID ✅
- [ ] Debounced effects reset timer on repeated calls ✅
- [ ] Throttled effects rate-limit execution ✅
- [ ] AfterDelay effects execute after specified timeout ✅
- [ ] destroy() cancels all in-flight effects and clears timers ✅
- [ ] destroy() clears all subscriptions
- [ ] Comprehensive test coverage for all scenarios

---

## Task 1.5: TestStore Implementation

### Task 1.5.1: Implement TestStore with Exhaustivity Checking
**Estimated Time**: 3-4 hours
**Dependencies**: Task 1.4.1
**File**: `packages/core/src/test/test-store.ts`

**Description**:
Create a specialized store for testing that provides send/receive pattern for asserting on actions dispatched by effects. It should verify that all expected actions are received and no unexpected actions occur.

**What to do**:
- Create TestStore class that wraps a regular store
- Implement `send(action, assert?)` to dispatch actions and optionally assert state
- Implement `receive(expectedAction, assert?, timeout?)` to wait for and verify effect-dispatched actions
- Implement `finish(timeout?)` to verify exhaustivity (no unexpected actions)
- Track all dispatched actions via subscribeToActions()
- Support exhaustive and non-exhaustive modes
- Implement timeout handling for receive() with clear error messages
- Implement action deep equality checking with helpful mismatch messages
- Create `createTestStore(config, options?)` convenience function
- Handle async timing properly - allow effects time to start before checking

**Error handling**:
- Timeout errors should show what was expected vs received
- Mismatch errors should clearly show the difference
- Exhaustivity errors should list unexpected actions

**Spec Reference**: `composable-svelte-spec.md` Section 6 - "Testing"

**Acceptance Criteria**:
- [ ] send() dispatches actions synchronously
- [ ] receive() waits for effects to dispatch actions
- [ ] receive() validates action deep equality
- [ ] finish() checks exhaustivity in exhaustive mode
- [ ] Non-exhaustive mode supported via options
- [ ] Timeout errors are clear and helpful
- [ ] Mismatch errors show expected vs actual
- [ ] Tests verify all TestStore functionality
- [ ] TestStore class and factory function both exported

---

## Task 1.6: Reducer Composition

### Task 1.6.1: Implement scope() Operator
**Estimated Time**: 3 hours
**Dependencies**: Task 1.4.1
**File**: `packages/core/src/composition/scope.ts`

**Description**:
Implement the core reducer composition operator that embeds a child reducer into a parent reducer. It handles extracting child state, running the child reducer, embedding the result, and lifting child effects to parent actions.

**What to do**:
- Implement `scope()` function that takes five parameters:
  - `getChild`: Extract child state from parent state
  - `setChild`: Embed child state back into parent state
  - `getChildAction`: Extract child action from parent action (returns null if not a child action)
  - `liftChildAction`: Wrap child action into parent action
  - `childReducer`: The child reducer to compose
- Returns a new parent reducer
- Use Effect.map() to lift child effects to parent effects
- If getChildAction returns null, return parent state unchanged with Effect.none()
- Ensure proper type inference for all generic parameters

**Spec Reference**: `composable-svelte-spec.md` Section 4 - "Reducer Composition"

**Acceptance Criteria**:
- [ ] scope() correctly composes child reducer into parent
- [ ] Child state extraction and embedding works
- [ ] Child actions are filtered correctly
- [ ] Child effects are lifted to parent actions via Effect.map()
- [ ] Non-child actions return state unchanged
- [ ] Type inference works without explicit type parameters
- [ ] Tests cover state updates, effect lifting, and action filtering

---

### Task 1.6.2: Implement combineReducers()
**Estimated Time**: 2 hours
**Dependencies**: Task 1.4.1
**File**: `packages/core/src/composition/combine-reducers.ts`

**Description**:
Implement a Redux-style utility to combine multiple reducers where each reducer handles a **different slice of state**. This enables modular state management where each reducer manages its own field in the parent state object (NOT sequential processing of the same state).

**What to do**:
- Implement `combineReducers(reducers)` that accepts an object mapping state keys to reducers
- Each reducer processes its own slice of state independently ✅
- Collect all effects from all reducers (skip Effect.none())
- Return combined state object and batched effects
- Only create new state object if at least one slice changed ✅
- If no effects, return Effect.none()
- If one effect, return it directly
- If multiple effects, return Effect.batch()

**Example Usage**:
```typescript
const appReducer = combineReducers({
  counter: counterReducer,  // Handles state.counter
  todos: todosReducer       // Handles state.todos
});
```

**Spec Reference**: `composable-svelte-spec.md` Section 7.3 - Reducer Utilities (lines 1432-1473)

**Acceptance Criteria**:
- [ ] Each reducer handles its own state slice independently ✅
- [ ] State object structure preserved (keys match reducer keys) ✅
- [ ] Only creates new state object if a slice changed ✅
- [ ] Effects are batched correctly
- [ ] Effect.none() returned when no effects
- [ ] Single effect returned directly (not batched)
- [ ] Tests verify slice isolation and effect batching ✅

---

### Task 1.6.3: Create Composition Index
**Estimated Time**: 5 minutes
**Dependencies**: Tasks 1.6.1, 1.6.2
**File**: `packages/core/src/composition/index.ts`

**Description**:
Create barrel export for composition utilities.

**What to do**:
- Export scope and combineReducers from their respective files

**Acceptance Criteria**:
- [ ] Both functions exported
- [ ] Import from `./composition` works

---

## Task 1.7: Public API & Examples

### Task 1.7.1: Create Public API Export
**Estimated Time**: 30 minutes
**Dependencies**: Tasks 1.2.1, 1.3.1, 1.4.1, 1.5.1, 1.6.3
**File**: `packages/core/src/index.ts`

**Description**:
Create the main entry point that exports all public APIs. This is what consumers of the library will import from.

**What to do**:
- Export all types from types.ts
- Export createStore from store.svelte.ts
- Export Effect namespace from effect.ts
- Export composition utilities (scope, combineReducers)
- Export TestStore and createTestStore from test/
- Add package-level JSDoc comment
- Organize exports into logical groups with comments

**Acceptance Criteria**:
- [ ] All public APIs exported
- [ ] Exports organized into clear groups
- [ ] JSDoc comment describes the package
- [ ] No internal implementation details exposed

---

### Task 1.7.2: Create Counter Example
**Estimated Time**: 2 hours
**Dependencies**: Task 1.7.1
**Files**:
- `examples/counter/package.json`
- `examples/counter/src/App.svelte`
- `examples/counter/src/counter.ts`
- `examples/counter/index.html`
- `examples/counter/vite.config.ts`

**Description**:
Build a simple counter example that demonstrates the core concepts: state management, actions, effects, and async operations. The example should be minimal but show key features.

**What to do**:
- Set up counter example as a workspace package
- Create counter feature with state (count, isLoading)
- Create actions: increment, decrement, incrementAsync, incrementDelayed
- Implement reducer with Effect.run() for async increment
- Create Svelte component that uses the store
- Show button disable during loading state
- Add basic styling
- Configure Vite for development server

**Features to demonstrate**:
- Basic state updates (increment/decrement)
- Async effects with Effect.run()
- Loading states
- UI updates based on state
- Action dispatching from components

**Spec Reference**: Implementation plan section 1.7 - "Counter example app"

**Acceptance Criteria**:
- [ ] Counter increments and decrements correctly
- [ ] Async increment shows loading state
- [ ] Button disabled during async operation
- [ ] `pnpm dev` runs the example
- [ ] Example demonstrates Effect.run() pattern
- [ ] Code is clean and well-commented
- [ ] Example serves as learning resource

---

## Task 1.8: Documentation & Testing

### Task 1.8.1: Add Package README
**Estimated Time**: 1 hour
**Dependencies**: All previous tasks

**Description**:
Create a README for the core package that provides installation instructions, quick start guide, and overview of Phase 1 features.

**What to do**:
- Add installation instructions
- Provide minimal quick start example
- List Phase 1 features
- Link to counter example
- Add note that full documentation comes in Phase 5
- Include license information

**Acceptance Criteria**:
- [ ] Installation instructions clear
- [ ] Quick start example works
- [ ] Features list accurate
- [ ] Links to example provided
- [ ] Professional and concise

---

### Task 1.8.2: Run Comprehensive Test Suite
**Estimated Time**: 1 hour
**Dependencies**: All implementation tasks

**Description**:
Verify that all tests pass, type checking succeeds, build works, and the example runs correctly.

**What to do**:
- Run full test suite and verify all pass
- Run type checker and fix any errors
- Run build and verify output
- Run counter example and test all features
- Check test coverage (should be >80%)
- Fix any issues discovered

**Acceptance Criteria**:
- [ ] `pnpm test` - all tests pass
- [ ] `pnpm typecheck` - no type errors
- [ ] `pnpm build` - builds successfully
- [ ] Counter example works correctly
- [ ] Test coverage >80%
- [ ] No linter errors

---

### Task 1.8.3: Create Phase 1 Completion Summary
**Estimated Time**: 30 minutes
**Dependencies**: Task 1.8.2
**File**: `plans/phase-1-completed.md`

**Description**:
Document what was completed in Phase 1, including metrics, files created, and verification that success criteria were met.

**What to do**:
- List all completed tasks
- Record test coverage percentage
- List all files created with line counts
- Verify all Phase 1 success criteria met
- Document any deviations from plan
- Note any learnings or issues
- Confirm readiness for Phase 2

**Success Criteria from Implementation Plan**:
- Users can create stores with reducers
- Effects execute correctly
- TestStore works for TDD
- Counter example runs

**Acceptance Criteria**:
- [ ] All tasks marked complete
- [ ] Metrics recorded (coverage, files, lines)
- [ ] Success criteria verified
- [ ] Deviations documented
- [ ] Ready for Phase 2

---

## Summary

**Total Estimated Time**: 30-34 hours (2 weeks at 15-20 hours/week)

**Time Increase from Original Estimate (28-32 hours)**:
- Added ~2 hours for debounced, throttled, and afterDelay effects implementation and testing
- More complex store effect execution engine with timer management
- Additional test cases for timing-based effects

**Critical Path**:
1. Setup (Tasks 1.1.x) → Types (1.2.1) → Effects (1.3.1) → Store (1.4.1) → TestStore (1.5.1)
2. Composition (1.6.x) can happen in parallel with TestStore
3. Public API (1.7.1) requires all implementation complete
4. Example (1.7.2) requires public API
5. Documentation (1.8.x) happens at the end

**Phase 1 Deliverables**:
- Working `@composable-svelte/core` package published to workspace
- Complete test suite with >80% coverage
- Counter example demonstrating core features
- Solid foundation for Phase 2 navigation system

**Key Principles for Implementation**:
- Follow the specs closely - they are the source of truth
- Write tests alongside implementation (TDD where possible)
- Use TypeScript's type system to catch errors early
- Keep effects as pure data structures
- Ensure Svelte 5 runes used correctly for reactivity
