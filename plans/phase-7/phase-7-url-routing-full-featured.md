# Phase 7: Full-Featured URL Routing & Navigation

**Status**: In Progress
**Started**: 2025-11-02
**Quality Rating**: 9/10
**Target Completion**: TBD

---

## Overview

Transform the URL routing system from a simplified proof-of-concept into a **production-ready, full-featured routing solution** that supports:

✅ **Query parameters** with type safety and validation
✅ **Advanced route matching** (wildcards, constraints, optional segments)
✅ **Type-safe route generation** with autocomplete
✅ **Guards, redirects, and 404 handling**
✅ **Backwards compatibility** with existing simple use cases
✅ **Nested routes** (state composition works, just needs URL handling)

---

## Current Status

### ✅ Completed (Phase 7 Initial)
- [x] Basic URL parsing with `path-to-regexp`
- [x] Browser history synchronization (back/forward buttons)
- [x] Deep linking support
- [x] State → URL sync effects
- [x] URL → State parsing
- [x] **FIXED**: Store reactivity using Svelte store contract (`$store` syntax)
- [x] Example app demonstrating basic routing

### 🔄 In Progress
- [ ] Query parameter support (Phase 1)

### 📋 Planned
- [ ] Enhanced route matching (Phase 2)
- [ ] Guards, redirects & error handling (Phase 2.5)
- [ ] Type-safe router API (Phase 3)
- [ ] Nested route URL handling (Phase 4) - state composition already works!

---

## Architecture Vision

### Core Principles

1. **Incremental Complexity** - Simple cases stay simple, advanced cases are possible
2. **Type Safety First** - Leverage TypeScript for compile-time guarantees
3. **Svelte Integration** - Works seamlessly with Svelte 5 and the Composable Architecture
4. **Performance** - Fast route matching, efficient URL updates
5. **Backwards Compatible** - Existing code continues to work

### Route Definition Structure

```typescript
interface RouteConfig<Params = any, Query = any> {
  // Pattern matching (path-to-regexp syntax)
  pattern: string;

  // Type schemas (optional, for validation)
  params?: Schema<Params>;
  query?: Schema<Query>;

  // Route metadata
  name?: string;
  meta?: Record<string, any>;

  // Guards & redirects
  guard?: RouteGuard;
  redirect?: string | ((match: RouteMatch) => string);

  // Nested routes (1-2 levels max in v1.0)
  children?: Record<string, RouteConfig>;
}

interface RouteGuard {
  canActivate?: (match: RouteMatch) => boolean | { redirect: string };
  beforeEnter?: (match: RouteMatch) => void | { redirect: string };
}
```

---

## Phase 1: Query Parameter Support

**Goal**: Add comprehensive query parameter handling to existing routing system.

**Priority**: 🔥 **HIGH** - Quick win with immediate value
**Estimated Effort**: 1-2 weeks
**Status**: Not Started

### State Management Pattern Decision

**Question**: Where do query params live in state?

**Answer**: **Hybrid approach** (decided 2025-11-02):

```typescript
// PATTERN A: List-level query params → Top-level state fields
interface AppState {
  searchQuery: string;        // Synced with ?search=
  selectedCategory: string;   // Synced with ?category=
  sortBy: SortOption;         // Synced with ?sort=
  page: number;               // Synced with ?page=

  // Destination query params → Part of destination state
  destination: {
    type: 'item';
    itemId: string;
    activeTab: 'details' | 'reviews';  // Synced with ?tab=
  } | null;
}

// Reducer updates both state fields AND URL
const reducer: Reducer<AppState, AppAction, Deps> = (state, action, deps) => {
  switch (action.type) {
    case 'searchChanged':
      return [
        { ...state, searchQuery: action.query },
        // Sync to URL with replaceState (don't add history entry)
        createURLSyncEffect((s) => serializeState(s), { replace: true })
      ];
  }
};
```

**Rationale**:
- List-level params (search, filters, pagination) live in top-level state
- Destination-specific params (tabs, highlights) live in destination state
- Clear separation of concerns
- Easy to understand and maintain

### History Management Rules

**Critical Decision**: When to use `pushState` vs `replaceState`?

| Action Type | History Method | Rationale | Example |
|-------------|---------------|-----------|---------|
| Opening modal/destination | `pushState` | User can go back | Click item → modal opens |
| Closing modal/destination | `pushState` | User can go forward | Close modal → back to list |
| Changing tabs within modal | `replaceState` | Don't pollute history | Click "Reviews" tab |
| Typing in search (debounced) | `replaceState` | Don't add entry per keystroke | Search: "lap" → "lapt" → "laptop" |
| Changing page | `pushState` | User can navigate back | Page 1 → Page 2 |
| Applying filters (immediate) | `pushState` | User can undo filter | Filter by category |
| Changing sort order | `replaceState` | Usually paired with filter | Sort by price |

**Implementation**:
```typescript
// Sync effect with history control
createURLSyncEffect(serialize, {
  replace: true  // Use replaceState instead of pushState
})
```

### Tasks

#### 1.1 Core Query Utilities ⭐ **START HERE**

**File**: `packages/core/src/routing/query-params.ts`

- [ ] **Implement `parseQueryParams<T>()`**
  ```typescript
  /**
   * Parse URL query string into typed object.
   *
   * @param search - Query string (with or without leading '?')
   * @param schema - Optional schema for validation/coercion
   * @returns Parsed and typed query params
   *
   * @example
   * parseQueryParams('?search=laptop&page=2')
   * // → { search: 'laptop', page: '2' }
   *
   * parseQueryParams('?tags=a&tags=b&tags=c')
   * // → { tags: ['a', 'b', 'c'] }
   *
   * parseQueryParams('?page=2', {
   *   page: number().default(1)
   * })
   * // → { page: 2 }  (type coerced to number)
   */
  export function parseQueryParams<T = Record<string, any>>(
    search: string,
    schema?: Schema<T>
  ): T
  ```

