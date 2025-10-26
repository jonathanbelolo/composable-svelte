# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository contains **specifications** for a Composable Architecture library for Svelte 5, inspired by The Composable Architecture (TCA) from Swift/iOS. This is a **specification-first** project - the implementation does not yet exist, only detailed specifications.

**Current Status**: Pre-implementation (specification phase only)

## Repository Structure

```
composable-svelte/
├── specs/                           # Detailed specifications (implementation guides)
│   └── frontend/
│       ├── composable-svelte-spec.md        # Core architecture (store, reducers, effects)
│       ├── navigation-spec.md               # Tree-based navigation patterns
│       ├── navigation-dsl-spec.md           # Ergonomic DSL for navigation
│       ├── navigation-matcher-spec.md       # Type-safe action matching
│       └── animation-integration-spec.md    # Animated presentation lifecycle
├── plans/
│   └── implementation-plan.md       # 11-week phased implementation roadmap
└── .claude/
    └── settings.local.json          # Claude Code configuration
```

## Specification Architecture

The specs define five interrelated systems:

### 1. Core Architecture (`composable-svelte-spec.md`)
- **Reducer Pattern**: Pure functions `(state, action, deps) => [newState, effect]`
- **Store System**: Svelte 5 runes-based reactive store
- **Effect System**: Declarative side effects (run, fireAndForget, batch, map, merge, cancel)
- **Reducer Composition**: `scope()` for embedding child reducers, `combineReducers()` for multiple children
- **TestStore**: Exhaustive action testing with send/receive pattern

**Key Types**:
```typescript
Reducer<State, Action, Dependencies>
Store<State, Action>
Effect<Action> = Run | FireAndForget | None | Batch | Merge | Cancel
```

### 2. Navigation System (`navigation-spec.md`)
- **Tree-Based Navigation**: State-driven navigation via optional/enum state fields
- **PresentationAction**: Wraps child actions with `{ type: 'presented'; action: T } | { type: 'dismiss' }`
- **ifLet Operator**: Integrate optional child features
- **createDestinationReducer**: Route actions to enum-based destination reducers
- **Navigation Components**: Modal, Sheet, Drawer, NavigationStack, Alert
- **Dismiss Dependency**: Children can dismiss themselves via `deps.dismiss()`
- **SvelteKit Integration**: URL synchronization, browser back/forward handling

**State Pattern**:
```typescript
interface ParentState {
  destination: DestinationState | null;  // What to show
}

type DestinationState =
  | { type: 'addItem'; state: AddItemState }
  | { type: 'editItem'; state: EditItemState }
```

### 3. Navigation DSL (`navigation-dsl-spec.md`)
- **createDestination()**: Generate destination reducer + types from reducer map
- **integrate()**: Fluent reducer composition (`.with('field', childReducer).build()`)
- **scopeTo()**: Fluent store scoping for views (`.into('field').case('type')`)
- **DestinationRouter**: Declarative routing component
- **Action Builders**: Reduce nested action boilerplate

**Function Disambiguation**:
- `scope()` (core spec): Compose child reducer into parent **reducer** (business logic layer)
- `ifLet()` (navigation spec): Handle optional child state in **reducers** (navigation layer)
- `scopeTo()` (DSL spec): Create scoped store for **components** (view layer)

### 4. Matcher API (`navigation-matcher-spec.md`)
- **Case Paths**: Type-safe path strings like `'addItem.saveButtonTapped'`
- **Destination.is()**: Boolean check if action matches path
- **Destination.extract()**: Extract child state by case type
- **Destination.matchCase()**: Match action + extract state atomically
- **Destination.match()**: Multi-case handler matching
- **Destination.on()**: Reactive subscriptions (requires `store.subscribeToActions()`)

**Usage**:
```typescript
const editState = Destination.matchCase(action, state, 'editItem.saveButtonTapped');
if (editState) {
  // editState is EditItemState, action matched saveButtonTapped
}
```

