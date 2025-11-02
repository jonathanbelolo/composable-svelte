# Phase 7: URL Synchronization (Browser History Integration)

**Status**: Planning
**Execute**: AFTER Phase 6 (Component Library)
**Timeline**: 1-2 weeks
**Goal**: Bidirectional URL ↔ State synchronization using browser History API

**Philosophy**: Framework-agnostic - NO SvelteKit dependencies. Pure browser History API integration.

---

## Table of Contents

1. [Overview](#overview)
2. [Core Principles](#core-principles)
3. [Architecture](#architecture)
4. [URL Serialization Strategy](#url-serialization-strategy)
5. [Browser History Integration](#browser-history-integration)
6. [Deep Linking](#deep-linking)
7. [API Design](#api-design)
8. [Implementation Roadmap](#implementation-roadmap)
9. [Testing Strategy](#testing-strategy)
10. [Examples](#examples)
11. [Edge Cases](#edge-cases)
12. [Success Criteria](#success-criteria)

---

## 1. Overview

### The Problem

Currently, Composable Svelte navigation is **state-driven** but **URL-blind**:

```typescript
// ✅ This works - state-driven navigation
dispatch({ type: 'itemSelected', itemId: '123' });
// State updates: destination: { type: 'detailItem', state: { itemId: '123' } }
// Modal/Sheet renders correctly

// ❌ But URL stays at "/"
// ❌ Back button doesn't work
// ❌ Can't bookmark or share the modal state
// ❌ Page refresh loses navigation state
```

### The Solution

**Bidirectional synchronization** between browser URL and navigation state:

```typescript
// URL → State (Browser navigation)
User clicks back button
"/inventory/item-123" → parse → dispatch({ type: 'itemSelected', itemId: '123' })
→ State updates → Modal renders

// State → URL (Programmatic navigation)
dispatch({ type: 'itemSelected', itemId: '123' })
→ Reducer updates state → destination: { type: 'detailItem', ... }
→ Effect serializes state → history.pushState(..., "/inventory/item-123")
```

### Key Benefits

- ✅ **Back/forward buttons work** - browser history integration
- ✅ **Deep linking** - share URLs that restore full navigation state
- ✅ **Bookmarkable** - save navigation state in URL
- ✅ **Refresh-safe** - page reload restores navigation state
- ✅ **Framework-agnostic** - works everywhere Svelte runs
- ✅ **Testable** - serialization/parsing are pure functions

---

## 2. Core Principles

### 2.1 Browser History API Only

**NO framework dependencies:**
- ❌ No SvelteKit (`goto`, `beforeNavigate`, `$page`)
- ❌ No page routers (no file-based routing)
- ✅ Pure browser APIs (`history.pushState`, `popstate` events)
- ✅ Works in vanilla Svelte, Vite, or any environment

### 2.2 State is Still Source of Truth

**URL is a serialization of state, not a replacement:**
- State drives navigation (reducers own logic)
- URL is a **side effect** of state changes
- URL parsing triggers **actions**, not direct state mutations
- Reducers remain pure functions

### 2.3 Composable Architecture Preserved

**Navigation still follows reducer pattern:**
```typescript
// User action (from URL or UI)
dispatch({ type: 'itemSelected', itemId: '123' });

// Reducer updates state
const [newState, effect] = reducer(state, action, deps);
// newState.destination = { type: 'detailItem', state: { itemId: '123' } }

// Effect serializes state → updates URL
Effect.batch(
  effect,
  Effect.syncURL(newState) // Serializes destination → URL
);
```

### 2.4 Opt-In, Not Required

**URL sync is optional:**
- Core navigation works without URL sync
- Add URL sync via effects (non-invasive)
- Useful for top-level routes, not every modal
- Developer chooses what to sync

---

## 3. Architecture

### 3.1 Component Overview

```
packages/core/src/routing/
├── types.ts                 # URL routing types
├── serializer.ts            # Destination state → URL path
├── parser.ts                # URL path → Destination state
├── browser-history.ts       # History API integration
├── sync-effect.ts           # Effect for URL updates
├── deep-link.ts             # Initialize state from URL
└── index.ts                 # Public API
```

### 3.2 Data Flow

**State → URL (Programmatic Navigation):**
```
User Action
  ↓
Dispatch to Store
  ↓
Reducer updates State
  ↓
Effect: Serialize State → URL Path
  ↓
history.pushState(path)
  ↓
Browser URL updates
```

**URL → State (Browser Navigation):**
```
User clicks Back/Forward
  ↓
'popstate' event fires
  ↓
Parse URL → Destination State
  ↓
Create Action from parsed state
  ↓
Dispatch to Store
  ↓
Reducer updates State
  ↓
View re-renders
```

### 3.3 Integration Points

**Single integration point:** Effects in reducer

```typescript
const appReducer: Reducer<AppState, AppAction, AppDeps> = (state, action, deps) => {
  // 1. Core reducer logic (pure)
  const [newState, coreEffect] = coreReducer(state, action, deps);

  // 2. URL sync effect (side effect)
  const urlEffect = createURLSyncEffect({
    serialize: (s) => serializeDestination(s.destination),
    parse: (path) => parseDestination(path)
  })(newState);

  // 3. Batch effects
  return [newState, Effect.batch(coreEffect, urlEffect)];
};
```

---

## 4. URL Serialization Strategy

### 4.1 URL Structure

**Path-based routing for destinations:**
```
/                          → Root (no destination)
/inventory                 → Inventory list
/inventory/item-123        → Detail modal for item 123
/inventory/item-123/edit   → Edit modal for item 123
```

**Note on Nested Destinations:**
Nested destinations (modals within modals) are **deferred to v1.1**. Phase 7 v1 focuses on **single-level destinations only**:
```typescript
// ✅ v1 Supported
destination: { type: 'detailItem', state: { itemId: '123' } }
→ /inventory/item-123

// ❌ v1.1 (Future)
destination: {
  type: 'detailItem',
  state: {
    itemId: '123',
    destination: { type: 'editForm', state: {} }  // Nested
  }
}
→ /inventory/item-123/edit
```

**Rationale:** Keep v1 focused on core functionality. Nested destinations add significant complexity to type system and parsing logic.

### 4.2 Serialization API

**Core function: `serializeDestination`**

```typescript
// routing/serializer.ts

/**
 * Serialize destination state to URL path.
 *
 * Returns the URL path representing the destination state.
 * Returns '/' if no destination (root).
 *
 * @example
 * serializeDestination(null) → '/'
 * serializeDestination({ type: 'detailItem', state: { itemId: '123' } }) → '/inventory/item-123'
 */
export function serializeDestination<Dest extends { type: string; state: any }>(
  destination: Dest | null,
  config: SerializerConfig<Dest>
): string {
  if (!destination) {
    return config.basePath ?? '/';
  }

  // Find serializer for this destination type
  const serializer = config.serializers[destination.type];
  if (!serializer) {
    console.warn(`No serializer for destination type: ${destination.type}`);
    return config.basePath ?? '/';
  }

  // Serialize destination to path
  return serializer(destination.state);
}

/**
 * Configuration for URL serialization.
 */
export interface SerializerConfig<Dest extends { type: string; state: any }> {
  /**
   * Base path for all routes.
   * @default '/'
   */
  basePath?: string;

  /**
   * Serializers for each destination type.
   *
   * Maps destination.type → serializer function.
   */
  serializers: {
    [K in Dest['type']]?: (state: Extract<Dest, { type: K }>['state']) => string;
  };
}

/**
 * Helper to create path segments.
 */
export function pathSegment(base: string, segment: string): string {
  return `${base.replace(/\/$/, '')}/${segment}`;
}
```

**Usage Example:**

```typescript
// features/inventory/routing.ts

import { serializeDestination, pathSegment } from '@composable-svelte/core/routing';

type InventoryDestination =
  | { type: 'detailItem'; state: { itemId: string } }
  | { type: 'editItem'; state: { itemId: string } }
  | { type: 'addItem'; state: {} };

const serializerConfig: SerializerConfig<InventoryDestination> = {
  basePath: '/inventory',
  serializers: {
    detailItem: (state) => pathSegment('/inventory', `item-${state.itemId}`),
    editItem: (state) => pathSegment('/inventory', `item-${state.itemId}/edit`),
    addItem: () => '/inventory/add'
  }
};

// Usage
const url = serializeDestination(destination, serializerConfig);
// destination: { type: 'detailItem', state: { itemId: '123' } }
// → url: '/inventory/item-123'
```

### 4.3 Scope Limitations (v1)

**Phase 7 v1 supports single-level destinations only:**

```typescript
// ✅ Supported in v1
serializeDestination({ type: 'detail', state: { id: '123' } }, config)
→ '/inventory/item-123'

serializeDestination({ type: 'edit', state: { id: '123' } }, config)
→ '/inventory/item-123/edit'

// ❌ Not supported in v1 (deferred to v1.1)
// Nested destination with child destination field
destination: {
  type: 'detail',
  state: {
    id: '123',
    destination: { type: 'edit', state: {} }  // Nested - v1.1
  }
}
```

**Workaround for v1:** Model nested UI as separate top-level destination types:
```typescript
type AppDestination =
  | { type: 'itemDetail'; state: { id: string } }
  | { type: 'itemEdit'; state: { id: string } }  // Separate type, not nested
  | { type: 'itemAdd'; state: {} };

// Both have URLs
'/inventory/item-123'       → itemDetail
'/inventory/item-123/edit'  → itemEdit (not nested, just different type)
```

### 4.4 Pattern Matching Limitations (v1)

**matchPath() supports simple parameter patterns only in v1:**

```typescript
// ✅ Supported in v1
matchPath('/item-:id', '/item-123')
→ { id: '123' }

matchPath('/item-:id/edit/:field', '/item-123/edit/name')
→ { id: '123', field: 'name' }

// ❌ Not supported in v1 (deferred to v1.1+)
// Optional segments: '/item-:id?'
// Wildcard segments: '/files/*'
// Regex patterns: '/item-:id(\\d+)'
// Query params: '/items?filter=:status'
// Hash fragments: '/items#:section'
```

**Pattern Syntax (v1):**
- `:param` - Named parameter (matches any non-slash characters)
- `/` - Path separator (exact match)
- All other characters - Exact match

**Limitations:**
1. **No optional parameters** - All `:param` segments are required
2. **No wildcards** - Cannot match arbitrary path segments
3. **No regex constraints** - Cannot validate parameter format
4. **No query params** - Path only (query string ignored)
5. **No hash fragments** - Hash ignored in v1

**Workaround Patterns:**

For optional segments, use multiple parsers:
```typescript
const config: ParserConfig<Dest> = {
  basePath: '/inventory',
  parsers: [
    // Try more specific pattern first
    (path) => {
      const params = matchPath('/item-:id/edit', path);
      return params ? { type: 'editItem', state: { itemId: params.id } } : null;
    },
    // Then try less specific pattern
    (path) => {
      const params = matchPath('/item-:id', path);
      return params ? { type: 'detailItem', state: { itemId: params.id } } : null;
    }
  ]
};
```

For validation, use post-match checks:
```typescript
const parser = (path: string): Dest | null => {
  const params = matchPath('/item-:id', path);
  if (!params) return null;

  // Validate id is numeric
  if (!/^\d+$/.test(params.id)) {
    return null; // Invalid format, no match
  }

  return { type: 'detail', state: { itemId: params.id } };
};
```

**Future Enhancements (v1.1+):**
- Optional segments with `?` suffix
- Wildcard matching with `*`
- Regex constraints with `:param(regex)`
- Query parameter parsing
- Hash fragment handling

---

## 5. Browser History Integration

### 5.1 Parsing API

**Core function: `parseDestination`**

```typescript
// routing/parser.ts

/**
 * Parse URL path to destination state.
 *
 * Returns the destination state representing the URL path.
 * Returns null if path is root or doesn't match any route.
 *
 * @example
 * parseDestination('/') → null
 * parseDestination('/inventory/item-123') → { type: 'detailItem', state: { itemId: '123' } }
 */
export function parseDestination<Dest extends { type: string; state: any }>(
  path: string,
  config: ParserConfig<Dest>
): Dest | null {
  // Strip base path
  const basePath = config.basePath ?? '/';
  if (!path.startsWith(basePath)) {
    return null;
  }

  const relativePath = path.slice(basePath.length) || '/';

  // Try each parser until one matches
  for (const parser of config.parsers) {
    const result = parser(relativePath);
    if (result !== null) {
      return result;
    }
  }

  // No match
  return null;
}

/**
 * Configuration for URL parsing.
 */
export interface ParserConfig<Dest extends { type: string; state: any }> {
  /**
   * Base path for all routes.
   * @default '/'
   */
  basePath?: string;

  /**
   * List of parsers to try in order.
   *
   * Each parser returns destination state or null if no match.
   */
  parsers: Array<(path: string) => Dest | null>;
}

/**
 * Helper to match path patterns.
 */
export function matchPath(
  pattern: string,
  path: string
): Record<string, string> | null {
  // Convert pattern to regex
  // /item-:id → /item-([^/]+)
  const regexPattern = pattern.replace(/:(\w+)/g, '([^/]+)');
  const regex = new RegExp(`^${regexPattern}$`);

  const match = path.match(regex);
  if (!match) {
    return null;
  }

  // Extract params
  const paramNames = [...pattern.matchAll(/:(\w+)/g)].map(m => m[1]);
  const params: Record<string, string> = {};
  paramNames.forEach((name, i) => {
    params[name] = match[i + 1];
  });

  return params;
}
```

**Usage Example:**

```typescript
// features/inventory/routing.ts

import { parseDestination, matchPath } from '@composable-svelte/core/routing';

const parserConfig: ParserConfig<InventoryDestination> = {
  basePath: '/inventory',
  parsers: [
    // Parser for /item-:id/edit
    (path) => {
      const params = matchPath('/item-:id/edit', path);
      if (params) {
        return {
          type: 'editItem',
          state: { itemId: params.id }
        };
      }
      return null;
    },

    // Parser for /item-:id
    (path) => {
      const params = matchPath('/item-:id', path);
      if (params) {
        return {
          type: 'detailItem',
          state: { itemId: params.id }
        };
      }
      return null;
    },

    // Parser for /add
    (path) => {
      if (path === '/add') {
        return { type: 'addItem', state: {} };
      }
      return null;
    }
  ]
};

// Usage
const destination = parseDestination(window.location.pathname, parserConfig);
// pathname: '/inventory/item-123'
// → destination: { type: 'detailItem', state: { itemId: '123' } }
```

### 5.2 History Event Listener

**Listen to browser back/forward:**

```typescript
// routing/browser-history.ts

import type { Store } from '../types';

/**
 * Sync browser history with store state.
 *
 * Sets up bidirectional sync:
 * 1. Browser back/forward → parse URL → dispatch action
 * 2. State changes → serialize → update URL (via effects)
 *
 * @returns Cleanup function to remove listeners
 */
export function syncBrowserHistory<State, Action, Dest>(
  store: Store<State, Action>,
  config: BrowserHistoryConfig<State, Action, Dest>
): () => void {
  // Listen to browser back/forward
  const handlePopState = (event: PopStateEvent) => {
    // Check if this navigation was triggered by our code
    // We mark our own pushState calls with metadata
    if (event.state?.composableSvelteSync) {
      return; // Ignore our own updates - prevents infinite loops
    }

    // Navigation triggered by browser (back/forward button)
    const path = window.location.pathname;
    const destination = config.parse(path);

    // Convert destination to action
    const action = config.destinationToAction(destination);
    if (action) {
      store.dispatch(action);
    }
  };

  window.addEventListener('popstate', handlePopState);

  return () => {
    window.removeEventListener('popstate', handlePopState);
  };
}

export interface BrowserHistoryConfig<State, Action, Dest> {
  /**
   * Parse URL path to destination state.
   */
  parse: (path: string) => Dest | null;

  /**
   * Serialize state to URL path.
   */
  serialize: (state: State) => string;

  /**
   * Convert destination state to action.
   *
   * This action will be dispatched when browser navigates.
   */
  destinationToAction: (destination: Dest | null) => Action | null;
}
```

### 5.3 URL Update Effect

**Effect to update URL when state changes:**

```typescript
// routing/sync-effect.ts

import { Effect } from '../effect';

/**
 * Create an effect that syncs state to URL.
 *
 * Compares current URL with expected URL (from state).
 * If different, updates URL using history.pushState.
 *
 * @param serialize - Function to serialize state to URL path
 * @param replace - Use replaceState instead of pushState (no history entry)
 */
export function createURLSyncEffect<State, Action>(
  serialize: (state: State) => string,
  options: { replace?: boolean } = {}
): (state: State) => Effect<Action> {
  return (state: State): Effect<Action> => {
    const expectedPath = serialize(state);
    const currentPath = window.location.pathname;

    if (expectedPath !== currentPath) {
      return Effect.fireAndForget(() => {
        // Mark this navigation as coming from our sync
        // This prevents popstate handler from dispatching redundant actions
        const stateMetadata = { composableSvelteSync: true };

        if (options.replace) {
          history.replaceState(stateMetadata, '', expectedPath);
        } else {
          history.pushState(stateMetadata, '', expectedPath);
        }
      });
    }

    return Effect.none();
  };
}
```

---

## 6. Deep Linking

### 6.1 Initialize State from URL

**On app load, parse URL to set initial state:**

```typescript
// routing/deep-link.ts

/**
 * Create initial state from URL.
 *
 * Parses the current URL and constructs initial state with destination set.
 * Falls back to default initial state if URL doesn't match any route.
 *
 * @param defaultState - Default initial state (when URL is root)
 * @param parse - Function to parse URL to destination
 * @param setDestination - Function to set destination in state
 */
export function createInitialStateFromURL<State, Dest>(
  defaultState: State,
  parse: (path: string) => Dest | null,
  setDestination: (state: State, destination: Dest | null) => State
): State {
  const path = window.location.pathname;
  const destination = parse(path);

  if (destination === null) {
    return defaultState;
  }

  return setDestination(defaultState, destination);
}
```

**Usage:**

```svelte
<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import { createInitialStateFromURL } from '@composable-svelte/core/routing';
  import { inventoryReducer } from './features/inventory/reducer';
  import { defaultInitialState } from './features/inventory/state';
  import { parseDestination } from './features/inventory/routing';

  // Parse URL to create initial state
  const initialState = createInitialStateFromURL(
    defaultInitialState,
    (path) => parseDestination(path, parserConfig),
    (state, destination) => ({ ...state, destination })
  );

  const store = createStore({
    initialState,
    reducer: inventoryReducer,
    dependencies: {}
  });
</script>
```

### 6.2 Handling Invalid URLs

**Graceful fallback for unrecognized URLs:**

```typescript
// If parse returns null, treat as root
const destination = parseDestination(path, config);
if (destination === null) {
  // URL doesn't match any route → show root view
  return defaultInitialState;
}
```

---

## 7. API Design

### 7.1 Public API Surface

```typescript
// packages/core/src/routing/index.ts

// Serialization
export { serializeDestination, pathSegment } from './serializer';
export type { SerializerConfig } from './serializer';

// Parsing
export { parseDestination, matchPath } from './parser';
export type { ParserConfig } from './parser';

// Browser History Integration
export { syncBrowserHistory } from './browser-history';
export type { BrowserHistoryConfig } from './browser-history';

// Effects
export { createURLSyncEffect } from './sync-effect';

// Deep Linking
export { createInitialStateFromURL } from './deep-link';

// Types
export type { RouteConfig, RouteMatcher } from './types';
```

### 7.2 Complete Usage Example

```typescript
// app.ts - Complete integration

import { createStore } from '@composable-svelte/core';
import {
  serializeDestination,
  parseDestination,
  syncBrowserHistory,
  createURLSyncEffect,
  createInitialStateFromURL,
  pathSegment,
  matchPath
} from '@composable-svelte/core/routing';

// 1. Define routing config
const serializerConfig = {
  basePath: '/inventory',
  serializers: {
    detailItem: (state) => pathSegment('/inventory', `item-${state.itemId}`),
    editItem: (state) => pathSegment('/inventory', `item-${state.itemId}/edit`),
    addItem: () => '/inventory/add'
  }
};

const parserConfig = {
  basePath: '/inventory',
  parsers: [
    (path) => {
      const params = matchPath('/item-:id/edit', path);
      return params ? { type: 'editItem', state: { itemId: params.id } } : null;
    },
    (path) => {
      const params = matchPath('/item-:id', path);
      return params ? { type: 'detailItem', state: { itemId: params.id } } : null;
    },
    (path) => path === '/add' ? { type: 'addItem', state: {} } : null
  ]
};

// 2. Create initial state from URL (deep linking)
const initialState = createInitialStateFromURL(
  defaultInitialState,
  (path) => parseDestination(path, parserConfig),
  (state, destination) => ({ ...state, destination })
);

// 3. Create reducer with URL sync effect
const appReducer: Reducer<AppState, AppAction, AppDeps> = (state, action, deps) => {
  const [newState, coreEffect] = coreReducer(state, action, deps);

  // Add URL sync effect
  const urlEffect = createURLSyncEffect<AppState, AppAction>(
    (s) => serializeDestination(s.destination, serializerConfig)
  )(newState);

  return [newState, Effect.batch(coreEffect, urlEffect)];
};

// 4. Create store
const store = createStore({
  initialState,
  reducer: appReducer,
  dependencies: {}
});

// 5. Setup browser history sync
const cleanup = syncBrowserHistory(store, {
  parse: (path) => parseDestination(path, parserConfig),
  serialize: (state) => serializeDestination(state.destination, serializerConfig),
  destinationToAction: (destination) => {
    if (destination === null) {
      return { type: 'closeDestination' };
    }
    if (destination.type === 'detailItem') {
      return { type: 'itemSelected', itemId: destination.state.itemId };
    }
    if (destination.type === 'editItem') {
      return { type: 'editItemTapped', itemId: destination.state.itemId };
    }
    if (destination.type === 'addItem') {
      return { type: 'addItemTapped' };
    }
    return null;
  }
});

// Cleanup on unmount
onDestroy(() => {
  cleanup();
});
```

---

## 8. Implementation Roadmap

### Week 1: Core Serialization & Parsing (Days 1-3)

#### Day 1: Serialization API
- [ ] Create `packages/core/src/routing/` directory
- [ ] Implement `serializer.ts`
  - [ ] `serializeDestination()` function
  - [ ] `SerializerConfig` type
  - [ ] `pathSegment()` helper
  - [ ] Support for nested destinations
- [ ] Unit tests (20+ tests)
  - [ ] Null destination → root path
  - [ ] Simple destination → path
  - [ ] Nested destination → nested path
  - [ ] Unknown destination type handling
  - [ ] Base path handling

#### Day 2: Parsing API
- [ ] Implement `parser.ts`
  - [ ] `parseDestination()` function
  - [ ] `ParserConfig` type
  - [ ] `matchPath()` helper (pattern matching)
  - [ ] Support for nested paths
- [ ] Unit tests (20+ tests)
  - [ ] Root path → null destination
  - [ ] Path → destination state
  - [ ] Nested path → nested destination
  - [ ] Invalid path handling
  - [ ] Pattern matching with params

#### Day 3: Types & Documentation
- [ ] Create `types.ts`
  - [ ] `RouteConfig` interface
  - [ ] `RouteMatcher` type
  - [ ] Helper types
- [ ] Create comprehensive JSDoc
- [ ] Create API documentation
- [ ] Create usage examples

**Checkpoint**: ✅ Serialization/parsing complete with 40+ tests

---

### Week 1-2: Browser Integration (Days 4-7)

#### Day 4: URL Sync Effect
- [ ] Implement `sync-effect.ts`
  - [ ] `createURLSyncEffect()` function
  - [ ] Support for `pushState` and `replaceState`
  - [ ] Cycle detection (prevent infinite loops)
- [ ] Unit tests with TestStore (15+ tests)
  - [ ] URL updates when state changes
  - [ ] No update when URL already correct
  - [ ] Push vs replace behavior
  - [ ] Cycle prevention

#### Day 5: Browser History Integration
- [ ] Implement `browser-history.ts`
  - [ ] `syncBrowserHistory()` function
  - [ ] `popstate` event listener
  - [ ] Cleanup function
  - [ ] Cycle detection flag
- [ ] Browser tests (10+ tests)
  - [ ] Back button dispatches correct action
  - [ ] Forward button works
  - [ ] Manual URL change triggers action
  - [ ] State change updates URL
  - [ ] No infinite loops

#### Day 6: Deep Linking
- [ ] Implement `deep-link.ts`
  - [ ] `createInitialStateFromURL()` function
  - [ ] Invalid URL handling
  - [ ] Nested destination reconstruction
- [ ] Unit tests (10+ tests)
  - [ ] Root URL → default state
  - [ ] Valid URL → destination state
  - [ ] Invalid URL → default state
  - [ ] Nested URL → nested destination

#### Day 7: Integration & Public API
- [ ] Create `index.ts` with public exports
- [ ] Integration tests (complete flows)
  - [ ] Full navigation cycle (action → state → URL → back → action)
  - [ ] Deep link → navigate → back → forward
  - [ ] Multiple destinations
- [ ] Performance tests
  - [ ] No memory leaks
  - [ ] Fast serialization/parsing

**Checkpoint**: ✅ Browser integration complete

---

### Week 2: Examples & Documentation (Days 8-10)

#### Day 8: Complete Example
- [ ] Create `examples/url-routing/` directory
- [ ] Implement complete app with:
  - [ ] Multiple routes (list, detail, edit)
  - [ ] Nested destinations
  - [ ] Browser back/forward
  - [ ] Deep linking
  - [ ] URL sharing
- [ ] Browser tests for example (20+ tests)

#### Day 9: Documentation
- [ ] Write comprehensive routing guide
  - [ ] Getting started
  - [ ] Serialization patterns
  - [ ] Parsing patterns
  - [ ] Browser integration
  - [ ] Deep linking
  - [ ] Common patterns
- [ ] API reference documentation
- [ ] Migration guide (adding URL sync to existing app)

#### Day 10: Testing & Polish
- [ ] Run all tests (100+ total)
- [ ] Performance profiling
- [ ] Edge case testing
- [ ] Documentation review
- [ ] Code review

**Checkpoint**: ✅ Phase 7 Complete

---

## 9. Testing Strategy

### 9.1 Unit Tests (Serialization/Parsing)

**Pure function tests with Vitest:**

```typescript
// packages/core/tests/routing/serializer.test.ts

describe('serializeDestination', () => {
  it('returns base path for null destination', () => {
    const result = serializeDestination(null, config);
    expect(result).toBe('/inventory');
  });

  it('serializes simple destination', () => {
    const destination = { type: 'detailItem', state: { itemId: '123' } };
    const result = serializeDestination(destination, config);
    expect(result).toBe('/inventory/item-123');
  });

  it('serializes nested destination', () => {
    const destination = {
      type: 'detailItem',
      state: {
        itemId: '123',
        destination: {
          type: 'editForm',
          state: {}
        }
      }
    };
    const result = serializeDestination(destination, nestedConfig);
    expect(result).toBe('/inventory/item-123/edit');
  });

  it('handles unknown destination type', () => {
    const destination = { type: 'unknown', state: {} };
    const result = serializeDestination(destination, config);
    expect(result).toBe('/inventory'); // Fallback to base
  });
});

describe('parseDestination', () => {
  it('returns null for base path', () => {
    const result = parseDestination('/inventory', config);
    expect(result).toBe(null);
  });

  it('parses simple path', () => {
    const result = parseDestination('/inventory/item-123', config);
    expect(result).toEqual({
      type: 'detailItem',
      state: { itemId: '123' }
    });
  });

  it('parses nested path', () => {
    const result = parseDestination('/inventory/item-123/edit', nestedConfig);
    expect(result).toEqual({
      type: 'detailItem',
      state: {
        itemId: '123',
        destination: {
          type: 'editForm',
          state: {}
        }
      }
    });
  });

  it('returns null for invalid path', () => {
    const result = parseDestination('/invalid/path', config);
    expect(result).toBe(null);
  });
});

describe('matchPath', () => {
  it('matches pattern with params', () => {
    const result = matchPath('/item-:id', '/item-123');
    expect(result).toEqual({ id: '123' });
  });

  it('matches pattern with multiple params', () => {
    const result = matchPath('/item-:id/edit/:field', '/item-123/edit/name');
    expect(result).toEqual({ id: '123', field: 'name' });
  });

  it('returns null for non-matching path', () => {
    const result = matchPath('/item-:id', '/other/123');
    expect(result).toBe(null);
  });
});
```

### 9.2 Integration Tests (Browser History)

**Browser tests with @vitest/browser:**

```typescript
// packages/core/tests/routing/browser-history.browser.test.ts

import { test, expect } from 'vitest';
import { createStore } from '@composable-svelte/core';
import { syncBrowserHistory, serializeDestination, parseDestination } from '@composable-svelte/core/routing';

test('back button dispatches action', async () => {
  // Setup
  const store = createStore({ initialState, reducer });
  const cleanup = syncBrowserHistory(store, config);

  // Navigate forward (update state → URL)
  store.dispatch({ type: 'itemSelected', itemId: '123' });
  await vi.waitFor(() => {
    expect(window.location.pathname).toBe('/inventory/item-123');
  });

  // Click back button (URL → action)
  history.back();
  await vi.waitFor(() => {
    expect(store.state.destination).toBe(null);
    expect(window.location.pathname).toBe('/inventory');
  });

  cleanup();
});

test('state change updates URL', async () => {
  const store = createStore({ initialState, reducer });
  const cleanup = syncBrowserHistory(store, config);

  // Dispatch action
  store.dispatch({ type: 'itemSelected', itemId: '456' });

  // Wait for URL update
  await vi.waitFor(() => {
    expect(window.location.pathname).toBe('/inventory/item-456');
  });

  cleanup();
});

test('no infinite loops', async () => {
  const store = createStore({ initialState, reducer });
  const cleanup = syncBrowserHistory(store, config);

  const dispatchSpy = vi.spyOn(store, 'dispatch');

  // Navigate
  store.dispatch({ type: 'itemSelected', itemId: '789' });
  await vi.waitFor(() => {
    expect(window.location.pathname).toBe('/inventory/item-789');
  });

  // Dispatch should only be called once (not infinitely)
  expect(dispatchSpy).toHaveBeenCalledTimes(1);

  cleanup();
});
```

### 9.3 Deep Linking Tests

```typescript
// packages/core/tests/routing/deep-link.test.ts

describe('createInitialStateFromURL', () => {
  it('creates state from valid URL', () => {
    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: { pathname: '/inventory/item-123' },
      writable: true
    });

    const initialState = createInitialStateFromURL(
      defaultState,
      parse,
      setDestination
    );

    expect(initialState.destination).toEqual({
      type: 'detailItem',
      state: { itemId: '123' }
    });
  });

  it('returns default state for root URL', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/inventory' },
      writable: true
    });

    const initialState = createInitialStateFromURL(
      defaultState,
      parse,
      setDestination
    );

    expect(initialState).toEqual(defaultState);
  });

  it('returns default state for invalid URL', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/invalid' },
      writable: true
    });

    const initialState = createInitialStateFromURL(
      defaultState,
      parse,
      setDestination
    );

    expect(initialState).toEqual(defaultState);
  });
});
```

### 9.4 Test Utilities (TestStore Integration)

**Leveraging Existing TestStore:**

Phase 7 routing integrates seamlessly with the existing `TestStore` utility (from Phase 1) for testing reducers with URL synchronization:

```typescript
// packages/core/tests/routing/teststore-integration.test.ts

import { TestStore } from '@composable-svelte/core/test';
import { createURLSyncEffect, serializeDestination } from '@composable-svelte/core/routing';

describe('URL sync with TestStore', () => {
  it('updates URL when destination changes', async () => {
    const urlSyncEffect = createURLSyncEffect(
      (state: InventoryState) => serializeDestination(state.destination, config),
      { replace: false }
    );

    const store = new TestStore({
      initialState: { destination: null, items: [] },
      reducer: (state, action) => {
        const [newState, effect] = inventoryReducer(state, action, {});

        // Combine business logic effect with URL sync effect
        const combinedEffect = Effect.batch(effect, urlSyncEffect(newState));

        return [newState, combinedEffect];
      },
      dependencies: {}
    });

    // Send action
    await store.send({ type: 'itemSelected', itemId: '123' }, (state) => {
      expect(state.destination).toEqual({
        type: 'detailItem',
        state: { itemId: '123' }
      });
    });

    // Verify URL was updated
    expect(window.location.pathname).toBe('/inventory/item-123');

    store.finish();
  });

  it('receives actions from browser back button', async () => {
    const store = new TestStore({
      initialState: { destination: null, items: [] },
      reducer: inventoryReducer,
      dependencies: {}
    });

    // Navigate forward
    await store.send({ type: 'itemSelected', itemId: '456' });

    // Simulate back button (triggers popstate)
    history.back();

    // Receive the dismiss action
    await store.receive({ type: 'destination', action: { type: 'dismiss' } }, (state) => {
      expect(state.destination).toBe(null);
    });

    store.finish();
  });

  it('exhaustively tests navigation flow', async () => {
    const store = new TestStore({
      initialState: { destination: null, items: [] },
      reducer: inventoryReducer,
      dependencies: {}
    });

    // Step 1: Select item
    await store.send({ type: 'itemSelected', itemId: '789' }, (state) => {
      expect(state.destination?.type).toBe('detailItem');
    });

    // Step 2: Edit item
    await store.send(
      { type: 'destination', action: { type: 'presented', action: { type: 'editTapped' } } },
      (state) => {
        // Verify nested navigation if supported
        expect(state.destination?.state.isEditing).toBe(true);
      }
    );

    // Step 3: Dismiss
    await store.send(
      { type: 'destination', action: { type: 'dismiss' } },
      (state) => {
        expect(state.destination).toBe(null);
      }
    );

    // Verify all actions were handled
    store.finish();
  });
});
```

**TestStore Benefits for Routing:**

1. **Exhaustive Testing**: Ensures all actions are handled (no missed receives)
2. **State Assertions**: Validate state changes at each step
3. **Effect Verification**: Confirm URL sync effects execute correctly
4. **Browser API Mocking**: Test with `jsdom` or `happy-dom` for History API

**Integration with Browser Tests:**

Combine TestStore with `@vitest/browser` for full browser integration:

```typescript
// Browser-based test with TestStore
import { test } from 'vitest';
import { TestStore } from '@composable-svelte/core/test';
import { syncBrowserHistory } from '@composable-svelte/core/routing';

test('TestStore + real browser history', async () => {
  const store = new TestStore({
    initialState: { destination: null },
    reducer: inventoryReducer,
    dependencies: {}
  });

  // Convert TestStore to regular Store for browser sync
  const regularStore = {
    state: store.state,
    dispatch: (action) => store.send(action),
    subscribe: store.subscribe
  };

  const cleanup = syncBrowserHistory(regularStore, config);

  // Use TestStore assertions
  await store.send({ type: 'itemSelected', itemId: '999' });
  expect(window.location.pathname).toBe('/inventory/item-999');

  cleanup();
  store.finish();
});
```

**Key Testing Patterns:**

- **Unit Tests**: Use TestStore for reducer logic (no browser APIs)
- **Integration Tests**: Combine TestStore + `syncBrowserHistory()` for full flow
- **Browser Tests**: Use `@vitest/browser` for real History API testing

---

## 10. Examples

### 10.1 Simple Inventory App

```typescript
// examples/url-routing/inventory-app.ts

import { createStore, Effect } from '@composable-svelte/core';
import {
  serializeDestination,
  parseDestination,
  syncBrowserHistory,
  createURLSyncEffect,
  createInitialStateFromURL,
  pathSegment,
  matchPath
} from '@composable-svelte/core/routing';

// State
interface InventoryState {
  items: Item[];
  destination: InventoryDestination | null;
}

type InventoryDestination =
  | { type: 'detailItem'; state: { itemId: string } }
  | { type: 'editItem'; state: { itemId: string } }
  | { type: 'addItem'; state: {} };

// Actions
type InventoryAction =
  | { type: 'itemSelected'; itemId: string }
  | { type: 'editItemTapped'; itemId: string }
  | { type: 'addItemTapped' }
  | { type: 'closeDestination' };

// Routing config
const serializerConfig = {
  basePath: '/inventory',
  serializers: {
    detailItem: (state) => pathSegment('/inventory', `item-${state.itemId}`),
    editItem: (state) => pathSegment('/inventory', `item-${state.itemId}/edit`),
    addItem: () => '/inventory/add'
  }
};

const parserConfig = {
  basePath: '/inventory',
  parsers: [
    (path) => {
      const params = matchPath('/item-:id/edit', path);
      return params ? { type: 'editItem', state: { itemId: params.id } } : null;
    },
    (path) => {
      const params = matchPath('/item-:id', path);
      return params ? { type: 'detailItem', state: { itemId: params.id } } : null;
    },
    (path) => path === '/add' ? { type: 'addItem', state: {} } : null
  ]
};

// Reducer
const inventoryReducer = (state, action, deps) => {
  // Core logic
  const [newState, coreEffect] = coreReducer(state, action, deps);

  // URL sync
  const urlEffect = createURLSyncEffect(
    (s) => serializeDestination(s.destination, serializerConfig)
  )(newState);

  return [newState, Effect.batch(coreEffect, urlEffect)];
};

// Initialize from URL
const initialState = createInitialStateFromURL(
  defaultInitialState,
  (path) => parseDestination(path, parserConfig),
  (state, destination) => ({ ...state, destination })
);

// Create store
const store = createStore({
  initialState,
  reducer: inventoryReducer,
  dependencies: {}
});

// Sync browser history
const cleanup = syncBrowserHistory(store, {
  parse: (path) => parseDestination(path, parserConfig),
  serialize: (state) => serializeDestination(state.destination, serializerConfig),
  destinationToAction: (destination) => {
    if (!destination) return { type: 'closeDestination' };
    if (destination.type === 'detailItem') {
      return { type: 'itemSelected', itemId: destination.state.itemId };
    }
    if (destination.type === 'editItem') {
      return { type: 'editItemTapped', itemId: destination.state.itemId };
    }
    if (destination.type === 'addItem') {
      return { type: 'addItemTapped' };
    }
    return null;
  }
});
```

---

## 11. Edge Cases

### 11.1 Concurrent Navigation

**Problem**: User clicks button while back button is processing

**Solution**: Queue actions, process in order

```typescript
// Let reducer handle action queue naturally
// Browser history sync doesn't interfere
```

### 11.2 Invalid URLs

**Problem**: User types invalid URL or bookmarks broken link

**Solution**: Parse returns null → fallback to root state

```typescript
const destination = parseDestination(path, config);
if (destination === null) {
  // Show root view or 404
  return defaultInitialState;
}
```

### 11.3 Rapid State Changes

**Problem**: Multiple quick state changes could cause URL thrashing

**Solution**: Debounce URL updates with proper timeout management

```typescript
export function createURLSyncEffect<State, Action>(
  serialize: (state: State) => string,
  options: { replace?: boolean; debounceMs?: number } = {}
): (state: State) => Effect<Action> {
  // Shared timeout across effect executions
  let pendingTimeout: number | undefined;

  return (state: State): Effect<Action> => {
    const expectedPath = serialize(state);
    const currentPath = window.location.pathname;

    if (expectedPath !== currentPath) {
      return Effect.fireAndForget(() => {
        const stateMetadata = { composableSvelteSync: true };

        if (options.debounceMs) {
          // Clear previous pending timeout
          if (pendingTimeout !== undefined) {
            clearTimeout(pendingTimeout);
          }
          // Schedule new URL update
          pendingTimeout = window.setTimeout(() => {
            const method = options.replace ? 'replaceState' : 'pushState';
            history[method](stateMetadata, '', expectedPath);
            pendingTimeout = undefined;
          }, options.debounceMs);
        } else {
          // No debounce - update immediately
          const method = options.replace ? 'replaceState' : 'pushState';
          history[method](stateMetadata, '', expectedPath);
        }
      });
    }

    return Effect.none();
  };
}
```

**Note:** Debouncing is **optional** and usually not needed. Only use for high-frequency state updates (e.g., slider, typing).

### 11.4 Query Parameters and Hash Fragments (Deferred to v1.1)

**Status**: **Deferred to Phase 7 v1.1**

Phase 7 v1 focuses on **path-based routing only**:
- ✅ Paths: `/inventory/item-123`
- ❌ Query params: `/inventory?filter=active` (v1.1)
- ❌ Hash: `/inventory#section` (v1.1)

**Rationale:**
- Path routing covers 90% of navigation use cases
- Query params add complexity (parsing, merging, serialization)
- Keep v1 scope focused on core functionality

**Workaround for v1:** Store filters/search in app state, not URL:
```typescript
interface AppState {
  destination: Destination | null;
  filters: { category?: string; search?: string };  // In state, not URL
}
```

---

## 12. Success Criteria

### Phase 7 Complete When:

1. ✅ **API Implemented**
   - Serializer (`serializeDestination`)
   - Parser (`parseDestination`)
   - Browser history sync (`syncBrowserHistory`)
   - URL sync effect (`createURLSyncEffect`)
   - Deep linking (`createInitialStateFromURL`)

2. ✅ **Tests Passing**
   - 40+ unit tests (serialization/parsing)
   - 20+ integration tests (browser history)
   - 10+ deep linking tests
   - 20+ example app tests
   - **Total: 90+ tests**

3. ✅ **Example App Working**
   - Back/forward buttons work
   - Deep linking works (bookmark, share URL)
   - State → URL sync works
   - URL → state sync works
   - No infinite loops

4. ✅ **Documentation Complete**
   - Routing guide (getting started, patterns)
   - API reference (all functions documented)
   - Migration guide (add to existing app)
   - Common patterns documented

5. ✅ **Framework-Agnostic**
   - Works in vanilla Svelte
   - Works in Vite
   - NO SvelteKit dependencies
   - Browser History API only

### Quality Metrics

| Metric | Target | Measured By |
|--------|--------|-------------|
| Test coverage | 95%+ | Vitest coverage |
| Performance | <5ms serialization | Benchmarks |
| Bundle size | <3KB gzipped | Bundle analyzer |
| Documentation | 100% API coverage | Doc review |
| Zero infinite loops | 100% tests pass | Browser tests |

---

## 13. Future Enhancements (Post Phase 7)

### Optional Features (Not in Phase 7)

1. **SvelteKit Adapter** (separate package)
   - Thin wrapper using `goto()` instead of `history.pushState()`
   - SSR initial state from URL
   - File-based routing integration

2. **Query Parameter Support**
   - Store filters, search, pagination in query params
   - Serialize/parse query strings

3. **Hash-Based Routing** (for GitHub Pages, etc.)
   - Use `#/path` instead of `/path`
   - Support environments without server routing

4. **URL Validation**
   - Type-safe URL patterns
   - Compile-time route checking

5. **Animated Transitions**
   - Coordinate URL changes with animations
   - Wait for dismissal animation before history update

---

## Next Steps After Approval

1. Create `PHASE-7-TODO.md` with detailed task breakdown
2. Setup `packages/core/src/routing/` directory structure
3. Begin Day 1: Serialization API implementation
4. Daily progress tracking with completed checklist

---

## Summary

**Phase 7** adds URL synchronization to Composable Svelte using **pure browser History API** - no framework dependencies. This enables:

- ✅ Browser back/forward buttons
- ✅ Deep linking (bookmarks, sharing)
- ✅ URL-driven navigation
- ✅ State-driven URLs

**Timeline**: 1-2 weeks
**Tests**: 90+ tests
**Bundle**: <3KB gzipped
**Philosophy**: Framework-agnostic, composable architecture preserved

The implementation is **opt-in** (add effects to enable), **non-invasive** (reducers stay pure), and **testable** (serialization/parsing are pure functions).

Ready to implement! 🚀