- [ ] **Implement `serializeQueryParams()`**
  ```typescript
  /**
   * Serialize object to URL query string.
   *
   * @param params - Object to serialize
   * @returns Query string (without leading '?')
   *
   * @example
   * serializeQueryParams({ search: 'laptop', page: 2 })
   * // → 'search=laptop&page=2'
   *
   * serializeQueryParams({ tags: ['a', 'b', 'c'] })
   * // → 'tags=a&tags=b&tags=c'
   *
   * serializeQueryParams({ search: undefined, page: 2 })
   * // → 'page=2'  (undefined values omitted)
   */
  export function serializeQueryParams(
    params: Record<string, any>
  ): string
  ```

- [ ] **Handle edge cases**:
  - [ ] Arrays: `?tags=a&tags=b` → `{ tags: ['a', 'b'] }`
  - [ ] Empty values: `?search=` → `{ search: '' }`
  - [ ] Special characters: `?q=hello%20world` → `{ q: 'hello world' }`
  - [ ] Reserved chars: `?`, `&`, `=`, `#` (URL encode)
  - [ ] Undefined/null: Omit from query string
  - [ ] Boolean: `?enabled=true` → `{ enabled: true }`
  - [ ] Numbers: `?page=2` → `{ page: '2' }` (string by default)

- [ ] **Add tests**: `packages/core/tests/routing/query-params.test.ts`

#### 1.2 Simple Schema System

**Goal**: Lightweight type coercion and validation (no external dependencies).

**File**: `packages/core/src/routing/schemas.ts`

- [ ] **Create schema primitives**:
  ```typescript
  export const string = () => ({
    parse: (val: unknown) => String(val),
    optional: () => ({ parse: (val: unknown) => val === undefined ? undefined : String(val) }),
    default: (def: string) => ({ parse: (val: unknown) => val === undefined ? def : String(val) })
  });

  export const number = () => ({
    parse: (val: unknown) => {
      const num = Number(val);
      if (isNaN(num)) throw new Error(`Invalid number: ${val}`);
      return num;
    },
    optional: () => ({ /*...*/ }),
    default: (def: number) => ({ /*...*/ })
  });

  export const boolean = () => ({
    parse: (val: unknown) => val === 'true' || val === '1' || val === true
  });

  export const enums = <T extends readonly string[]>(values: T) => ({
    parse: (val: unknown) => {
      if (!values.includes(val as any)) {
        throw new Error(`Invalid enum value: ${val}. Expected: ${values.join(', ')}`);
      }
      return val as T[number];
    }
  });

  export const array = <T>(itemSchema: Schema<T>) => ({
    parse: (val: unknown) => {
      const arr = Array.isArray(val) ? val : [val];
      return arr.map(itemSchema.parse);
    }
  });
  ```

- [ ] **Usage example**:
  ```typescript
  const querySchema = {
    search: string().optional(),
    category: string().optional(),
    sort: enums(['name', 'price', 'date']).default('name'),
    page: number().default(1),
    tags: array(string()).optional()
  };

  const query = parseQueryParams('?search=laptop&page=2', querySchema);
  // → { search: 'laptop', category: undefined, sort: 'name', page: 2, tags: undefined }
  ```

- [ ] **Add tests**: `packages/core/tests/routing/schemas.test.ts`

**Future**: Add `@composable-svelte/routing-zod` package for Zod integration.

#### 1.3 Update Routing Types

- [ ] **Extend `RouteMatch`**:
  ```typescript
  interface RouteMatch {
    route: string;
    params: Record<string, string>;
    query: Record<string, any>;  // ← NEW
    pattern: string;
  }
  ```

- [ ] **Update destination types**:
  ```typescript
  // Example: Add query to destinations
  type InventoryDestination =
    | { type: 'list'; query?: { search?: string; category?: string; page?: number } }
    | { type: 'item'; itemId: string; query?: { tab?: string } };
  ```

#### 1.4 Update Sync Effect

**File**: `packages/core/src/routing/sync-effect.ts`

- [ ] **Compare full URL (pathname + search)**:
  ```typescript
  export function createURLSyncEffect<State, Action>(
    serialize: (state: State) => { path: string; query?: Record<string, any> },
    options: URLSyncOptions = {}
  ): (state: State) => Effect<Action> {
    return (state: State): Effect<Action> => {
      const { path, query = {} } = serialize(state);
      const expectedPath = path;
      const expectedSearch = serializeQueryParams(query);
      const expectedURL = query ? `${path}?${expectedSearch}` : path;

      const currentURL = `${window.location.pathname}${window.location.search}`;

      if (expectedURL === currentURL) {
        return Effect.none();
      }

      return Effect.fireAndForget(() => {
        const method = options.replace ? 'replaceState' : 'pushState';
        const fullPath = expectedSearch ? `${path}?${expectedSearch}` : path;
        history[method]({ composableSvelteSync: true }, '', fullPath);
      });
    };
  }
  ```

- [ ] **Add `replace` option** for controlling history behavior

#### 1.5 Update Deep Link Parser

**File**: `packages/core/src/routing/deep-link.ts`

- [ ] **Parse query params from initial URL**:
  ```typescript
  export function createInitialStateFromURL<State, Destination>(
    defaultState: State,
    parse: (path: string, query: Record<string, any>) => Destination | null,
    updateState: (state: State, dest: Destination) => State
  ): State {
    const path = window.location.pathname;
    const query = parseQueryParams(window.location.search);

    const destination = parse(path, query);
    if (!destination) return defaultState;

    return updateState(defaultState, destination);
  }
  ```

#### 1.6 Update Browser History Sync

**File**: `packages/core/src/routing/browser-history.ts`

- [ ] **Pass query params to `destinationToAction`**:
  ```typescript
  const handlePopState = (event: PopStateEvent) => {
    if (event.state?.composableSvelteSync) return;

    const path = window.location.pathname;
    const query = parseQueryParams(window.location.search);
    const destination = config.parse(path, query);  // ← Pass query

    const action = config.destinationToAction(destination, query);  // ← Pass query
    if (action) store.dispatch(action);
  };
  ```

#### 1.7 Documentation

- [ ] **Create guide**: `docs/routing/query-parameters.md`
  - Basic usage
  - Schema validation
  - State management patterns
  - History management rules
  - Common pitfalls

- [ ] **Add examples**:
  - [ ] Pagination example (with pushState)
  - [ ] Search-as-you-type (with debounce + replaceState)
  - [ ] Filtering (with pushState)
  - [ ] Tab navigation (with replaceState)