### 5. Animation System (`animation-integration-spec.md`)
- **PresentationState**: Lifecycle tracking (`idle | presenting | presented | dismissing`)
- **Dual Fields**: `destination` (what) + `presentation` (animation lifecycle)
- **Animation Effects**: `Effect.afterDelay()`, `Effect.animated()`, `Effect.transition()`
- **State Guards**: Prevent invalid transitions (e.g., dismiss during presenting)
- **Timeout Fallbacks**: Recover from animation failures (2-3x expected duration)
- **UX Patterns**: Disable buttons during animation, queue actions, handle cancellation

**State Pattern**:
```typescript
interface FeatureState {
  destination: DestinationState | null;           // From navigation spec
  presentation: PresentationState<DestinationState>;  // Animation lifecycle
}
```

## Implementation Roadmap

See `plans/implementation-plan.md` for the complete 11-week phased plan:

- **Phase 1 (Weeks 1-2)**: Core architecture - store, effects, composition, TestStore
- **Phase 2 (Weeks 3-4)**: Navigation system - ifLet, enum destinations, components, dismiss
  - **Note**: SvelteKit integration (section 2.5 in plan) is DEFERRED - skip for initial release
- **Phase 3 (Weeks 5-7)**: DSL + matchers - createDestination, integrate, scopeTo, matcher APIs
- **Phase 4 (Weeks 8-9)**: Animation integration - PresentationState, animated effects, timeout fallbacks
  - **Note**: Animation is REQUIRED - this phase is critical for 1.0.0
- **Phase 5 (Weeks 10-11)**: Polish, documentation, examples, CI/CD, 1.0.0 release

**Distribution**: NPM package `@composable-svelte/core`

**Future Phases** (post-1.0.0):
- Phase 6: SvelteKit integration utilities (optional, separate package possible)

## Key Concepts

### Reducer Composition
Reducers compose via the `scope()` operator (for permanent children) or `ifLet()` (for optional/navigation children):

```typescript
// scope() for permanent child (composable-svelte-spec)
const appReducer = scope(
  (s) => s.counter,
  (s, c) => ({ ...s, counter: c }),
  (a) => a.type === 'counter' ? a.action : null,
  (ca) => ({ type: 'counter', action: ca }),
  counterReducer
);

// ifLet() for optional child (navigation-spec)
const [state, effect] = ifLet(
  (s) => s.destination,
  (s, d) => ({ ...s, destination: d }),
  (a) => a.type === 'destination' ? a.action : null,
  (ca) => ({ type: 'destination', action: ca }),
  destinationReducer
)(state, action, deps);
```

### Navigation Flow
1. User action → Populate `destination` field with child state
2. Component derives scoped store: `scopeTo(store).into('destination').case('addItem')`
3. Modal/Sheet renders when scoped store is non-null
4. Child actions wrapped: `{ type: 'destination', action: { type: 'presented', action: childAction } }`
5. Dismiss via `PresentationAction.dismiss` or parent setting `destination: null`

### Animation Flow
1. User action → Set `destination` + `presentation: { status: 'presenting', content, duration }`
2. Dispatch `Effect.afterDelay(duration, () => presentationCompleted)`
3. On `presentationCompleted` → Update `presentation: { status: 'presented', content }`
4. User dismisses → Set `presentation: { status: 'dismissing', content }`
5. On `dismissalCompleted` → Clear both `destination: null` + `presentation: { status: 'idle' }`

### Testing Philosophy
Use `TestStore` for exhaustive action testing:

```typescript
await store.send({ type: 'addButtonTapped' }, (state) => {
  expect(state.destination?.type).toBe('addItem');
});

await store.receive({ type: 'presentation', event: { type: 'presentationCompleted' } }, (state) => {
  expect(state.presentation.status).toBe('presented');
});
```

## Important Implementation Notes

### Type Safety Requirements
- **Template Literal Types**: Use for case path autocomplete (`'addItem.saveButtonTapped'`)
- **Discriminated Unions**: All action/state enums must have `type` field
- **Strict TypeScript**: No `any` types, full inference, exhaustiveness checks

### Effect System
- Effects are **data structures** (not executed immediately)
- Store executes effects **after** state updates
- Use `Effect.batch()` to combine multiple effects
- Use `Effect.map()` to transform child effects to parent actions
- Cancellable effects tracked by ID for cleanup

