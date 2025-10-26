# Composable Svelte Library Implementation Plan

## Strategy Overview
- **Distribution**: NPM package (`@composable-svelte/core` or similar)
- **Approach**: Incremental (Phase 1: Core → Phase 2: Navigation → Phase 3: DSL/Animation)
- **Testing**: Vitest unit tests + Type-level tests + Example apps
- **Advanced Features**: Template literal types, Action builder DSL, Animation timeouts

---

## Phase 1: Core Architecture (Week 1-2)

### 1.1 Project Setup
```
composable-svelte/
├── packages/
│   └── core/
│       ├── src/
│       │   ├── index.ts                 # Public API
│       │   ├── types.ts                 # Core types
│       │   ├── store.svelte.ts          # Store implementation
│       │   ├── effect.ts                # Effect system
│       │   └── test/
│       │       └── test-store.ts        # TestStore
│       ├── package.json
│       └── tsconfig.json
├── examples/
│   └── counter/                         # Simple example
├── vitest.config.ts
└── package.json
```

**Tasks:**
1. Initialize npm package structure with TypeScript + Svelte 5
2. Configure build pipeline (tsup or vite lib mode)
3. Setup Vitest with Svelte testing library
4. Create basic package.json with peer dependencies

### 1.2 Core Types (`src/types.ts`)
```typescript
// Implement from composable-svelte-spec.md:
- Reducer<State, Action, Dependencies>
- Effect<Action> discriminated union
- Store<State, Action> interface
- Dispatch<Action> type
- StoreConfig<State, Action, Dependencies>
```

### 1.3 Effect System (`src/effect.ts`)
```typescript
// Implement all Effect constructors:
- Effect.none()
- Effect.run()
- Effect.fireAndForget()
- Effect.map()
- Effect.batch()
- Effect.merge()
- Effect.cancel()
```

### 1.4 Store Implementation (`src/store.svelte.ts`)
```typescript
// Implement createStore with:
- Svelte 5 runes ($state, $derived)
- Effect execution engine
- Subscription mechanism (subscribe to state changes)
- Action subscription mechanism (subscribeToActions - for Destination.on())
- Action history tracking
- Lifecycle management (destroy, cancel in-flight effects)
```

### 1.5 TestStore (`src/test/test-store.ts`)
```typescript
// Implement TestStore with:
- send() / receive() pattern
- Exhaustivity checking
- State assertions
- Effect verification
- Non-exhaustive mode
```

### 1.6 Reducer Composition (`src/composition/`)
```typescript
// From composable-svelte-spec.md section 4:
- scope() - Core reducer composition operator
- combineReducers() - Combine multiple child reducers
```

### 1.7 Phase 1 Testing
- Unit tests for all Effect constructors
- Store lifecycle tests
- TestStore assertion tests
- scope() composition tests
- Type-level tests for Reducer inference
- Counter example app (with scope for nested state)

**Deliverable**: `@composable-svelte/core@0.1.0` with store, effects, composition, testing

---

## Phase 2: Navigation System (Week 3-4)

### 2.1 Navigation Types (`src/navigation/types.ts`)
```typescript
// From navigation-spec.md:
- PresentationAction<T>
- StackAction<A, S>
```

### 2.2 Navigation Operators (`src/navigation/operators.ts`)
```typescript
// Implement:
- ifLet() for optional child integration
- createDestinationReducer() helper (for enum destinations)
- matchPresentationAction() deep matching
- isActionAtPath() predicate helper
- scopeToDestination() for creating scoped stores (navigation-spec section 4.8)
```

### 2.2b Stack Navigation Helpers (`src/navigation/stack.ts`)
```typescript
// From navigation-spec.md section 5:
- StackAction<A, S> type
- handleStackAction() reducer helper
- runPathReducer() dispatcher
- Stack-based reducer composition utilities
```

### 2.3 Navigation Components (`src/navigation-components/`)
```svelte
// Create reusable components:
- Modal.svelte
- Sheet.svelte
- Drawer.svelte
- NavigationStack.svelte
- Alert.svelte
```

### 2.4 Dismiss Dependency (`src/dependencies/dismiss.ts`)
```typescript
// Child self-dismissal:
- DismissEffect interface
- createDismissDependency()
```