#### 1.8 Example App Updates

**File**: `examples/url-routing/src/`

- [ ] **Add search bar with URL sync**:
  ```svelte
  <input
    type="text"
    value={$store.searchQuery}
    oninput={(e) => {
      store.dispatch({
        type: 'searchChanged',
        query: e.currentTarget.value
      });
    }}
  />
  ```

- [ ] **Add category filter**:
  ```svelte
  <select
    value={$store.selectedCategory ?? ''}
    onchange={(e) => {
      store.dispatch({
        type: 'categorySelected',
        category: e.currentTarget.value || null
      });
    }}
  >
    <option value="">All Categories</option>
    {#each categories as category}
      <option value={category}>{category}</option>
    {/each}
  </select>
  ```

- [ ] **Add pagination**:
  ```svelte
  <div class="pagination">
    <button
      disabled={$store.page === 1}
      onclick={() => store.dispatch({ type: 'previousPage' })}
    >
      Previous
    </button>
    <span>Page {$store.page}</span>
    <button
      disabled={$store.page >= totalPages}
      onclick={() => store.dispatch({ type: 'nextPage' })}
    >
      Next
    </button>
  </div>
  ```

- [ ] **Update reducer to sync query params**

#### 1.9 Complete Examples

Each example must show the full flow: **Route → Parser → State → Reducer → Serializer → URL**

**Example 1: Search with Debouncing**
```typescript
// 1. State definition
interface AppState {
  searchQuery: string;
  items: Item[];
}

// 2. Actions
type AppAction =
  | { type: 'searchChanged'; query: string }
  | { type: 'searchDebounced'; query: string };

// 3. Reducer
const reducer: Reducer<AppState, AppAction, Deps> = (state, action, deps) => {
  switch (action.type) {
    case 'searchChanged':
      // Update state immediately, debounce URL sync
      return [
        { ...state, searchQuery: action.query },
        Effect.debounced('search-url-sync', 500, (dispatch) => {
          dispatch({ type: 'searchDebounced', query: action.query });
        })
      ];

    case 'searchDebounced':
      // Sync to URL (replaceState - don't add history entry)
      return [
        state,
        createURLSyncEffect(
          (s) => ({
            path: '/inventory',
            query: { search: s.searchQuery || undefined }
          }),
          { replace: true }
        )
      ];
  }
};

// 4. Parser
function parseInventoryURL(path: string, query: any): Destination | null {
  if (path === '/inventory') {
    return { type: 'list', query };
  }
  return null;
}

// 5. Component
<input
  type="text"
  value={$store.searchQuery}
  oninput={(e) => store.dispatch({
    type: 'searchChanged',
    query: e.currentTarget.value
  })}
/>
```

**Example 2: Pagination with History**
```typescript
// Actions
type AppAction =
  | { type: 'nextPage' }
  | { type: 'previousPage' }
  | { type: 'pageChanged'; page: number };

// Reducer
case 'nextPage':
  const nextPage = state.page + 1;
  return [
    { ...state, page: nextPage },
    createURLSyncEffect(
      (s) => ({ path: '/inventory', query: { page: s.page } }),
      { replace: false }  // Use pushState - can go back
    )
  ];

case 'previousPage':
  const prevPage = Math.max(1, state.page - 1);
  return [
    { ...state, page: prevPage },
    createURLSyncEffect(
      (s) => ({ path: '/inventory', query: { page: s.page } }),
      { replace: false }  // Use pushState
    )
  ];
```

**Example 3: Tab Navigation (No History)**
```typescript
// Actions
type ItemAction =
  | { type: 'tabChanged'; tab: 'details' | 'reviews' | 'history' };

// Reducer
case 'tabChanged':
  return [
    { ...state, activeTab: action.tab },
    createURLSyncEffect(
      (s) => ({
        path: `/inventory/item/${state.itemId}`,
        query: { tab: s.activeTab }
      }),
      { replace: true }  // Use replaceState - don't pollute history
    )
  ];
```

### Testing Checklist

**Unit Tests** (`query-params.test.ts`):
- [ ] Parse empty query string → `{}`
- [ ] Parse single param: `?search=test` → `{ search: 'test' }`
- [ ] Parse multiple params: `?a=1&b=2` → `{ a: '1', b: '2' }`
- [ ] Parse arrays: `?tags=a&tags=b` → `{ tags: ['a', 'b'] }`
- [ ] Parse special chars: `?q=hello%20world` → `{ q: 'hello world' }`
- [ ] Serialize params: `{ a: 1, b: 2 }` → `'a=1&b=2'`
- [ ] Serialize arrays: `{ tags: ['a', 'b'] }` → `'tags=a&tags=b'`
- [ ] Round-trip: `parse(serialize(obj))` === `obj`
- [ ] Schema number coercion: `?page=2` → `{ page: 2 }`
- [ ] Schema enum validation: `?sort=invalid` → Error
- [ ] Optional params omitted when undefined
- [ ] Default values applied when missing

**Integration Tests** (`routing-integration.test.ts`):
- [ ] Change query param → URL updates
- [ ] URL changes → State updates
- [ ] Browser back → Query params restore
- [ ] Deep link with query params works
- [ ] Multiple query params sync correctly

**Browser Tests** (`query-params.browser.test.ts`):
- [ ] Type in search → URL updates (debounced)
- [ ] Change category → URL updates immediately
- [ ] Navigate pages → History entries created
- [ ] Change tabs → No history entries
- [ ] Browser back button restores query params
- [ ] Deep link loads with query params

### Success Criteria

✅ **Functional**:
- [ ] Query params parse correctly
- [ ] Query params serialize correctly
- [ ] Bidirectional sync works
- [ ] All history rules followed

✅ **Quality**:
- [ ] Type-safe query param access
- [ ] Zero breaking changes
- [ ] All tests passing
- [ ] Examples demonstrate all features

✅ **Documentation**:
- [ ] API reference complete
- [ ] Guide published
- [ ] Examples documented
- [ ] Migration guide written

---

## Phase 2: Enhanced Route Matching

**Goal**: Leverage `path-to-regexp` for advanced route patterns and better performance.