### Animation Guards
Always validate state before transitions:
```typescript
case 'closeButtonTapped': {
  if (state.presentation.status !== 'presented') {
    return [state, Effect.none()]; // Guard prevents invalid transition
  }
  // ...proceed with dismissal
}
```

### Store.subscribeToActions()
The matcher API's `Destination.on()` requires stores to implement `subscribeToActions(listener)`. This is **optional** but recommended for reactive effects. The implementation should notify subscribers **after** state updates.

## Common Patterns

### Parent Observing Child Actions
Use matchers to detect child events in parent reducer:

```typescript
const result = Destination.match(action, state, {
  'addItem.saveButtonTapped': (addState) => ({ type: 'add', item: addState.item }),
  'editItem.saveButtonTapped': (editState) => ({ type: 'edit', item: editState.item })
});

if (result.matched) {
  const { type, item } = result.value;
  // Handle save in parent reducer
}
```

### Timeout Fallbacks
Always include timeout fallbacks for critical animations:

```typescript
Effect.batch(
  Effect.afterDelay(300, (d) => d({ type: 'presentationCompleted' })),
  Effect.afterDelay(600, (d) => d({ type: 'presentationTimeout' }))  // 2x expected duration
)
```

### Blocked Actions During Animation
Disable UI elements when animations are in progress:

```svelte
<button
  disabled={store.state.presentation.status === 'presenting' ||
            store.state.presentation.status === 'dismissing'}
>
  Add Item
</button>
```

## Relationship to TCA (The Composable Architecture)

This library is heavily inspired by TCA for Swift but adapted for Svelte/TypeScript:

| TCA (Swift) | Composable Svelte |
|-------------|-------------------|
| `@Reducer` macro | Manual reducer functions |
| `@Presents` macro | `destination: T \| null` field |
| `Scope` | `scope()` / `ifLet()` operators |
| `@Dependency(\.dismiss)` | `deps.dismiss()` |
| `TestStore` | `TestStore` (similar API) |
| SwiftUI views | Svelte components |
| `Effect.run` | `Effect.run()` |

## Working with This Repository

### Reading Specs
Specs are **highly detailed** (25k+ tokens each). When reading:
1. Start with the overview and table of contents
2. Reference specific sections as needed
3. Use the implementation plan for cross-spec context

### Implementing from Specs
1. Follow the phase order in `implementation-plan.md`
2. Each spec has "Implementation" sections with TypeScript code
3. Test examples provided in each spec
4. Cross-reference related specs (noted in "Relationship to Other Specs" sections)

### Spec Cross-References
- `navigation-spec.md` section 7.2 provides `matchPresentationAction()` helpers
- `navigation-matcher-spec.md` provides generated matchers via `createDestination()`
- `navigation-dsl-spec.md` section "Function Disambiguation" clarifies `scope()` vs `scopeTo()` vs `ifLet()`
- `animation-integration-spec.md` section "Relationship to Other Specs" explains dual field pattern

## Project Requirements & Decisions

### Confirmed Requirements
1. **Svelte Version**: Svelte 5 (latest, with runes) - REQUIRED
2. **Browser Support**: Modern browsers only (ES2020+, no legacy transpilation)
3. **Animation System**: REQUIRED - Core feature, must be included
4. **SvelteKit Integration**: OPTIONAL - Defer to future phase or separate package

### Recommended Build Setup

**Package Structure**:
```
composable-svelte/
├── packages/
│   └── core/                    # Single package approach
│       ├── src/
│       ├── tests/
│       └── package.json
```
- Start with **single package** (`@composable-svelte/core`)
- Can split into monorepo later if needed (e.g., `@composable-svelte/sveltekit`)
- Simpler for initial development, easier to publish

**Build Tool**: **Vite (library mode)** + **tsup** for types
- Vite for fast development and examples
- tsup for optimized `.d.ts` generation
- Tree-shaking friendly ESM output
- Example: `vite.config.ts` with `build.lib` mode

**Testing Framework**: **Vitest** + **@testing-library/svelte**
- Vitest: Fast, Vite-native, excellent TypeScript support
- @testing-library/svelte: Component testing when needed
- Type tests: `vitest-type` or `tsd` for type-level assertions