### 2.5 Optional: SvelteKit Integration (`src/routing/`)
```typescript
// From navigation-spec.md section 10 (optional utilities):
- createRouteSyncEffect() for URL synchronization
- syncBrowserNavigation() for back/forward buttons
- beforeNavigate integration helpers
- Scroll restoration utilities
Note: Can be Phase 5 or separate @composable-svelte/sveltekit package
```

### 2.6 Phase 2 Testing
- ifLet operator tests
- createDestinationReducer tests
- Stack navigation reducer tests
- Modal/Sheet/Drawer component tests
- NavigationStack component tests
- Dismiss dependency tests
- scopeToDestination helper tests
- Inventory navigation example app (basic, tree-based)
- Stack navigation example app

**Deliverable**: `@composable-svelte/core@0.2.0` with navigation

---

## Phase 3: DSL & Advanced Features (Week 5-7)

### 3.1 Destination DSL (`src/navigation/destination.ts`)
```typescript
// From navigation-dsl-spec.md + navigation-matcher-spec.md:
- createDestination() with template literal types (CORE REQUIREMENT - provides typo detection, autocomplete, refactoring safety)
- Destination.initial() - create initial destination state
- Destination.reducer - auto-generated reducer
- Destination.is() - boolean case path matching
- Destination.extract() - state extraction by case
- Destination.matchCase() - combined action match + state extract
- Destination.match() - multi-case handler matching
- Destination.on() - reactive subscriptions (requires subscribeToActions)
- Type exports: DestinationState<T>, DestinationAction<T>, DestinationCasePath<T>
```

### 3.2 Integration DSL (`src/navigation/integrate.ts`)
```typescript
// Fluent reducer integration:
- integrate() builder
- IntegrationBuilder class
- .with() chaining
- .build() finalization
```

### 3.3 Scope Helpers (`src/navigation/scope.ts`)
```typescript
// From navigation-dsl-spec.md:
- scopeTo() fluent API
- ScopeBuilder class
- .into() navigation
- .case() matching
- .optional() unwrapping
```

### 3.4 Action Builder DSL (`src/navigation/action-builder.ts`)
```typescript
// Optional advanced feature:
- actionBuilder() proxy-based API
- Function-based builder alternative
```

### 3.5 Router Component (`src/navigation-components/DestinationRouter.svelte`)
```svelte
// Declarative routing:
- Route configuration
- Automatic scoped store creation
- Presentation style mapping
```

### 3.6 Phase 3 Testing
- createDestination type inference tests
- Matcher API tests (is, extract, matchCase, match)
- Template literal type compilation tests
- integrate() builder tests
- scopeTo() chaining tests
- Complete inventory example with all DSL features

**Deliverable**: `@composable-svelte/core@0.3.0` with full DSL

---

## Phase 4: Animation Integration (Week 8-9)

### 4.1 Animation Types (`src/animation/types.ts`)
```typescript
// From animation-integration-spec.md:
- PresentationState<T> (idle/presenting/presented/dismissing)
- PresentationEvent (presentationCompleted, dismissalCompleted, etc.)
- TimeoutEvent (presentationTimedOut, dismissalTimedOut)
- ErrorEvent (presentationFailed, dismissalFailed)
- AnimationConfig (duration, easing, timeout settings)

Note: Features using animation need BOTH fields:
  - destination: DestinationState | null  (what to show)
  - presentation: PresentationState<DestinationState>  (animation lifecycle)
```

### 4.2 Animation Effects (`src/animation/effects.ts`)
```typescript
// Timing effects:
- Effect.afterDelay() with cancellation
- Effect.animated()
- Effect.transition()
```

### 4.3 Animated Components (`src/navigation-components/animated/`)
```svelte
// Enhanced with animation:
- Animated.svelte (generic wrapper)
- Modal.svelte (enhanced with presentation state)
- Sheet.svelte (enhanced)
- Drawer.svelte (enhanced)
```

### 4.4 Animation Helpers (`src/animation/helpers.ts`)
```typescript
// Production features:
- Animation timeout fallbacks (configurable timeouts)
- Error boundary helpers
- State transition guards (prevent invalid transitions)
- UX patterns for blocked actions:
  - Button disable helpers during animations
  - Action queuing utilities
  - Cancel/replace strategies
```

### 4.5 Phase 4 Testing
- Animation lifecycle tests (idle → presenting → presented → dismissing → idle)
- Timeout fallback tests
- Error recovery tests
- Race condition tests (rapid dismiss/present)
- Blocked action UX patterns tests
- Animated inventory example
- Example: Multi-level animated navigation