**Priority**: 🔶 **MEDIUM** - Builds on Phase 1
**Estimated Effort**: 2-3 weeks
**Status**: Not Started

### Tasks

#### 2.1 Route Compiler

**File**: `packages/core/src/routing/route-compiler.ts`

- [ ] **Implement `compileRoute()`**:
  ```typescript
  /**
   * Compile a route pattern into a matcher and path generator.
   *
   * @param pattern - path-to-regexp pattern
   * @param options - Compilation options
   * @returns Compiled route with matcher and generator
   *
   * @example
   * const route = compileRoute('/item/:id(\\d+)');
   * route.regexp.test('/item/123')  // → true
   * route.regexp.test('/item/abc')  // → false
   * route.toPath({ id: '123' })     // → '/item/123'
   */
  export function compileRoute(
    pattern: string,
    options?: CompileOptions
  ): CompiledRoute
  ```

- [ ] **Implement `compileRoutes()`**:
  ```typescript
  /**
   * Compile route configuration tree into flat list.
   *
   * Recursively processes route tree, generating full paths
   * and assigning route names.
   *
   * @example
   * const compiled = compileRoutes({
   *   pattern: '/inventory',
   *   children: {
   *     item: { pattern: 'item/:id' }
   *   }
   * });
   * // → [
   * //   { name: 'root', pattern: '/inventory', ... },
   * //   { name: 'item', pattern: '/inventory/item/:id', ... }
   * // ]
   */
  export function compileRoutes(
    config: RouteConfig
  ): CompiledRoute[]
  ```

- [ ] **Cache compiled routes** for performance

#### 2.2 Advanced Pattern Support

- [ ] **Optional segments**: `/inventory/:category?/:subcategory?`
  ```typescript
  // Matches:
  // /inventory
  // /inventory/electronics
  // /inventory/electronics/laptops
  ```

- [ ] **Wildcards**: `/inventory/*`
  ```typescript
  // Matches:
  // /inventory/anything
  // /inventory/deeply/nested/path
  ```

- [ ] **Constraints**: `/inventory/:id(\\d+)`
  ```typescript
  // Matches: /inventory/123
  // Doesn't match: /inventory/abc
  ```

- [ ] **Multiple params**: `/inventory/:category/:subcategory/:id`

- [ ] **Custom regex**: `/:id([a-f0-9-]{36})`
  ```typescript
  // Matches UUID format only
  ```

#### 2.3 Route Matching Engine

- [ ] **Implement `matchRoute()`**:
  ```typescript
  /**
   * Match path against compiled routes.
   *
   * Tests path against all routes in order, returning first match.
   * Route order matters! Static routes should come before param routes.
   *
   * @example
   * const match = matchRoute('/inventory/item/123', compiledRoutes);
   * // → {
   * //   route: 'item',
   * //   params: { id: '123' },
   * //   query: {},
   * //   pattern: '/inventory/item/:id'
   * // }
   */
  export function matchRoute(
    path: string,
    routes: CompiledRoute[]
  ): RouteMatch | null
  ```

#### 2.4 Route Priority & Conflict Detection

**Rule**: Static routes match before parameterized routes.

- [ ] **Document route ordering**:
  ```typescript
  // ✅ GOOD: Static first
  const routes = [
    { pattern: '/item/new' },      // Static
    { pattern: '/item/:id' }       // Param
  ];
  // '/item/new' matches first route

  // ❌ BAD: Param first
  const routes = [
    { pattern: '/item/:id' },      // Matches everything!
    { pattern: '/item/new' }       // Never reached
  ];
  ```

- [ ] **Implement conflict detector**:
  ```typescript
  /**
   * Detect potentially ambiguous routes.
   * Warns if static route comes after param route that would match it.
   */
  export function detectRouteConflicts(routes: CompiledRoute[]): Warning[]
  ```

#### 2.5 Path Generation

- [ ] **Implement `generatePath()`**:
  ```typescript
  /**
   * Generate path from pattern and params.
   *
   * @throws If required params are missing
   *
   * @example
   * generatePath('/item/:id', { id: '123' })
   * // → '/item/123'
   *
   * generatePath('/item/:id/:action?', { id: '123' })
   * // → '/item/123'
   *
   * generatePath('/item/:id/:action?', { id: '123', action: 'edit' })
   * // → '/item/123/edit'
   */
  export function generatePath(
    pattern: string,
    params: Record<string, any>
  ): string
  ```

- [ ] **Cache compiled path functions**

#### 2.6 Testing

**Unit Tests**:
- [ ] Compile simple pattern: `/item/:id`
- [ ] Compile optional segment: `/item/:id/:action?`
- [ ] Compile wildcard: `/item/*`
- [ ] Compile constraint: `/item/:id(\\d+)`
- [ ] Match path against compiled route
- [ ] Extract params from match
- [ ] Generate path from params
- [ ] Detect route conflicts

**Performance Tests**:
- [ ] Match against 10 routes: <1ms
- [ ] Match against 100 routes: <5ms
- [ ] Match against 1000 routes: <50ms
- [ ] Generate path: <0.5ms

### Success Criteria

- ✅ All path-to-regexp patterns supported
- ✅ Type-safe param extraction
- ✅ Route conflict detection warns developers
- ✅ Performance targets met
- ✅ Backwards compatible

---

## Phase 2.5: Guards, Redirects & Error Handling

**Goal**: Add production-ready error handling, guards, and redirects.

**Priority**: 🔶 **MEDIUM-HIGH** - Critical for real apps
**Estimated Effort**: 1 week
**Status**: Not Started

### Motivation

Real-world apps need:
- **404 handling** when URLs don't match any route
- **Redirects** for old URLs, shortcuts, auth flows
- **Guards** to protect routes (auth, permissions)
- **Validation** of route params (does item exist?)

### Tasks

#### 2.5.1 404 Handling

**Pattern**: Define a fallback route or return null.

```typescript
// Option A: Fallback destination
function parseURL(path: string): Destination | null {
  const match = router.match(path);

  if (!match) {
    // Return 404 destination
    return { type: 'notFound', path };
  }

  // ... normal parsing
}

// Option B: Return null, let caller handle
function parseURL(path: string): Destination | null {
  const match = router.match(path);
  if (!match) return null;  // Caller shows 404 UI
  // ...
}
```