**Build Configuration**:
```typescript
// vite.config.ts
export default {
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],  // ESM only for modern browsers
      fileName: 'index'
    },
    target: 'es2020',   // Modern browsers
    minify: 'esbuild',
    sourcemap: true
  }
};
```

**Package Exports**:
```json
{
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "svelte": "./dist/index.js",
      "default": "./dist/index.js"
    },
    "./navigation": {
      "types": "./dist/navigation/index.d.ts",
      "svelte": "./dist/navigation/index.js"
    }
  },
  "svelte": "./dist/index.js"
}
```

**Key Dependencies**:
- `svelte: ^5.0.0` (peer dependency, required)
- `motion: ^11.0.0` (peer dependency, optional - for advanced animations)
- Dev: `vite`, `vitest`, `@testing-library/svelte`, `tsup`, `typescript`

### Animation System Implementation

**CONFIRMED DECISION**: **Hybrid Approach** (Svelte transitions + optional Motion One)

**Default**: Use **Svelte's built-in transitions**
- Zero dependencies beyond Svelte
- Covers 90% of use cases (modals, sheets, drawers)
- Built-in easing functions and lifecycle events
- Small bundle size

```svelte
import { scale, fade, slide } from 'svelte/transition';

<div
  in:scale={{ duration: 300, start: 0.95 }}
  out:scale={{ duration: 200, start: 0.95 }}
  onintroend={() => dispatch('presentationCompleted')}
  onoutroend={() => dispatch('dismissalCompleted')}
/>
```

**Advanced (Optional)**: **Motion One** for spring physics and gestures
- Optional peer dependency (tree-shakeable)
- Only imported when user opts in via `animationDriver="motion"`
- Provides spring physics, gesture-driven animations
- Uses Web Animations API (GPU-accelerated)

```typescript
import { animate, spring } from 'motion';

animate(node,
  { opacity: [0, 1], scale: [0.95, 1] },
  { easing: spring({ stiffness: 300, damping: 30 }) }
);
```

**Component API Design**:
```svelte
<!-- Default: Svelte transitions -->
<Modal presentation={state.presentation}>
  <Content />
</Modal>

<!-- Advanced: Motion One -->
<Modal
  presentation={state.presentation}
  animationDriver="motion"
  spring={{ stiffness: 300, damping: 30 }}
>
  <Content />
</Modal>
```

**Why This Approach**:
- ✅ Zero deps for most users (just Svelte)
- ✅ Opt-in complexity for advanced cases
- ✅ Small bundle size by default
- ✅ Upgrade path for gesture animations
- ✅ Framework-appropriate (leverages Svelte strengths)

**Implementation Priority**:
1. **Phase 4**: Implement Svelte transitions (required for v1.0.0)
2. **Phase 5 or post-1.0**: Add Motion One integration (optional enhancement)

## Resources

- **Specs Location**: All specs in `specs/frontend/`
- **Implementation Plan**: `plans/implementation-plan.md`
- **TCA Documentation**: https://github.com/pointfreeco/swift-composable-architecture
- **Svelte 5 Runes**: https://svelte.dev/docs/svelte/what-are-runes

## Development Philosophy

- **Specification-First**: Complete specs before implementation
- **Type Safety**: Leverage TypeScript's type system for compile-time guarantees
- **Testability**: Every feature must be testable in isolation
- **Composability**: Reducers compose like Lego blocks
- **Declarative**: State and effects are data, not imperative code
- **Predictable**: Same inputs always produce same outputs (pure functions)

---

## Coding Style & Implementation Guidelines

**Target Audience**: Library implementers (not library users)

### Core Principles

1. **Functional Programming**: Pure functions, immutability, composition over classes
2. **Type-Driven Development**: Types first, explicit signatures, leverage discriminated unions
3. **Small Functions**: 5-15 lines target, single responsibility, extract complex logic
4. **Strict TypeScript**: No `any` types, full inference, exhaustive pattern matching

### Function Guidelines