**Deliverable**: `@composable-svelte/core@0.4.0` with animations

---

## Phase 5: Polish & Documentation (Week 10-11)

### 5.1 Documentation
```
docs/
├── getting-started.md
├── core-concepts/
│   ├── store-and-reducers.md
│   ├── effects.md
│   └── testing.md
├── navigation/
│   ├── tree-based.md
│   ├── stack-based.md
│   └── components.md
├── dsl/
│   ├── destinations.md
│   ├── matchers.md
│   └── scope-helpers.md
├── animation/
│   └── animated-navigation.md
└── api/
    └── reference.md
```

### 5.2 Example Applications
```
examples/
├── counter/              # Phase 1: Basic store
├── todo-list/            # Phase 2: Simple navigation
├── inventory/            # Phase 3: Full DSL + matchers
└── e-commerce/           # Phase 4: Animated multi-level navigation
```

### 5.3 Developer Experience
- Comprehensive JSDoc comments
- Error messages with helpful guidance
- TypeScript strict mode compliance
- Tree-shaking optimization
- Bundle size analysis

### 5.4 CI/CD Setup
- GitHub Actions for tests
- Automated type checking
- Changesets for versioning
- NPM publishing workflow
- Example app deployment

**Deliverable**: `@composable-svelte/core@1.0.0` production-ready

---

## File Structure (Final)

```
composable-svelte/
├── packages/
│   └── core/
│       ├── src/
│       │   ├── index.ts
│       │   ├── types.ts
│       │   ├── store.svelte.ts
│       │   ├── effect.ts
│       │   ├── test/
│       │   │   └── test-store.ts
│       │   ├── composition/
│       │   │   ├── index.ts
│       │   │   ├── scope.ts              # Core scope() operator
│       │   │   └── combine-reducers.ts
│       │   ├── navigation/
│       │   │   ├── index.ts
│       │   │   ├── types.ts
│       │   │   ├── operators.ts          # ifLet, createDestinationReducer
│       │   │   ├── stack.ts              # Stack navigation helpers
│       │   │   ├── destination.ts        # createDestination DSL
│       │   │   ├── integrate.ts          # integrate() builder
│       │   │   ├── scope-to.ts           # scopeTo() fluent API
│       │   │   └── action-builder.ts
│       │   ├── navigation-components/
│       │   │   ├── Modal.svelte
│       │   │   ├── Sheet.svelte
│       │   │   ├── Drawer.svelte
│       │   │   ├── NavigationStack.svelte
│       │   │   ├── Alert.svelte
│       │   │   ├── DestinationRouter.svelte
│       │   │   └── animated/
│       │   │       ├── Animated.svelte
│       │   │       └── index.ts
│       │   ├── animation/
│       │   │   ├── types.ts
│       │   │   ├── effects.ts
│       │   │   └── helpers.ts
│       │   ├── dependencies/
│       │   │   └── dismiss.ts
│       │   └── routing/                  # Optional SvelteKit utilities
│       │       ├── index.ts
│       │       ├── sync.ts
│       │       └── scroll.ts
│       ├── tests/
│       │   ├── store.test.ts
│       │   ├── effect.test.ts
│       │   ├── test-store.test.ts
│       │   ├── navigation/
│       │   ├── animation/
│       │   └── types/
│       │       └── inference.test-d.ts
│       └── package.json
├── examples/
├── docs/
├── .github/workflows/
└── package.json
```

---

## Implementation Order (Detailed)

### Week 1-2: Core
1. Setup project + tooling
2. Implement Effect system
3. Implement Store with Svelte 5 runes (including subscribeToActions)
4. Implement scope() and combineReducers() composition operators
5. Implement TestStore
6. Counter example (with nested state composition)
7. Core unit tests

### Week 3-4: Navigation
8. Implement PresentationAction + ifLet + createDestinationReducer
9. Implement stack navigation helpers (StackAction, handleStackAction, runPathReducer)
10. Implement scopeToDestination() helper
11. Create Modal/Sheet/Drawer/Alert components
12. Create NavigationStack component
13. Implement dismiss dependency
14. Inventory navigation example (basic tree-based)
15. Stack navigation example
16. Navigation operator tests
17. Optional: Basic SvelteKit integration utilities