**Tasks**:
- [ ] Document 404 handling patterns
- [ ] Add 404 example to example app
- [ ] Show how to render 404 UI
- [ ] Show how to log 404s for monitoring

#### 2.5.2 Redirects

**Use Cases**:
- Old URLs → New URLs
- Shortcuts (`/profile` → `/user/me`)
- Auth flows (`/admin` → `/login` if not authenticated)

**Implementation**:
```typescript
interface RouteConfig {
  // ... existing fields
  redirect?: string | ((match: RouteMatch) => string);
}

// Static redirect
{
  pattern: '/old-inventory',
  redirect: '/inventory'
}

// Dynamic redirect
{
  pattern: '/profile',
  redirect: (match) => `/user/${currentUser.id}`
}
```

**Tasks**:
- [ ] Add `redirect` field to RouteConfig
- [ ] Implement redirect logic in router
- [ ] Support both static and dynamic redirects
- [ ] Add redirect examples
- [ ] Document redirect best practices

#### 2.5.3 Route Guards

**Use Cases**:
- Authentication checks
- Permission checks
- Feature flags
- Rate limiting

**Implementation**:
```typescript
interface RouteGuard {
  canActivate?: (match: RouteMatch) => boolean | { redirect: string };
}

interface RouteConfig {
  // ... existing fields
  guard?: RouteGuard;
}

// Example: Protect admin routes
{
  pattern: '/admin',
  guard: {
    canActivate: (match) => {
      if (!user.isAdmin) {
        return { redirect: '/login?from=/admin' };
      }
      return true;
    }
  }
}
```

**Tasks**:
- [ ] Add `guard` field to RouteConfig
- [ ] Implement guard checking in parser
- [ ] Support sync and async guards
- [ ] Add guard examples
- [ ] Document guard patterns

#### 2.5.4 Param Validation

**Use Case**: URL params are valid, but resource doesn't exist.

```typescript
// URL: /item/999
// Parser extracts: { type: 'item', id: '999' }
// But item 999 doesn't exist!

// Solution: Validate in reducer or parser
function parseURL(path: string, query: any, state: AppState): Destination | null {
  if (match.route === 'item') {
    const itemId = match.params.id;
    const itemExists = state.items.some(i => i.id === itemId);

    if (!itemExists) {
      return { type: 'notFound', path };  // Show 404
    }

    return { type: 'item', itemId };
  }
}
```

**Tasks**:
- [ ] Document validation patterns
- [ ] Show how to validate in parser
- [ ] Show how to validate in reducer
- [ ] Add validation examples

### Complete Example: Protected Route

```typescript
// 1. Define protected route
const adminRoute: RouteConfig = {
  pattern: '/admin',
  guard: {
    canActivate: (match) => {
      if (!user.isAuthenticated) {
        return { redirect: `/login?from=${match.pattern}` };
      }
      if (!user.isAdmin) {
        return { redirect: '/unauthorized' };
      }
      return true;
    }
  }
};

// 2. Router checks guard
const router = createRouter({ admin: adminRoute });

const match = router.match('/admin');
if (match) {
  const guardResult = match.route.guard?.canActivate(match);

  if (guardResult !== true) {
    // Redirect
    window.location.href = guardResult.redirect;
  } else {
    // Proceed normally
    const destination = parse(match);
    dispatch(destinationToAction(destination));
  }
}
```

### Success Criteria

- ✅ 404s handled gracefully
- ✅ Redirects work for common cases
- ✅ Guards protect sensitive routes
- ✅ Param validation prevents errors
- ✅ Clear error messages
- ✅ Examples demonstrate all patterns

---

## Phase 3: Type-Safe Router API

**Goal**: Create ergonomic, type-safe API with autocomplete and compile-time validation.

**Priority**: 🟡 **MEDIUM** - Developer experience enhancement
**Estimated Effort**: 2-3 weeks
**Status**: Not Started

### Type Inference Goals

**Goal 1: Route Name Autocomplete**
```typescript
const router = createRouter({
  inventory: {
    pattern: '/inventory',
    children: {
      item: { pattern: 'item/:id' }
    }
  }
});

// Autocomplete suggests: 'inventory', 'inventory.item'
router.to('inventory.item', { id: '123' });
          ^^^^^^^^^^^^^^^^
          Autocomplete!
```

**Goal 2: Type-Safe Params**
```typescript
// TypeScript knows `id` is required
router.to('inventory.item', { id: '123' });  // ✅ OK

router.to('inventory.item', {});  // ❌ Error: Missing required param 'id'

router.to('inventory.item', { id: 123 });  // ❌ Error: id must be string
```

**Goal 3: Type-Safe Query Params**
```typescript
router.to('inventory.list', {}, {
  search: 'laptop',
  page: 2
});  // ✅ OK

router.to('inventory.list', {}, {
  search: 'laptop',
  page: 'two'  // ❌ Error: page must be number
});
```

### Implementation Strategy

**Challenge**: TypeScript template literal type inference is complex.

**Options**:
1. **Full inference** (ambitious): Infer everything from config
2. **Manual types** (practical): Generate types with tool
3. **Hybrid** (recommended): Infer route names, manual param types

**Recommendation**: Start with **manual param types**, add inference later if needed.

```typescript
// Define param types explicitly
interface RouteParams {
  'inventory.list': {};
  'inventory.item': { id: string };
  'inventory.item.edit': { id: string };
}

// Router uses these types
const router = createRouter<RouteParams>({
  // ... config
});

// Now autocomplete and type-checking work!
router.to('inventory.item', { id: '123' });
```

### Tasks

#### 3.1 Router Factory

**File**: `packages/core/src/routing/create-router.ts`