```typescript
// ✅ GOOD: Small, focused, well-typed
const mapEffect = <A, B>(
  effect: Effect<A>,
  transform: (action: A) => B
): Effect<B> => {
  switch (effect._tag) {
    case 'None':
      return Effect.none();
    case 'Run':
      return Effect.run(async (dispatch) => {
        await effect.execute((a) => dispatch(transform(a)));
      });
    case 'Batch':
      return Effect.batch(...effect.effects.map(e => mapEffect(e, transform)));
    // ... other cases
  }
};

// ❌ BAD: Too long, unclear, uses 'any'
function mapEffect(effect: any, fn: any): any {
  if (effect.type === 'none') return effect;
  // ... 50 lines of complex logic
}
```

### Naming Conventions

- **Predicates**: `isNone`, `hasEffect`, `canExecute`
- **Transformations**: `mapEffect`, `liftAction`, `toParentAction`
- **Constructors**: `createStore`, `makeEffect`, `buildReducer`
- **Internal helpers**: Prefix with `_` (e.g., `_executeEffect`, `_notifySubscribers`)

### Type Safety Patterns

```typescript
// Discriminated unions with exhaustive checking
type Effect<A> =
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Run'; readonly execute: EffectExecutor<A> }
  | { readonly _tag: 'Batch'; readonly effects: readonly Effect<A>[] };

function executeEffect<A>(effect: Effect<A>): void {
  switch (effect._tag) {
    case 'None':
      return;
    case 'Run':
      effect.execute(dispatch);
      return;
    case 'Batch':
      effect.effects.forEach(executeEffect);
      return;
    default:
      // Exhaustiveness check
      const _never: never = effect;
      throw new Error(`Unhandled effect: ${_never}`);
  }
}

// Helper types for reusability
type Nullable<T> = T | null;
type ReadonlyRecord<K extends string, V> = Readonly<Record<K, V>>;
```

### File Organization

```typescript
// 1. Imports (external, then internal)
import type { Dispatch } from './types';

// 2. Type definitions (public exports first)
export type Effect<A> = /* ... */;
type EffectExecutor<A> = /* ... */; // Internal

// 3. Public API
export const Effect = {
  none: <A>(): Effect<A> => ({ _tag: 'None' }),
  run: <A>(execute: EffectExecutor<A>): Effect<A> => ({ _tag: 'Run', execute }),
  // ...
};

// 4. Internal implementation helpers (non-exported)
function _validateEffect<A>(effect: Effect<A>): boolean {
  // ...
}
```

### Error Handling in Library Code

```typescript
// ✅ GOOD: Validate inputs, provide helpful errors
export function createStore<S, A>(config: StoreConfig<S, A>): Store<S, A> {
  if (!config.initialState) {
    throw new TypeError('createStore: initialState is required');
  }
  if (typeof config.reducer !== 'function') {
    throw new TypeError('createStore: reducer must be a function');
  }
  // ... proceed with validated inputs
}

// ✅ GOOD: Catch and log effect errors without crashing
function executeEffect<A>(effect: Effect<A>): void {
  try {
    // ... execution logic
  } catch (error) {
    console.error('[Composable Svelte] Effect execution error:', error);
    // Don't throw - effects are fire-and-forget
  }
}
```

### Testing Library Code

```typescript
// Test type constraints with expect-type or similar
import { expectType } from 'tsd';

expectType<Effect<string>>(Effect.map(Effect.none<number>(), (n) => String(n)));

// Test edge cases and error conditions
describe('Effect.map', () => {
  it('preserves None effect', () => {
    const effect = Effect.none<number>();
    const mapped = Effect.map(effect, (n) => String(n));
    expect(mapped._tag).toBe('None');
  });

  it('transforms actions in Run effect', async () => {
    const actions: string[] = [];
    const effect = Effect.run<number>((d) => d(42));
    const mapped = Effect.map(effect, (n) => `num:${n}`);

    // Execute and verify transformation
    await mapped.execute((s) => actions.push(s));
    expect(actions).toEqual(['num:42']);
  });
});
```

### Key Implementation Rules

- **No mutations**: All library state immutable (use `$state` only in store.svelte.ts)
- **No `any` types**: Use generics or `unknown` with type guards
- **Validate public APIs**: Check inputs, throw helpful errors
- **Don't throw in effects**: Catch and log instead
- **Export minimal surface**: Only export what users need
- **JSDoc everything**: Public APIs must have examples