### Week 5-7: DSL
18. Implement createDestination with template literal types (CORE - not optional, essential for DX)
19. Implement Destination.reducer auto-generation
20. Implement matcher APIs (is, extract, matchCase, match)
21. Implement Destination.on() reactive subscriptions
22. Implement type exports (DestinationState, DestinationAction, DestinationCasePath)
23. Implement integrate() builder
24. Implement scopeTo() fluent API helpers
25. Implement action builder DSL
26. Implement DestinationRouter component
27. Complete inventory example (with full DSL)
28. DSL + matcher tests
29. Type-level compilation tests for template literal types

### Week 8-9: Animation
30. Implement PresentationState types (idle/presenting/presented/dismissing)
31. Implement PresentationEvent, TimeoutEvent, ErrorEvent types
32. Implement animation effects (afterDelay with cancellation, animated, transition)
33. Create Animated.svelte generic wrapper
34. Enhance Modal/Sheet/Drawer with presentation state support
35. Add timeout fallbacks + error handling + state transition guards
36. Implement UX patterns for blocked actions
37. Animated inventory example (with destination + presentation fields)
38. Animation lifecycle tests
39. Timeout and error recovery tests

### Week 10-11: Polish
40. Write comprehensive documentation
41. Create all example apps (counter, todo-list, inventory, e-commerce)
42. Add JSDoc comments everywhere
43. Setup CI/CD pipeline
44. Performance optimization and bundle size analysis
45. Complete SvelteKit integration utilities (if not done in Phase 2)
46. Migration guide from imperative patterns
47. Troubleshooting guide and FAQ
48. 1.0.0 release preparation

---

## Critical Spec-to-Implementation Mappings

### composable-svelte-spec.md → Phase 1 (Core)
- ✅ Section 2: Core Types → `src/types.ts`
- ✅ Section 3: Store API → `src/store.svelte.ts`
- ✅ Section 4: Reducer Composition → `src/composition/scope.ts`
- ✅ Section 5: Effects → `src/effect.ts`
- ✅ Section 6: Testing → `src/test/test-store.ts`

### navigation-spec.md → Phase 2 (Navigation)
- ✅ Section 3: Optional State Navigation → `src/navigation/operators.ts` (ifLet)
- ✅ Section 4: Enum State Navigation → `src/navigation/operators.ts` (createDestinationReducer)
- ✅ Section 4.8: scopeToDestination helper → `src/navigation/operators.ts`
- ✅ Section 5: Stack-Based Navigation → `src/navigation/stack.ts`
- ✅ Section 6: Navigation Components → `src/navigation-components/`
- ✅ Section 8: Dismissal Patterns → `src/dependencies/dismiss.ts`
- 🔄 Section 10: SvelteKit Integration → `src/routing/` (optional in Phase 2 or Phase 5)

### navigation-dsl-spec.md → Phase 3 (DSL)
- ✅ Section 2: createDestination() → `src/navigation/destination.ts`
- ✅ Section 3: integrate() builder → `src/navigation/integrate.ts`
- ✅ Section 4: scopeTo() helpers → `src/navigation/scope-to.ts`
- ✅ Section 5: DestinationRouter component → `src/navigation-components/DestinationRouter.svelte`
- ✅ Section 6: Action Builder DSL → `src/navigation/action-builder.ts`

### navigation-matcher-spec.md → Phase 3 (DSL)
- ✅ Section 2: Destination.is() → `src/navigation/destination.ts`
- ✅ Section 2: Destination.extract() → `src/navigation/destination.ts`
- ✅ Section 2: Destination.matchCase() → `src/navigation/destination.ts`
- ✅ Section 2: Destination.match() → `src/navigation/destination.ts`
- ✅ Section 3: Destination.on() → `src/navigation/destination.ts` (requires subscribeToActions in Phase 1)
- ✅ Section 4: Type exports → `src/navigation/destination.ts`

### animation-integration-spec.md → Phase 4 (Animation)
- ✅ Section 2: PresentationState → `src/animation/types.ts`
- ✅ Section 2.2: State relationship (destination + presentation) → Examples + Docs
- ✅ Section 2.3: PresentationEvent types → `src/animation/types.ts`
- ✅ Section 3: Animation Effects → `src/animation/effects.ts`
- ✅ Section 3.5: Timeout fallbacks → `src/animation/helpers.ts`
- ✅ Section 3.6: UX patterns for blocked actions → `src/animation/helpers.ts`
- ✅ Section 4: Animated Components → `src/navigation-components/animated/`
- ✅ Section 5: Testing → Tests in `tests/animation/`