- [ ] **Implement `createRouter<Routes>()`**:
  ```typescript
  /**
   * Create type-safe router from route configuration.
   *
   * @template Routes - Route param types (optional)
   * @param config - Route configuration tree
   * @returns Router with type-safe methods
   *
   * @example
   * interface MyRoutes {
   *   'item': { id: string };
   *   'item.edit': { id: string };
   * }
   *
   * const router = createRouter<MyRoutes>({
   *   item: {
   *     pattern: '/item/:id',
   *     children: {
   *       edit: { pattern: 'edit' }
   *     }
   *   }
   * });
   *
   * router.to('item', { id: '123' });  // Type-safe!
   */
  export function createRouter<Routes = any>(
    config: RouteConfig
  ): TypedRouter<Routes>
  ```

#### 3.2 Router API Methods

- [ ] **`match(path: string)`**: Match path to route
- [ ] **`to(name, params, query)`**: Generate URL by route name
- [ ] **`navigate(name, params, query, options)`**: Navigate programmatically

#### 3.3 Developer Tools

- [ ] **Route debugger**:
  ```typescript
  router.debug();  // Logs all routes
  router.debug('/item/123');  // Shows which route matched
  ```

- [ ] **Route visualization**:
  ```typescript
  console.log(router.toString());
  // inventory
  //   ├─ list (/)
  //   ├─ item (/item/:id)
  //   │  ├─ edit (/item/:id/edit)
  //   │  └─ reviews (/item/:id/reviews)
  ```

### Success Criteria

- ✅ Autocomplete works for route names
- ✅ Type errors for wrong params
- ✅ Helpful error messages
- ✅ Integration examples complete

---

## Phase 4: Nested Destinations

**Status**: ✅ **READY FOR IMPLEMENTATION** (State composition already works!)
**Priority**: MEDIUM (v1.0 or v1.1)
**Estimated Effort**: 2-3 weeks

### Key Insight: `ifLet` Already Handles Recursive Composition ✨

**Discovery (2025-11-02)**: The existing `ifLet` operator **already supports arbitrary nesting** through recursive composition! The state forms a tree, and at each level you can use another `ifLet`.

**Evidence**: Test case at `packages/core/tests/navigation/operators.test.ts:659-688` demonstrates 3-level deep nesting:

```typescript
type DeepAction = {
  type: 'level1';
  action: PresentationAction<{
    type: 'level2';
    action: PresentationAction<{ type: 'level3'; value: number }>;
  }>;
};

// Successfully matches 'level1.level2.level3' path! ✅
```

### What's Already Supported (No New Code Needed!)

**Recursive State Composition**:
```typescript
// ✅ Level 1
interface AppState {
  destination: Level1Destination | null; // ifLet works here
}

type Level1Destination =
  | { type: 'item'; state: ItemDetailState }
  | { type: 'settings'; state: SettingsState };

// ✅ Level 2 - ItemDetailState can have its own destination!
interface ItemDetailState {
  itemId: string;
  destination: Level2Destination | null; // Another ifLet works here!
}

type Level2Destination =
  | { type: 'reviews'; state: ReviewsState }
  | { type: 'shipping'; state: ShippingState };

// ✅ Level 3 - ReviewsState can ALSO have a destination!
interface ReviewsState {
  destination: Level3Destination | null; // Keep going as deep as needed!
}

type Level3Destination =
  | { type: 'reviewDetail'; state: ReviewDetailState };

// ... and so on, arbitrarily deep!
```

**Recursive Reducer Composition**:
```typescript
// Parent reducer uses ifLet to delegate to child
const appReducer = (state, action, deps) => {
  // ... handle app-level actions

  // Delegate to destination
  return ifLet(
    s => s.destination,
    (s, d) => ({ ...s, destination: d }),
    // ... action prisms
    itemDetailReducer  // ← Child reducer
  )(state, action, deps);
};

// Child reducer ALSO uses ifLet to delegate to grandchild!
const itemDetailReducer = (state, action, deps) => {
  // ... handle item detail actions

  // Delegate to nested destination
  return ifLet(
    s => s.destination,
    (s, d) => ({ ...s, destination: d }),
    // ... action prisms
    reviewsReducer  // ← Grandchild reducer
  )(state, action, deps);
};

// Grandchild can delegate to great-grandchild... infinitely!
```

### What Phase 4 Actually Needs to Implement

Since state composition works, we only need **URL handling** for nested structures:

#### 4.1 URL Pattern for Nested Routes

```typescript
// Parse: /inventory/item/123/reviews/456
interface NestedRouteMatch {
  segments: Array<{
    pattern: string;      // 'item', 'reviews'
    params: Record<string, string>;  // { id: '123' }, { reviewId: '456' }
  }>;
}
```

#### 4.2 State Reconstruction from URL

```typescript
// URL → Nested state tree
function reconstructNestedState(
  match: NestedRouteMatch,
  config: NestedRouteConfig
): NestedState {
  // Walk segments, build tree bottom-up or top-down
  // /item/123/reviews/456 →
  // {
  //   destination: {
  //     type: 'item',
  //     state: {
  //       itemId: '123',
  //       destination: {
  //         type: 'reviews',
  //         state: { reviewId: '456' }
  //       }
  //     }
  //   }
  // }
}
```

#### 4.3 Nested State Serialization to URL

```typescript
// Nested state tree → URL
function serializeNestedState(
  state: NestedState,
  config: NestedRouteConfig
): string {
  // Walk destination tree, build URL segments
  // {
  //   destination: {
  //     type: 'item',
  //     state: { itemId: '123', destination: { ... } }
  //   }
  // }
  // → /item/123/reviews/456
}
```

### Implementation Tasks

- [ ] **Task 4.1**: Recursive URL parser for nested segments
  - Handle `/parent/:id/child/:childId/grandchild/:grandchildId`
  - Extract all params at each level
  - Build hierarchical match structure

- [ ] **Task 4.2**: State reconstruction helper
  - Walk parsed segments
  - Build nested destination tree
  - Handle missing/invalid segments gracefully

- [ ] **Task 4.3**: Serialization helper
  - Walk state tree (follows `destination` fields recursively)
  - Build URL path from destination types + params
  - Handle query params at each level

- [ ] **Task 4.4**: Update routing config to support nesting
  - Extend `RouteConfig` to allow recursive children
  - Maintain backwards compatibility (flat routes still work)

- [ ] **Task 4.5**: Examples
  - 3-level deep example: List → Item → Reviews → Review Detail
  - Show reducer composition with nested `ifLet`
  - Demonstrate URL sync for nested state

