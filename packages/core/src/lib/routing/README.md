# URL Routing - Design Documentation

**Phase 7: URL Synchronization (Browser History Integration)**

This document explains the design decisions, architecture, and usage patterns for the routing module.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Design Decisions](#design-decisions)
3. [Module Structure](#module-structure)
4. [Usage Patterns](#usage-patterns)
5. [Type Safety](#type-safety)
6. [Cross-References](#cross-references)
7. [Future Enhancements (v1.1)](#future-enhancements-v11)

---

## Architecture Overview

### Core Principles

1. **Framework-Agnostic** - Uses browser History API only, no SvelteKit dependencies
2. **State-First** - URL is a serialization of state, not a replacement
3. **Pure Functions** - Serialization and parsing are side-effect free
4. **Type-Safe** - Full TypeScript support with discriminated unions
5. **Composable** - Integrates via effects, doesn't require reducer changes

### Data Flow

**State → URL (Programmatic Navigation)**
```
User Action
  ↓
Dispatch to Store
  ↓
Reducer Updates State
  ↓
Effect: serializeDestination(state.destination)
  ↓
history.pushState(url)
  ↓
Browser URL Updates
```

**URL → State (Browser Navigation)**
```
User Clicks Back/Forward
  ↓
'popstate' Event Fires
  ↓
parseDestination(window.location.pathname)
  ↓
destinationToAction(parsedDestination)
  ↓
Dispatch Action to Store
  ↓
Reducer Updates State
  ↓
View Re-renders
```

---

## Design Decisions

### 1. Why Config-Based API?

**Decision**: Use configuration objects instead of decorators or automatic routing.

**Rationale**:
- **Flexibility** - Each destination can have custom serialization logic
- **Explicit** - Clear mapping between state and URLs
- **Testable** - Pure functions are easy to unit test
- **No Magic** - No hidden behavior, everything is visible in config

**Example**:
```typescript
const config: SerializerConfig<Dest> = {
  basePath: '/inventory',
  serializers: {
    detailItem: (state) => `/inventory/item-${state.itemId}`,
    editItem: (state) => `/inventory/item-${state.itemId}/edit`
  }
};
```

### 2. Why Parser Order Matters?

**Decision**: Parsers are tried in array order, first match wins.

**Rationale**:
- **Specificity Control** - More specific patterns should be checked first
- **Predictable** - Always know which parser will match
- **Performance** - Can short-circuit on first match

**Example**:
```typescript
parsers: [
  // ✅ Most specific first
  (path) => matchPath('/item-:id/edit/:field', path),
  (path) => matchPath('/item-:id/edit', path),
  (path) => matchPath('/item-:id', path),
  // ✅ Literal paths last
  (path) => path === '/add' ? {...} : null
]
```

### 3. Why path-to-regexp?

**Decision**: Use `path-to-regexp` library for pattern matching.

**Rationale**:
- **Battle-Tested** - Used by Express, React Router, etc.
- **Feature-Rich** - Named params, wildcards, optional segments
- **Future-Proof** - Can enable advanced features in v1.1 without library change
- **Small Cost** - ~3KB minified, worth it for reliability

**Version**: 8.x (latest)
- Returns `{ regexp, keys }` object
- Wildcard syntax: `{*name}`
- Optional segments: `{name}` (requires options - v1.1)

### 4. Why Pure Functions?

**Decision**: Serialization and parsing are pure functions with no side effects.

**Rationale**:
- **Testable** - Easy to write unit tests
- **Predictable** - Same input always produces same output
- **Composable** - Can be combined in effects
- **Debuggable** - No hidden state changes

### 5. Why v1 Scope Limitations?

**Decision**: Single-level destinations only in v1, defer nested to v1.1.

**Rationale**:
- **Focus** - Core functionality first (90% use case)
- **Complexity** - Nested destinations add significant type system complexity
- **Ship Fast** - Get v1 out quickly, iterate based on feedback
- **Workaround Exists** - Can model nested UI as separate destination types

**v1 Supported**:
```typescript
destination: { type: 'itemDetail', state: { id: '123' } }
→ /inventory/item-123
```

**v1.1 Future**:
```typescript
destination: {
  type: 'itemDetail',
  state: {
    id: '123',
    destination: { type: 'editForm', state: {} } // Nested
  }
}
→ /inventory/item-123/edit
```

---

## Module Structure

```
packages/core/src/routing/
├── types.ts              # TypeScript type definitions
├── serializer.ts         # State → URL serialization
├── parser.ts             # URL → State parsing
├── browser-history.ts    # History API integration (Day 5)
├── sync-effect.ts        # URL sync effect (Day 4)
├── deep-link.ts          # Initialize from URL (Day 6)
├── index.ts              # Public API exports (Day 7)
└── README.md             # This file
```

### Module Dependencies

```
types.ts (no dependencies)
  ↓
serializer.ts → types.ts
  ↓
parser.ts → types.ts, path-to-regexp
  ↓
sync-effect.ts → serializer.ts, ../effect.ts
  ↓
browser-history.ts → parser.ts, serializer.ts, ../types.ts
  ↓
deep-link.ts → parser.ts
  ↓
index.ts → all modules
```

---

## Usage Patterns

### Basic Setup

```typescript
import {
  serializeDestination,
  parseDestination,
  matchPath,
  type RouteConfig
} from '@composable-svelte/core/routing';

// 1. Define types
type Destination =
  | { type: 'detail'; state: { id: string } }
  | { type: 'edit'; state: { id: string } }
  | { type: 'add'; state: {} };

type Action =
  | { type: 'itemSelected'; id: string }
  | { type: 'editTapped'; id: string }
  | { type: 'addTapped' }
  | { type: 'closeDestination' };

// 2. Create route config
const routeConfig: RouteConfig<Destination, Action> = {
  basePath: '/inventory',

  serializers: {
    detail: (state) => `/inventory/item-${state.id}`,
    edit: (state) => `/inventory/item-${state.id}/edit`,
    add: () => '/inventory/add'
  },

  parsers: [
    (path) => {
      const params = matchPath('/item-:id/edit', path);
      return params ? { type: 'edit', state: { id: params.id } } : null;
    },
    (path) => {
      const params = matchPath('/item-:id', path);
      return params ? { type: 'detail', state: { id: params.id } } : null;
    },
    (path) => path === '/add' ? { type: 'add', state: {} } : null
  ],

  destinationToAction: (dest) => {
    if (!dest) return { type: 'closeDestination' };
    switch (dest.type) {
      case 'detail': return { type: 'itemSelected', id: dest.state.id };
      case 'edit': return { type: 'editTapped', id: dest.state.id };
      case 'add': return { type: 'addTapped' };
    }
  }
};
```

### Integration with Reducers

```typescript
import { createURLSyncEffect } from '@composable-svelte/core/routing';

const appReducer = (state, action, deps) => {
  // 1. Core business logic
  const [newState, coreEffect] = coreReducer(state, action, deps);

  // 2. URL sync effect
  const urlEffect = createURLSyncEffect(
    (s) => serializeDestination(s.destination, routeConfig)
  )(newState);

  // 3. Batch effects
  return [newState, Effect.batch(coreEffect, urlEffect)];
};
```

---

## Type Safety

### Discriminated Unions

All destination types use discriminated unions for exhaustive checking:

```typescript
type Destination =
  | { type: 'typeA'; state: StateA }
  | { type: 'typeB'; state: StateB }
  | { type: 'typeC'; state: StateC };

// TypeScript ensures exhaustiveness
const serializers = {
  typeA: (state: StateA) => string,
  typeB: (state: StateB) => string,
  typeC: (state: StateC) => string,
  // Missing a type? TypeScript error!
};
```

### Helper Types

Extract state for specific destination types:

```typescript
import type { DestinationState, DestinationType } from './types';

type AllTypes = DestinationType<Destination>;
// 'typeA' | 'typeB' | 'typeC'

type StateA = DestinationState<Destination, 'typeA'>;
// { ... }
```

---

## Cross-References

### Related Modules

1. **Core Architecture** (`../types.ts`, `../store.svelte.ts`)
   - Routing integrates via `Effect` system
   - No changes to reducer signature required

2. **Navigation System** (`../navigation/`)
   - Destinations defined in navigation spec
   - Routing serializes/parses these destinations

3. **Effect System** (`../effect.ts`)
   - `createURLSyncEffect` returns `Effect<Action>`
   - Batched with other effects in reducers

### Related Specs

- **Phase 7 Plan** (`/plans/phase-7/PHASE-7-PLAN.md`)
  - Full specification with examples
  - Implementation roadmap
  - Testing strategy

- **Navigation Spec** (`/specs/frontend/navigation-spec.md`)
  - Defines destination state pattern
  - `PresentationAction` wrapping
  - `ifLet` operator for optional destinations

---

## Future Enhancements (v1.1)

### Planned Features

1. **Nested Destinations**
   - Support for modal-within-modal patterns
   - Recursive serialization/parsing
   - Type system updates for nested state

2. **Query Parameters**
   - Serialize filters, search, pagination
   - Merge query params with path
   - Parse query string to state

3. **Hash Fragments**
   - Support for `#section` anchors
   - Client-side routing in static hosts

4. **Optional Parameters** (path-to-regexp v8.x)
   - Enable `{name}` syntax for optional segments
   - Requires options configuration

5. **Custom Regex Validation**
   - Enable `:id(\\d+)` style patterns
   - Type-safe param validation

### Breaking Changes from v1.0

None planned - v1.1 will be fully backward compatible. New features are opt-in.

---

## Testing Philosophy

### Unit Tests

- **Serialization**: Pure function tests (37 tests)
- **Parsing**: Pure function tests (41 tests)
- **Integration**: Browser History API tests (Day 5)
- **Deep Linking**: Page load tests (Day 6)

### Test Coverage Goals

- **v1.0**: 95%+ coverage of v1 scope features
- **v1.1**: Additional tests for nested/advanced features

---

## Performance Considerations

### Serialization

- **Target**: <5ms for 1000 serializations
- **Optimization**: Serializers are called once per state change
- **Caching**: Not needed - functions are fast enough

### Parsing

- **Target**: <5ms for 1000 parses
- **Optimization**: Regex compilation cached by path-to-regexp
- **Early Exit**: First matching parser short-circuits

### Bundle Size

- **Target**: <3KB gzipped (routing module only)
- **path-to-regexp**: ~3KB minified (worth the reliability)
- **Tree-shaking**: Full ES module support

---

## Common Pitfalls

### 1. Parser Order

❌ **Wrong** - General patterns before specific:
```typescript
parsers: [
  (path) => matchPath('/item-:id', path),      // Matches first!
  (path) => matchPath('/item-:id/edit', path)  // Never reached
]
```

✅ **Correct** - Specific patterns first:
```typescript
parsers: [
  (path) => matchPath('/item-:id/edit', path), // Checked first
  (path) => matchPath('/item-:id', path)       // Fallback
]
```

### 2. Infinite Loops

❌ **Wrong** - URL updates trigger more updates:
```typescript
// Don't parse own URL updates!
window.addEventListener('popstate', () => {
  // This creates infinite loop
});
```

✅ **Correct** - Use metadata flag:
```typescript
history.pushState({ composableSvelteSync: true }, '', url);
// Check flag in popstate handler
```

### 3. Missing Base Path

❌ **Wrong** - Absolute paths in serializers:
```typescript
serializers: {
  detail: (s) => `/app/inventory/item-${s.id}` // Hardcoded base
}
```

✅ **Correct** - Use basePath config:
```typescript
{
  basePath: '/app/inventory',
  serializers: {
    detail: (s) => pathSegment('/app/inventory', `item-${s.id}`)
  }
}
```

---

## Questions?

For more details, see:
- [Phase 7 Plan](/plans/phase-7/PHASE-7-PLAN.md)
- [API Documentation](./index.ts) (JSDoc comments)
- [Test Examples](/packages/core/tests/routing/)

For issues or feature requests, check the project README.