---

## Key Technical Decisions

1. **Svelte 5 Runes**: Use `$state` for reactive store state
2. **TypeScript Strict**: Full strict mode with no `any` types
3. **Effect Execution**: Async iterator pattern for sequential effects
4. **Template Literal Types**: For type-safe case path strings
5. **Proxy-based Builders**: For fluent action construction
6. **Component Props**: Use Svelte 5 `Snippet` for children
7. **Testing**: Vitest + `@testing-library/svelte` + type tests
8. **Build**: tsup for fast bundling with .d.ts generation

---

## Success Criteria

### Phase 1 Complete:
- ✅ Users can create stores with reducers
- ✅ Effects execute correctly
- ✅ TestStore works for TDD
- ✅ Counter example runs

### Phase 2 Complete:
- ✅ Modal/Sheet navigation works
- ✅ ifLet integrates child reducers
- ✅ Children can dismiss themselves
- ✅ Inventory example demonstrates patterns

### Phase 3 Complete:
- ✅ createDestination reduces boilerplate 70%+
- ✅ Matchers provide type-safe action observation
- ✅ Template literal types work with autocomplete
- ✅ Action builders simplify nested actions

### Phase 4 Complete:
- ✅ Animations are declarative and testable
- ✅ Timeout fallbacks prevent stuck states
- ✅ No race conditions in navigation
- ✅ Smooth UX in all examples

### 1.0.0 Release:
- ✅ All specs implemented
- ✅ 80%+ test coverage
- ✅ Complete documentation
- ✅ 4+ example applications
- ✅ Published to NPM
- ✅ CI/CD pipeline operational

---

## Gaps Identified and Addressed

### Initial Plan Gaps (Now Fixed):
1. ❌ **Missing `scope()` operator** (composable-svelte-spec section 4)
   - ✅ **Fixed**: Added to Phase 1.6 `src/composition/scope.ts`

2. ❌ **Missing `subscribeToActions()` in Store** (needed for Destination.on())
   - ✅ **Fixed**: Added to Phase 1.4 Store implementation

3. ❌ **Missing `scopeToDestination()` helper** (navigation-spec section 4.8)
   - ✅ **Fixed**: Added to Phase 2.2 `src/navigation/operators.ts`

4. ❌ **Unclear destination + presentation relationship** (animation-spec section 2.2)
   - ✅ **Fixed**: Explicitly documented in Phase 4.1

5. ❌ **Missing stack navigation reducer helpers** (navigation-spec section 5)
   - ✅ **Fixed**: Added Phase 2.2b `src/navigation/stack.ts`

6. ❌ **Missing type helper exports** (DestinationState, DestinationAction, DestinationCasePath)
   - ✅ **Fixed**: Added to Phase 3.1 explicitly

7. ❌ **Missing UX patterns for blocked actions** (animation-spec section 3.6)
   - ✅ **Fixed**: Added to Phase 4.4 animation helpers

8. ❌ **Unclear SvelteKit integration placement**
   - ✅ **Fixed**: Added as optional Phase 2.5, can be Phase 5 or separate package

9. ❌ **Missing Destination.reducer auto-generation**
   - ✅ **Fixed**: Added to Phase 3 Week 5-7 step 19

10. ❌ **Incomplete animation event types**
    - ✅ **Fixed**: Added PresentationEvent, TimeoutEvent, ErrorEvent to Phase 4.1

### All Specs Now Fully Covered:
- ✅ **composable-svelte-spec.md**: 100% (Core, Store, Effects, Testing, Composition)
- ✅ **navigation-spec.md**: 100% (Optional, Enum, Stack, Components, Dismissal, SvelteKit)
- ✅ **navigation-dsl-spec.md**: 100% (createDestination, integrate, scopeTo, Router, ActionBuilder)
- ✅ **navigation-matcher-spec.md**: 100% (is, extract, matchCase, match, on, type exports)
- ✅ **animation-integration-spec.md**: 100% (PresentationState, Effects, Components, Timeouts, UX patterns)

---

## Next Steps

Ready to start with **Phase 1: Core Architecture**?