- [ ] **Task 4.6**: Documentation
  - Explain how `ifLet` enables nesting (already works!)
  - Show state tree pattern
  - URL patterns for nested routes
  - When to use nesting vs flat routes

### Depth Limits (Practical Considerations)

**Recommendation**: Support unlimited depth but discourage >3 levels for UX reasons.

**Why limit depth?**
- **UX**: Deep nesting = confusing navigation
- **Mobile**: Hard to show nested modals
- **Performance**: Longer URLs, more parsing

**Best Practices**:
```typescript
// ✅ Good: 2-3 levels max
/inventory/item/123/reviews          // List → Detail → Sub-view
/settings/account/security/2fa       // Hierarchy

// ❌ Avoid: 5+ levels
/a/b/c/d/e/f/g  // Users get lost!
```

### Migration from "Deferred" Status

**Previous Understanding** (INCORRECT):
> "Current `ifLet` operator handles one level of nesting. Arbitrary depth requires redesigning reducer composition."

**Corrected Understanding** (2025-11-02):
> "`ifLet` is a function that operates on `ParentState → ChildState | null`. Since child state can itself contain a `destination` field, composition is naturally recursive. No library changes needed - just URL handling!"

**Impact**: Phase 4 is **much simpler** than originally thought. The hard part (state/reducer composition) already works. We just need URL parsing/serialization.

---

## Performance Targets

### Route Matching
- ✅ Single route match: **<1ms** (p99)
- ✅ 100 routes match: **<5ms** (p99)
- ⚠️ 1000 routes match: **<50ms** (p99) - May need radix tree optimization

### Path Generation
- ✅ Simple path: **<0.5ms**
- ✅ Path with 10 params: **<1ms**

### Memory
- ✅ Router overhead: **<100KB**
- ✅ Per-route overhead: **<1KB**

### URL Update Frequency
- ✅ Debounced search: **300-500ms** debounce
- ✅ Tab changes: **Immediate** (replaceState)
- ✅ Pagination: **Immediate** (pushState)

---

## Testing Strategy

### Unit Tests (Vitest)

**Coverage Target**: >90%

- [ ] Query param parsing/serialization
- [ ] Schema validation
- [ ] Route compilation
- [ ] Route matching
- [ ] Path generation
- [ ] Redirect logic
- [ ] Guard execution
- [ ] Edge cases (special chars, encoding, etc.)

### Integration Tests

- [ ] Full navigation flow: Click → Action → Reducer → URL update
- [ ] Browser history: Back → URL change → Action → State update
- [ ] Deep linking: Load URL → Parse → Initialize state
- [ ] Query param sync: State change → URL update → Browser back → State restore

### Browser Tests (Playwright)

**Real browser testing for critical flows**:

- [ ] User types in search → URL updates (debounced)
- [ ] User clicks pagination → URL updates → History entry created
- [ ] User changes tab → URL updates → No history entry
- [ ] Browser back button → State restores correctly
- [ ] Deep link with query params → App loads correctly
- [ ] 404 URL → Shows 404 UI
- [ ] Protected route → Redirects to login

### Performance Tests

- [ ] Benchmark route matching with varying route counts (10, 100, 1000)
- [ ] Benchmark path generation
- [ ] Memory profiling with realistic route trees

---

## Documentation Plan

### User Guides

- [ ] **Getting Started with Routing** (beginner)
  - Basic route setup
  - Parsing and serialization
  - Browser history integration

- [ ] **Query Parameters Guide** (intermediate)
  - Adding query params
  - State management patterns
  - History management rules

- [ ] **Advanced Routing** (advanced)
  - Route guards
  - Redirects
  - 404 handling
  - Type-safe router API

### API Reference

- [ ] `parseQueryParams()` - Full API docs with examples
- [ ] `serializeQueryParams()` - Full API docs
- [ ] `createRouter()` - Full API docs
- [ ] Schema types - All schema primitives documented
- [ ] Route configuration - All options explained

### Examples & Recipes

- [ ] **Pagination Example**
  - Complete implementation
  - Shows pushState usage
  - Demonstrates state sync

- [ ] **Search Example**
  - Search-as-you-type
  - Debouncing
  - replaceState usage

- [ ] **Tabs Example**
  - Tab navigation
  - replaceState (no history)
  - Query param sync

- [ ] **Protected Routes Example**
  - Auth guard
  - Redirect to login
  - Preserve intended destination

- [ ] **404 Handling Example**
  - Catch-all route
  - Custom 404 UI
  - Logging 404s

---

## Decision Log

### 2025-11-02: Reactivity Solution ✅
**Decision**: Use Svelte store contract (`$store` syntax) instead of manual subscriptions.

**Rationale**:
- Svelte 5 stores work seamlessly with runes
- `$store` syntax provides automatic subscription management
- Backwards compatible with Svelte 4 patterns
- Clean, simple developer experience

**Impact**: Users can write `$derived($store.items)` instead of manual `$effect` + `subscribe()`.

---

### 2025-11-02: Query Parameter Schema Validation ✅
**Decision**: Start with simple custom schemas, add Zod integration later.

**Rationale**:
- Keep dependencies minimal initially
- Most apps have simple query param needs (string, number, enum)
- Zod can be added as optional peer dependency
- Custom schemas are easier to understand/maintain

**Future**: Add `@composable-svelte/routing-zod` package for advanced validation.

---

### 2025-11-02: Query Param State Management Pattern ✅
**Decision**: Hybrid approach - list-level params in top-level state, destination params in destination state.

**Rationale**:
- Clear separation of concerns
- List filters/search/pagination are app-level concerns
- Modal/overlay-specific params belong to destination
- Easy to understand and maintain

**Example**:
```typescript
interface AppState {
  searchQuery: string;  // Top-level (list concern)
  page: number;         // Top-level (list concern)
  destination: {
    type: 'item';
    activeTab: string;  // Destination-level (modal concern)
  } | null;
}
```

---

### 2025-11-02: History Management Rules ✅
**Decision**: Define clear rules for pushState vs replaceState.

**Rules**:
| Action | Method | Rationale |
|--------|--------|-----------|
| Open modal | `pushState` | Can go back |
| Close modal | `pushState` | Can go forward |
| Change tabs | `replaceState` | Don't pollute |
| Type search | `replaceState` | Debounced |
| Change page | `pushState` | Can go back |
| Apply filter | `pushState` | Can undo |
| Change sort | `replaceState` | Usually paired |

---

### 2025-11-02: Phase 4 Status Change (Deferred → Ready) ✅
**Discovery**: `ifLet` already supports recursive composition - no library changes needed!

**Previous Understanding** (INCORRECT):
> "Current `ifLet` operator handles one level of nesting. Arbitrary depth requires redesigning reducer composition."

**Corrected Understanding**:
> "`ifLet` is a function that operates on `ParentState → ChildState | null`. Since child state can itself contain a `destination` field, composition is naturally recursive through standard function composition."

**Evidence**: Test at `packages/core/tests/navigation/operators.test.ts:659-688` demonstrates 3-level deep path matching working correctly.

**Impact**:
- Phase 4 complexity reduced by ~70%
- State composition: ✅ Already works (no code needed)
- Reducer composition: ✅ Already works (no code needed)
- **Only need**: URL parsing/serialization for nested paths
- Can implement in v1.0 or v1.1 (medium priority)

**Recommendation**: Keep as Phase 4 but mark as "READY" instead of "DEFERRED"

---

### 2025-11-02: Type Inference Strategy ✅
**Decision**: Manual param types for v1.0, full inference as future enhancement.

**Rationale**:
- Full type inference from config is complex
- Manual types are explicit and clear
- Can add inference later without breaking changes
- Autocomplete works either way

**Example**:
```typescript
// v1.0: Manual types
interface RouteParams {
  'item': { id: string };
}

const router = createRouter<RouteParams>(config);

// Future: Inferred types
const router = createRouter(config);  // Infers RouteParams
```

---

## Migration Strategy

### Backwards Compatibility Guarantee

**Promise**: Existing Phase 7 code will continue to work without changes.

**How**:
- Query params are opt-in (add to destination types when ready)
- Advanced patterns are additive
- Simple parsers/serializers still work
- No breaking API changes

### Migration Paths

#### Path 1: Add Query Params
```typescript
// Before: Simple routing
type Destination = { type: 'list' } | { type: 'item'; id: string };

// After: Add query params
type Destination =
  | { type: 'list'; query?: { search?: string; page?: number } }
  | { type: 'item'; id: string; query?: { tab?: string } };

// Update parser to handle query
function parse(path: string, query: any): Destination {
  if (path === '/inventory') {
    return { type: 'list', query };  // ← Pass query through
  }
  // ...
}

// Update serializer to include query
function serialize(dest: Destination): { path: string; query?: any } {
  switch (dest.type) {
    case 'list':
      return { path: '/inventory', query: dest.query };  // ← Include query
  }
}
```

#### Path 2: Adopt Type-Safe Router
```typescript
// Before: Manual parsing
function parse(path: string) {
  if (path.startsWith('/item/')) {
    return { type: 'item', id: path.split('/')[2] };
  }
}

// After: Use router
const router = createRouter({
  item: { pattern: '/item/:id' }
});

function parse(path: string) {
  const match = router.match(path);
  if (match?.route === 'item') {
    return { type: 'item', id: match.params.id };
  }
}
```

#### Path 3: Add Guards
```typescript
// Before: Parse all URLs
function parse(path: string) {
  if (path.startsWith('/admin')) {
    return { type: 'admin' };
  }
}

// After: Add guard
const router = createRouter({
  admin: {
    pattern: '/admin',
    guard: {
      canActivate: () => user.isAdmin || { redirect: '/login' }
    }
  }
});
```

### Deprecation Policy

**v1.0 Promise**: No deprecations in Phase 7 v1.0.

**Future Deprecations** (if any):
- 6 month warning period
- Clear migration guide
- Automated codemod if possible
- Simple API always supported

---

## Next Actions

### Week 1: Query Params Foundation
1. [ ] Create `query-params.ts` with parse/serialize
2. [ ] Create `schemas.ts` with basic schemas
3. [ ] Write comprehensive unit tests
4. [ ] Update types to include query field

### Week 2: Integration
1. [ ] Update sync effect to handle query params
2. [ ] Update browser history sync
3. [ ] Update deep link parser
4. [ ] Write integration tests

### Week 3: Examples & Documentation
1. [ ] Add search to example app
2. [ ] Add pagination to example app
3. [ ] Add tab navigation
4. [ ] Write query params guide

### Week 4: Polish & Phase 2 Prep
1. [ ] Address feedback
2. [ ] Performance testing
3. [ ] Documentation review
4. [ ] Begin Phase 2 design

---

## Resources

- [path-to-regexp](https://github.com/pillarjs/path-to-regexp) - Pattern matching library
- [TCA Navigation](https://github.com/pointfreeco/swift-composable-architecture/tree/main/Sources/ComposableArchitecture/Navigation) - Inspiration
- [React Router](https://reactrouter.com/) - Reference implementation
- [SvelteKit Routing](https://kit.svelte.dev/docs/routing) - Svelte patterns
- [URLPattern API](https://developer.mozilla.org/en-US/docs/Web/API/URLPattern) - Future standard
- [URL Living Standard](https://url.spec.whatwg.org/) - URL specification
- [RFC 3986](https://www.rfc-editor.org/rfc/rfc3986) - URI specification

---

## Plan Quality: 9/10 ✅

**Improvements Made**:
1. ✅ Added Phase 2.5 (Guards, Redirects, 404s)
2. ✅ Added state management pattern decisions
3. ✅ Added history management rules table
4. ✅ Added complete examples showing full flow
5. ✅ Added performance targets with specific numbers
6. ✅ **Corrected Phase 4 understanding** - `ifLet` already supports recursion! (2025-11-02)
7. ✅ Added route conflict detection
8. ✅ Expanded testing strategy
9. ✅ Added concrete decision log entries
10. ✅ Comprehensive documentation plan

**Remaining Gaps** (for 10/10):
- Live validation in production apps
- Community feedback integration
- Real-world performance data

**Ready to implement**: Phase 1 is fully specified and ready to go! 🚀
