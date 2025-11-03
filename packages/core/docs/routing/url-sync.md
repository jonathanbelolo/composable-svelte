# URL Routing and Browser History Integration

Comprehensive guide to URL synchronization, browser history integration, and deep linking in Composable Svelte applications.

## Table of Contents

1. [Overview](#overview)
2. [Browser History Integration](#browser-history-integration)
3. [URL Synchronization Patterns](#url-synchronization-patterns)
4. [Pattern Matching with path-to-regexp](#pattern-matching-with-path-to-regexp)
5. [Query Parameters](#query-parameters)
6. [Deep Linking](#deep-linking)
7. [Back/Forward Navigation](#backforward-navigation)
8. [createURLSyncEffect and Utilities](#createurlsynceffect-and-utilities)
9. [Integration with Navigation State](#integration-with-navigation-state)
10. [Testing URL Routing](#testing-url-routing)
11. [Best Practices](#best-practices)
12. [Common Pitfalls](#common-pitfalls)

## Overview

The routing system provides **bidirectional synchronization** between application state and browser URLs. It's designed to work seamlessly with Composable Svelte's state-driven navigation, enabling:

- **State → URL**: Automatic URL updates when state changes
- **URL → State**: Browser back/forward buttons update application state
- **Deep Linking**: Share URLs that restore full application state
- **Query Parameters**: Type-safe query string parsing and validation
- **Pattern Matching**: Robust URL pattern matching with path-to-regexp

### Key Principles

1. **State is Source of Truth**: URLs reflect state, not the other way around
2. **Type-Safe**: Full TypeScript support for routes and parameters
3. **Declarative**: Define routes once, use everywhere
4. **Framework-Agnostic**: Core routing logic works without Svelte
5. **Testable**: Pure functions for serialization and parsing

### Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                  User Actions                       │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
         ┌────────────────┐
         │    Reducer     │ (Pure function)
         └────────┬───────┘
                  │
                  ▼
         ┌────────────────┐
         │  State Update  │
         └────────┬───────┘
                  │
     ┌────────────┴────────────┐
     │                         │
     ▼                         ▼
┌─────────────┐       ┌────────────────┐
│ URL Sync    │       │ Browser History│
│ Effect      │       │ Listener       │
└──────┬──────┘       └────────┬───────┘
       │                       │
       ▼                       ▼
  pushState()              popstate event
  replaceState()                │
       │                        │
       └──────────┬─────────────┘
                  │
                  ▼
            ┌──────────┐
            │    URL   │
            └──────────┘
```

## Browser History Integration

Browser history integration enables users to navigate your app using browser back/forward buttons, bookmarks, and direct URLs.

### Core API: `syncBrowserHistory()`

The primary function for bidirectional URL synchronization:

```typescript
function syncBrowserHistory<State, Action, Dest>(
  store: Store<State, Action>,
  config: BrowserHistoryConfig<State, Action, Dest>
): () => void
```

**Configuration Interface:**

```typescript
interface BrowserHistoryConfig<State, Action, Dest> {
  // Parse URL path to destination state
  parse: (path: string) => Dest | null;

  // Serialize state to URL path
  serialize: (state: State) => string;

  // Optional: Parse query parameters
  parseQuery?: (search: string) => any;

  // Optional: Serialize query parameters
  serializeQuery?: (state: State) => string;

  // Convert destination to action
  destinationToAction: (destination: Dest | null, query?: any) => Action | null;
}
```

### Complete Setup Example

```typescript
// store.ts
import { createStore } from '@composable-svelte/core';
import {
  syncBrowserHistory,
  serializeDestination,
  parseDestination,
  matchPath
} from '@composable-svelte/core/routing';

// 1. Define your state
interface AppState {
  destination: AppDestination | null;
  items: Item[];
  filters: FilterState;
}

type AppDestination =
  | { type: 'detail'; state: { itemId: string } }
  | { type: 'edit'; state: { itemId: string } }
  | { type: 'add'; state: {} };

type AppAction =
  | { type: 'itemSelected'; itemId: string }
  | { type: 'editTapped'; itemId: string }
  | { type: 'addTapped' }
  | { type: 'closeDestination' };

// 2. Configure serialization
const serializerConfig = {
  basePath: '/inventory',
  serializers: {
    detail: (state) => `/inventory/item-${state.itemId}`,
    edit: (state) => `/inventory/item-${state.itemId}/edit`,
    add: () => '/inventory/add'
  }
};

// 3. Configure parsing
const parserConfig = {
  basePath: '/inventory',
  parsers: [
    // Order matters! Most specific patterns first
    (path) => {
      const params = matchPath('/item-:itemId/edit', path);
      return params ? { type: 'edit', state: { itemId: params.itemId } } : null;
    },
    (path) => {
      const params = matchPath('/item-:itemId', path);
      return params ? { type: 'detail', state: { itemId: params.itemId } } : null;
    },
    (path) => path === '/add' ? { type: 'add', state: {} } : null
  ]
};

// 4. Create store
const store = createStore({
  initialState,
  reducer: appReducer,
  dependencies: {}
});

// 5. Sync browser history
const cleanup = syncBrowserHistory(store, {
  parse: (path) => parseDestination(path, parserConfig),
  serialize: (state) => serializeDestination(state.destination, serializerConfig),
  destinationToAction: (dest) => {
    if (!dest) return { type: 'closeDestination' };
    switch (dest.type) {
      case 'detail':
        return { type: 'itemSelected', itemId: dest.state.itemId };
      case 'edit':
        return { type: 'editTapped', itemId: dest.state.itemId };
      case 'add':
        return { type: 'addTapped' };
    }
  }
});

// 6. Cleanup on app unmount
onDestroy(() => {
  cleanup();
});
```

### How It Works

1. **State → URL (via Effect)**:
   - Reducer returns `createURLSyncEffect()`
   - Effect compares current URL with expected URL
   - If different, updates browser history with `pushState()` or `replaceState()`

2. **URL → State (via Event Listener)**:
   - `syncBrowserHistory()` registers `popstate` listener
   - User clicks back/forward button
   - Parse URL to destination state
   - Convert destination to action
   - Dispatch action to update state

3. **Loop Prevention**:
   - Effects set `{ composableSvelteSync: true }` metadata
   - `popstate` handler checks timestamp to ignore self-triggered events
   - Prevents infinite loops from circular updates

### Lifecycle

```typescript
// Initial page load
// URL: /inventory/item-123

1. Deep linking: Parse URL → Destination
2. Create initial state with destination
3. Create store with initial state
4. syncBrowserHistory() registers listeners

// User clicks on item
1. Dispatch { type: 'itemSelected', itemId: '456' }
2. Reducer updates state.destination
3. Reducer returns createURLSyncEffect()
4. Effect executes: history.pushState('/inventory/item-456')
5. URL bar updates: /inventory/item-456

// User clicks back button
1. Browser fires 'popstate' event
2. Handler parses URL: /inventory/item-123
3. Handler converts to action: { type: 'itemSelected', itemId: '123' }
4. Dispatch action
5. Reducer updates state.destination
6. Effect executes: URL already correct, no-op
```

## URL Synchronization Patterns

### Pattern 1: Basic Destination Routing

Simple destination-based routing without query parameters.

```typescript
// State: Single destination field
interface State {
  destination: Destination | null;
}

type Destination =
  | { type: 'detail'; state: { id: string } }
  | { type: 'edit'; state: { id: string } };

// Reducer: Update destination + URL sync
const reducer = (state, action, deps) => {
  switch (action.type) {
    case 'itemSelected': {
      const newState = {
        ...state,
        destination: { type: 'detail', state: { id: action.id } }
      };
      return [newState, urlSyncEffect(newState)];
    }

    case 'closeDestination': {
      const newState = { ...state, destination: null };
      return [newState, urlSyncEffect(newState)];
    }
  }
};

// URL Sync Effect
const urlSyncEffect = createURLSyncEffect<State, Action>(
  (state) => serializeDestination(state.destination, config)
);
```

**URLs:**
- `/inventory` → `destination: null`
- `/inventory/item-123` → `destination: { type: 'detail', state: { id: '123' } }`
- `/inventory/item-456/edit` → `destination: { type: 'edit', state: { id: '456' } }`

### Pattern 2: Query Parameters

Routing with URL query parameters for filters, search, pagination.

```typescript
// State: Destination + query-like fields
interface State {
  destination: Destination | null;
  searchQuery: string;
  page: number;
  sortBy: 'name' | 'date';
}

// Serialize query parameters
const serializeQuery = (state: State): string => {
  const params: Record<string, any> = {};
  if (state.searchQuery) params.search = state.searchQuery;
  if (state.page > 1) params.page = state.page;
  if (state.sortBy !== 'name') params.sortBy = state.sortBy;
  return serializeQueryParams(params);
};

// URL Sync Effect with query params
const urlSyncEffect = createURLSyncEffect<State, Action>(
  (state) => serializeDestination(state.destination, config),
  { serializeQuery }
);

// Browser history with query parsing
syncBrowserHistory(store, {
  parse: (path) => parseDestination(path, parserConfig),
  serialize: (state) => serializeDestination(state.destination, serializerConfig),
  parseQuery: (search) => parseQueryParams(search),
  serializeQuery,
  destinationToAction: (dest, query) => {
    // Handle destination change
    if (dest?.type === 'detail') {
      return { type: 'itemSelected', itemId: dest.state.itemId };
    }
    // Handle query param changes
    if (query?.search) {
      return { type: 'searchChanged', query: query.search };
    }
    return null;
  }
});
```

**URLs:**
- `/inventory?search=laptop&page=2`
- `/inventory/item-123?tab=details`
- `/inventory/add?prefill=electronics`

### Pattern 3: Replace State (No History Entry)

Use `replaceState` instead of `pushState` for intermediate states.

```typescript
// Use case: Search-as-you-type
case 'searchQueryChanged': {
  const newState = { ...state, searchQuery: action.query };
  return [
    newState,
    // Replace URL instead of pushing new history entry
    createURLSyncEffect(serialize, { replace: true })(newState)
  ];
}
```

**When to use `replace: true`:**
- Search-as-you-type
- Filter changes
- Pagination within same view
- Tab switching
- Any high-frequency state changes

**When to use `replace: false` (default):**
- Navigation to new screens
- Opening modals/sheets
- Creating/editing resources
- Major state transitions

### Pattern 4: Debounced URL Updates

Prevent URL thrashing during rapid state changes.

```typescript
// High-frequency updates (e.g., slider, search input)
const urlSyncEffect = createURLSyncEffect<State, Action>(
  (state) => serializeDestination(state.destination, config),
  {
    debounceMs: 300, // Wait 300ms after last change
    replace: true    // Don't create history entries
  }
);

// Reducer
case 'sliderValueChanged': {
  const newState = { ...state, sliderValue: action.value };
  return [newState, urlSyncEffect(newState)];
}
```

**Use cases for debouncing:**
- Slider/range inputs
- Search-as-you-type
- Text input filters
- Canvas/drawing apps
- Real-time collaborative editing

### Pattern 5: Multiple Destination Stacks

Navigation stacks with nested destinations (tabs, split views).

```typescript
interface State {
  selectedTab: 'inventory' | 'reports';
  inventoryDestination: InventoryDestination | null;
  reportsDestination: ReportsDestination | null;
}

// Serialize based on active tab
const serialize = (state: State): string => {
  if (state.selectedTab === 'inventory') {
    return serializeDestination(state.inventoryDestination, inventoryConfig);
  } else {
    return serializeDestination(state.reportsDestination, reportsConfig);
  }
};

// Parse based on URL path prefix
const parse = (path: string): ParseResult => {
  if (path.startsWith('/inventory')) {
    return {
      tab: 'inventory',
      destination: parseDestination(path, inventoryConfig)
    };
  } else if (path.startsWith('/reports')) {
    return {
      tab: 'reports',
      destination: parseDestination(path, reportsConfig)
    };
  }
  return null;
};
```

**URL Structure:**
- `/inventory` → Inventory tab, no destination
- `/inventory/item-123` → Inventory tab, detail view
- `/reports` → Reports tab, no destination
- `/reports/monthly` → Reports tab, monthly view

## Pattern Matching with path-to-regexp

Composable Svelte uses [path-to-regexp](https://github.com/pillarjs/path-to-regexp) v8 for robust URL pattern matching.

### Basic Patterns

```typescript
import { matchPath } from '@composable-svelte/core/routing';

// Named parameter
matchPath('/item-:id', '/item-123');
// → { id: '123' }

// Multiple parameters
matchPath('/user/:userId/post/:postId', '/user/42/post/99');
// → { userId: '42', postId: '99' }

// No match returns null
matchPath('/item-:id', '/other/path');
// → null
```

### Pattern Syntax

```typescript
// Simple parameter
'/item-:id'           // Matches: /item-123, /item-abc
                      // Params: { id: '123' }

// Custom parameter pattern
'/item-:id(\\d+)'     // Matches: /item-123 (digits only)
                      // Rejects: /item-abc

// Optional parameter (v1.1 - deferred)
'/item-:id/:action?'  // Matches: /item-123, /item-123/edit
                      // Params: { id: '123', action: undefined | 'edit' }

// Wildcard (v1.1 - deferred)
'/files/*'            // Matches: /files/docs/readme.md
                      // Params: { '0': 'docs/readme.md' }
```

### Parser Implementation

```typescript
import { matchPath } from '@composable-svelte/core/routing';

const parserConfig: ParserConfig<AppDestination> = {
  basePath: '/app',
  parsers: [
    // Parser 1: Edit item (most specific)
    (path) => {
      const params = matchPath('/item-:itemId/edit', path);
      if (!params) return null;
      return {
        type: 'edit',
        state: {
          itemId: params.itemId,
          // Additional validation
          isValid: /^\d+$/.test(params.itemId)
        }
      };
    },

    // Parser 2: View item
    (path) => {
      const params = matchPath('/item-:itemId', path);
      if (!params) return null;
      return {
        type: 'detail',
        state: { itemId: params.itemId }
      };
    },

    // Parser 3: Static route
    (path) => {
      if (path === '/add') {
        return { type: 'add', state: {} };
      }
      return null;
    },

    // Parser 4: Pattern with constraint
    (path) => {
      const params = matchPath('/category-:category(electronics|books|clothing)', path);
      if (!params) return null;
      return {
        type: 'category',
        state: { category: params.category as 'electronics' | 'books' | 'clothing' }
      };
    }
  ]
};
```

### Parser Ordering Rules

**Rule 1: Most specific patterns first**

```typescript
// ✅ CORRECT ORDER
[
  '/item-:id/edit',      // Most specific
  '/item-:id',           // Less specific
  '/item-:id/:action',   // Generic
  '/:category'           // Least specific
]

// ❌ WRONG ORDER
[
  '/:category',          // Matches everything!
  '/item-:id',           // Never reached
]
```

**Rule 2: Static before dynamic**

```typescript
// ✅ CORRECT
[
  '/add',                // Static route
  '/item-:id'            // Dynamic route
]

// ❌ WRONG (but works due to specificity)
[
  '/item-:id',           // Would match '/add' as id='add'
  '/add'                 // Never reached
]
```

**Rule 3: Constrained before unconstrained**

```typescript
// ✅ CORRECT
[
  '/item-:id(\\d+)',     // Constrained (digits only)
  '/item-:id'            // Unconstrained (any string)
]
```

### Type-Safe Parameter Extraction

```typescript
// Extract and validate parameters
const parser = (path: string): Destination | null => {
  const params = matchPath('/user-:userId/post-:postId', path);
  if (!params) return null;

  // Validate parameter format
  const userId = parseInt(params.userId, 10);
  const postId = parseInt(params.postId, 10);

  if (isNaN(userId) || isNaN(postId)) {
    console.warn(`Invalid numeric IDs: userId=${params.userId}, postId=${params.postId}`);
    return null;
  }

  return {
    type: 'viewPost',
    state: { userId, postId }
  };
};
```

### Advanced Patterns

```typescript
// UUID pattern
const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
matchPath(`/item-:id(${UUID_PATTERN})`, '/item-123e4567-e89b-12d3-a456-426614174000');

// Date pattern (YYYY-MM-DD)
matchPath('/reports/:date(\\d{4}-\\d{2}-\\d{2})', '/reports/2025-11-03');

// Enum values
matchPath('/sort-:direction(asc|desc)', '/sort-asc');

// Multiple segments
matchPath('/files/:segments+', '/files/docs/guides/intro.md');
// → { segments: ['docs', 'guides', 'intro.md'] } (v1.1 feature - deferred)
```

## Query Parameters

Type-safe query parameter parsing, serialization, and validation.

### Basic Usage

```typescript
import {
  parseQueryParams,
  serializeQueryParams
} from '@composable-svelte/core/routing';

// Parse query string
const params = parseQueryParams('?search=laptop&page=2&tag=electronics&tag=sale');
// → {
//     search: 'laptop',
//     page: '2',
//     tag: ['electronics', 'sale']
//   }

// Serialize to query string
const query = serializeQueryParams({
  search: 'laptop',
  page: 2,
  tag: ['electronics', 'sale']
});
// → 'search=laptop&page=2&tag=electronics&tag=sale'
```

### Schema-Based Validation

```typescript
import {
  parseQueryParamsWithSchema,
  string,
  number,
  optional,
  enumSchema,
  array
} from '@composable-svelte/core/routing';

// Define schema
const querySchema = {
  search: optional(string({ minLength: 1, maxLength: 100 })),
  page: optional(number({ min: 1, integer: true })),
  perPage: optional(number({ min: 10, max: 100, integer: true })),
  sortBy: optional(enumSchema(['name', 'date', 'price'] as const)),
  tags: optional(array(string()))
};

// Parse with validation
try {
  const params = parseQueryParamsWithSchema('?search=laptop&page=2&sortBy=price', querySchema);
  // → {
  //     search: 'laptop',      // string
  //     page: 2,               // number (coerced)
  //     perPage: undefined,    // optional (missing)
  //     sortBy: 'price',       // enum (validated)
  //     tags: undefined        // optional (missing)
  //   }
} catch (error) {
  // Validation failed
  console.error('Invalid query params:', error.message);
}
```

### Schema Types

```typescript
import {
  string,
  number,
  boolean,
  array,
  optional,
  enumSchema,
  object,
  literal
} from '@composable-svelte/core/routing';

// String with constraints
string({ minLength: 1, maxLength: 50 });
string({ pattern: /^[a-z0-9-]+$/i });
string({ enum: ['asc', 'desc'] });
string({ default: 'default-value' });

// Number with constraints
number({ min: 1, max: 100 });
number({ integer: true });
number({ default: 1 });

// Boolean
boolean(); // Accepts: true, false, 1, 0, yes, no, on, off
boolean({ default: false });

// Array
array(string());
array(number({ min: 0 }), { minLength: 1, maxLength: 10 });

// Optional
optional(number({ min: 1 }));

// Enum
enumSchema(['asc', 'desc'] as const);
enumSchema(['asc', 'desc'] as const, { default: 'asc' });

// Object
object({
  search: optional(string()),
  page: optional(number({ min: 1 }))
});

// Literal
literal('active'); // Must be exactly 'active'
literal(42);       // Must be exactly 42
```

### Integration with State

```typescript
// State includes query-like fields
interface State {
  destination: Destination | null;
  // Query parameters as state fields
  searchQuery: string;
  currentPage: number;
  selectedTags: string[];
  sortOrder: 'asc' | 'desc';
}

// Serialize state to query string
const serializeQuery = (state: State): string => {
  return serializeQueryParams({
    search: state.searchQuery || undefined,
    page: state.currentPage > 1 ? state.currentPage : undefined,
    tags: state.selectedTags.length > 0 ? state.selectedTags : undefined,
    sort: state.sortOrder !== 'asc' ? state.sortOrder : undefined
  });
};

// Parse query string to state updates
const parseQuery = (search: string) => {
  const schema = {
    search: optional(string()),
    page: optional(number({ min: 1, default: 1 })),
    tags: optional(array(string())),
    sort: optional(enumSchema(['asc', 'desc'] as const, { default: 'asc' }))
  };
  return parseQueryParamsWithSchema(search, schema);
};

// Reducer handles query param changes
case 'browserNavigated': {
  const query = parseQuery(window.location.search);
  return [
    {
      ...state,
      searchQuery: query.search || '',
      currentPage: query.page || 1,
      selectedTags: query.tags || [],
      sortOrder: query.sort || 'asc'
    },
    Effect.none()
  ];
}
```

### Helper Functions

```typescript
import {
  getQueryParam,
  getQueryParamAll,
  hasQueryParam,
  mergeQueryParams
} from '@composable-svelte/core/routing';

const params = parseQueryParams('?search=laptop&tag=a&tag=b');

// Get single value
getQueryParam(params, 'search');
// → 'laptop'

getQueryParam(params, 'tag');
// → 'a' (first element of array)

getQueryParam(params, 'missing', 'default');
// → 'default'

// Get all values as array
getQueryParamAll(params, 'tag');
// → ['a', 'b']

getQueryParamAll(params, 'search');
// → ['laptop'] (normalized to array)

// Check existence
hasQueryParam(params, 'search');
// → true

hasQueryParam(params, 'missing');
// → false

// Merge parameters
const updated = mergeQueryParams(params, {
  search: 'phone',    // Update
  tag: undefined,     // Remove
  page: '2'           // Add
});
// → { search: 'phone', page: '2' }
```

## Deep Linking

Enable users to share URLs that restore full application state.

### Basic Setup

```typescript
import { createInitialStateFromURL } from '@composable-svelte/core/routing';

// Default state (when URL is root or invalid)
const defaultState: AppState = {
  destination: null,
  items: [],
  searchQuery: '',
  page: 1
};

// Create initial state from URL
const initialState = createInitialStateFromURL(
  defaultState,
  // Parse URL to destination
  (path) => parseDestination(path, parserConfig),
  // Set destination in state
  (state, destination) => ({ ...state, destination })
);

// Create store with URL-derived initial state
const store = createStore({
  initialState, // Uses URL if present, falls back to defaultState
  reducer: appReducer,
  dependencies: {}
});
```

### With Query Parameters

```typescript
const initialState = createInitialStateFromURL(
  defaultState,
  // Parse path to destination
  (path) => parseDestination(path, parserConfig),
  // Set destination in state
  (state, destination) => ({ ...state, destination }),
  // Parse query parameters
  (search) => parseQueryParams(search),
  // Set query params in state
  (state, query) => ({
    ...state,
    searchQuery: query.search || '',
    page: query.page ? parseInt(query.page) : 1,
    sortOrder: query.sort === 'desc' ? 'desc' : 'asc'
  })
);
```

### Complete Deep Linking Flow

```typescript
// 1. User visits URL: /inventory/item-123?tab=details

// 2. Parse URL on app initialization
const initialState = createInitialStateFromURL(
  {
    destination: null,
    selectedTab: 'overview',
    items: []
  },
  // Parse path
  (path) => {
    const params = matchPath('/item-:itemId', path);
    return params ? { type: 'detail', state: { itemId: params.itemId } } : null;
  },
  // Set destination
  (state, dest) => ({ ...state, destination: dest }),
  // Parse query
  (search) => parseQueryParams(search),
  // Set query in state
  (state, query) => ({ ...state, selectedTab: query.tab || 'overview' })
);

// 3. Initial state now includes deep-linked data
// {
//   destination: { type: 'detail', state: { itemId: '123' } },
//   selectedTab: 'details',
//   items: []
// }

// 4. Create store with this initial state
const store = createStore({
  initialState,
  reducer,
  dependencies: {}
});

// 5. App renders with modal/sheet open showing item 123, details tab
```

### Loading State from URL

```typescript
// Handle async data loading after deep link
const initialState = createInitialStateFromURL(
  defaultState,
  parseDestination,
  (state, destination) => {
    if (!destination) return state;

    // Set loading state
    return {
      ...state,
      destination,
      isLoading: true // Will trigger data fetch
    };
  }
);

// Reducer handles loading
case 'storeInitialized': {
  // Triggered on mount
  if (!state.destination) {
    return [state, Effect.none()];
  }

  // Destination exists - fetch data
  if (state.destination.type === 'detail') {
    return [
      state,
      Effect.run(async (dispatch) => {
        const item = await deps.api.fetchItem(state.destination.state.itemId);
        dispatch({ type: 'itemLoaded', item });
      })
    ];
  }

  return [state, Effect.none()];
}
```

### Validation and Error Handling

```typescript
const initialState = createInitialStateFromURL(
  defaultState,
  // Parse with validation
  (path) => {
    const params = matchPath('/item-:itemId', path);
    if (!params) return null;

    // Validate ID format
    if (!/^\d+$/.test(params.itemId)) {
      console.warn(`Invalid item ID in URL: ${params.itemId}`);
      return null; // Fallback to defaultState
    }

    return { type: 'detail', state: { itemId: params.itemId } };
  },
  (state, destination) => ({ ...state, destination })
);
```

## Back/Forward Navigation

Handle browser back/forward buttons gracefully.

### Automatic Handling

`syncBrowserHistory()` automatically handles back/forward navigation:

```typescript
const cleanup = syncBrowserHistory(store, {
  parse: (path) => parseDestination(path, parserConfig),
  serialize: (state) => serializeDestination(state.destination, serializerConfig),
  destinationToAction: (dest) => {
    // Convert destination to action
    if (!dest) return { type: 'closeDestination' };
    // ... map destinations to actions
  }
});

// User clicks back button
// ↓
// popstate event fires
// ↓
// Parse current URL to destination
// ↓
// Convert destination to action
// ↓
// Dispatch action to store
// ↓
// Reducer updates state
// ↓
// URL sync effect (no-op, URL already correct)
```

### Custom Back Button Handling

```typescript
// Implement custom back button in UI
function BackButton() {
  const handleBack = () => {
    // Option 1: Use browser history
    window.history.back();
    // Browser handles the rest via popstate

    // Option 2: Dispatch action directly
    store.dispatch({ type: 'closeDestination' });
    // URL sync effect updates URL
  };

  return <button onclick={handleBack}>← Back</button>;
}
```

### Prevent Navigation

```typescript
// Block navigation with confirmation dialog
let unblock: (() => void) | null = null;

case 'editStarted': {
  // Setup navigation guard
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (state.hasUnsavedChanges) {
      e.preventDefault();
      e.returnValue = ''; // Show browser confirmation
    }
  };

  window.addEventListener('beforeunload', handleBeforeUnload);
  unblock = () => window.removeEventListener('beforeunload', handleBeforeUnload);

  return [
    { ...state, isEditing: true },
    Effect.none()
  ];
}

case 'editCompleted':
case 'editCancelled': {
  // Remove navigation guard
  if (unblock) {
    unblock();
    unblock = null;
  }
  return [
    { ...state, isEditing: false, hasUnsavedChanges: false },
    Effect.none()
  ];
}
```

### History Stack Management

```typescript
// Clear history and replace with new entry
case 'resetNavigation': {
  const newState = { ...state, destination: null };
  return [
    newState,
    Effect.batch(
      // Clear forward history by replacing
      createURLSyncEffect(serialize, { replace: true })(newState),
      // Navigate to home
      Effect.fireAndForget(() => {
        history.pushState(null, '', '/');
      })
    )
  ];
}

// Skip intermediate history entries
case 'skipIntermediateState': {
  // Use replaceState for intermediate steps
  const newState = { ...state, step: state.step + 1 };
  return [
    newState,
    createURLSyncEffect(serialize, { replace: true })(newState)
  ];
}
```

## createURLSyncEffect and Utilities

Detailed API reference for URL synchronization utilities.

### `createURLSyncEffect()`

Create an effect that syncs state to URL.

```typescript
function createURLSyncEffect<State, Action>(
  serialize: (state: State) => string,
  options?: URLSyncOptions
): (state: State) => Effect<Action>
```

**Parameters:**

```typescript
interface URLSyncOptions {
  // Use replaceState instead of pushState
  replace?: boolean;

  // Debounce URL updates (milliseconds)
  debounceMs?: number;

  // Serialize query parameters
  serializeQuery?: <State>(state: State) => string;
}
```

**Returns:** Effect creator function that takes state and returns Effect.

**Example:**

```typescript
// Basic usage
const urlSync = createURLSyncEffect<AppState, AppAction>(
  (state) => serializeDestination(state.destination, config)
);

const reducer = (state, action, deps) => {
  const [newState, coreEffect] = coreReducer(state, action, deps);
  return [newState, Effect.batch(coreEffect, urlSync(newState))];
};

// With options
const urlSync = createURLSyncEffect<AppState, AppAction>(
  (state) => serializeDestination(state.destination, config),
  {
    replace: true,      // No history entry
    debounceMs: 300,    // Wait 300ms after last change
    serializeQuery: (state) => serializeQueryParams({
      search: state.searchQuery
    })
  }
);
```

### `serializeDestination()`

Serialize destination state to URL path.

```typescript
function serializeDestination<Dest extends { type: string; state: any }>(
  destination: Dest | null,
  config: SerializerConfig<Dest>
): string
```

**Example:**

```typescript
const config: SerializerConfig<AppDestination> = {
  basePath: '/app',
  serializers: {
    detail: (state) => `/app/item-${state.itemId}`,
    edit: (state) => `/app/item-${state.itemId}/edit`,
    add: () => '/app/add'
  }
};

serializeDestination(null, config);
// → '/app'

serializeDestination({ type: 'detail', state: { itemId: '123' } }, config);
// → '/app/item-123'

serializeDestination({ type: 'add', state: {} }, config);
// → '/app/add'
```

### `parseDestination()`

Parse URL path to destination state.

```typescript
function parseDestination<Dest extends { type: string; state: any }>(
  path: string,
  config: ParserConfig<Dest>
): Dest | null
```

**Example:**

```typescript
const config: ParserConfig<AppDestination> = {
  basePath: '/app',
  parsers: [
    (path) => {
      const params = matchPath('/item-:itemId/edit', path);
      return params ? { type: 'edit', state: { itemId: params.itemId } } : null;
    },
    (path) => {
      const params = matchPath('/item-:itemId', path);
      return params ? { type: 'detail', state: { itemId: params.itemId } } : null;
    },
    (path) => path === '/add' ? { type: 'add', state: {} } : null
  ]
};

parseDestination('/app', config);
// → null

parseDestination('/app/item-123', config);
// → { type: 'detail', state: { itemId: '123' } }

parseDestination('/app/item-456/edit', config);
// → { type: 'edit', state: { itemId: '456' } }

parseDestination('/invalid', config);
// → null
```

### `matchPath()`

Match URL path against pattern.

```typescript
function matchPath(
  pattern: string,
  path: string
): Record<string, string> | null
```

**Example:**

```typescript
matchPath('/item-:id', '/item-123');
// → { id: '123' }

matchPath('/user/:userId/post/:postId', '/user/42/post/99');
// → { userId: '42', postId: '99' }

matchPath('/item-:id', '/other/path');
// → null
```

### `pathSegment()`

Helper to concatenate path segments.

```typescript
function pathSegment(base: string, segment: string): string
```

**Example:**

```typescript
pathSegment('/inventory', 'item-123');
// → '/inventory/item-123'

pathSegment('/inventory/', 'item-123');
// → '/inventory/item-123' (trailing slash stripped)

pathSegment('/', 'items');
// → '/items'
```

## Integration with Navigation State

Integrate URL routing with Composable Svelte's navigation system.

### Modal/Sheet with URL Sync

```typescript
// State: Destination for modal
interface AppState {
  destination: AppDestination | null;
  items: Item[];
}

type AppDestination =
  | { type: 'addItem'; state: AddItemState }
  | { type: 'editItem'; state: EditItemState };

// Reducer: Open modal + update URL
case 'addButtonTapped': {
  const newState = {
    ...state,
    destination: { type: 'addItem', state: { name: '', quantity: 0 } }
  };
  return [newState, urlSyncEffect(newState)];
}

// Svelte component
<script>
  import { Modal } from '@composable-svelte/core';
  import { scopeTo } from '@composable-svelte/core/dsl';

  // Scope to addItem destination
  const addItemStore = scopeTo(store)
    .into('destination')
    .case('addItem');
</script>

{#if addItemStore}
  <Modal store={addItemStore}>
    <AddItemForm />
  </Modal>
{/if}

<!-- URL: /inventory/add -->
<!-- User clicks back button -->
<!-- → URL: /inventory -->
<!-- → Modal closes automatically -->
```

### NavigationStack with URL Sync

```typescript
// State: Stack of destinations
interface AppState {
  stack: StackItem[];
}

type StackItem =
  | { type: 'list'; state: {} }
  | { type: 'detail'; state: { itemId: string } }
  | { type: 'edit'; state: { itemId: string } };

// Serialize: Use top of stack
const serialize = (state: AppState): string => {
  const top = state.stack[state.stack.length - 1];
  if (!top || top.type === 'list') {
    return '/inventory';
  }
  if (top.type === 'detail') {
    return `/inventory/item-${top.state.itemId}`;
  }
  if (top.type === 'edit') {
    return `/inventory/item-${top.state.itemId}/edit`;
  }
  return '/inventory';
};

// Parse: Reconstruct stack from URL
const parse = (path: string): StackItem[] => {
  const params = matchPath('/item-:itemId/edit', path);
  if (params) {
    // Edit view: Stack = [list, detail, edit]
    return [
      { type: 'list', state: {} },
      { type: 'detail', state: { itemId: params.itemId } },
      { type: 'edit', state: { itemId: params.itemId } }
    ];
  }

  const detailParams = matchPath('/item-:itemId', path);
  if (detailParams) {
    // Detail view: Stack = [list, detail]
    return [
      { type: 'list', state: {} },
      { type: 'detail', state: { itemId: detailParams.itemId } }
    ];
  }

  // Root: Stack = [list]
  return [{ type: 'list', state: {} }];
};

// Reducer: Push to stack + update URL
case 'itemSelected': {
  const newState = {
    ...state,
    stack: [...state.stack, { type: 'detail', state: { itemId: action.itemId } }]
  };
  return [newState, urlSyncEffect(newState)];
}

// Back button pops stack
case 'backTapped': {
  const newState = {
    ...state,
    stack: state.stack.slice(0, -1)
  };
  return [newState, urlSyncEffect(newState)];
}
```

### Tab Navigation with URL Sync

```typescript
// State: Active tab
interface AppState {
  activeTab: 'inventory' | 'reports' | 'settings';
  inventoryState: InventoryState;
  reportsState: ReportsState;
  settingsState: SettingsState;
}

// Serialize: Include tab in path
const serialize = (state: AppState): string => {
  switch (state.activeTab) {
    case 'inventory':
      return serializeDestination(state.inventoryState.destination, inventoryConfig);
    case 'reports':
      return serializeDestination(state.reportsState.destination, reportsConfig);
    case 'settings':
      return '/settings';
  }
};

// Parse: Determine tab from path
const parse = (path: string): { tab: string; destination: any } => {
  if (path.startsWith('/inventory')) {
    return {
      tab: 'inventory',
      destination: parseDestination(path, inventoryConfig)
    };
  }
  if (path.startsWith('/reports')) {
    return {
      tab: 'reports',
      destination: parseDestination(path, reportsConfig)
    };
  }
  return { tab: 'settings', destination: null };
};

// destinationToAction
destinationToAction: (parsed) => {
  if (parsed.tab !== state.activeTab) {
    return { type: 'tabChanged', tab: parsed.tab };
  }
  // ... handle destination within tab
}
```

## Testing URL Routing

Comprehensive testing strategies for URL routing.

### Unit Tests: Serialization

```typescript
import { describe, it, expect } from 'vitest';
import { serializeDestination } from '@composable-svelte/core/routing';

describe('serializeDestination', () => {
  const config = {
    basePath: '/inventory',
    serializers: {
      detail: (state) => `/inventory/item-${state.itemId}`,
      edit: (state) => `/inventory/item-${state.itemId}/edit`,
      add: () => '/inventory/add'
    }
  };

  it('serializes null to base path', () => {
    expect(serializeDestination(null, config)).toBe('/inventory');
  });

  it('serializes detail destination', () => {
    const dest = { type: 'detail', state: { itemId: '123' } };
    expect(serializeDestination(dest, config)).toBe('/inventory/item-123');
  });

  it('serializes edit destination', () => {
    const dest = { type: 'edit', state: { itemId: '456' } };
    expect(serializeDestination(dest, config)).toBe('/inventory/item-456/edit');
  });

  it('serializes add destination', () => {
    const dest = { type: 'add', state: {} };
    expect(serializeDestination(dest, config)).toBe('/inventory/add');
  });
});
```

### Unit Tests: Parsing

```typescript
import { parseDestination, matchPath } from '@composable-svelte/core/routing';

describe('parseDestination', () => {
  const config = {
    basePath: '/inventory',
    parsers: [
      (path) => {
        const params = matchPath('/item-:itemId/edit', path);
        return params ? { type: 'edit', state: { itemId: params.itemId } } : null;
      },
      (path) => {
        const params = matchPath('/item-:itemId', path);
        return params ? { type: 'detail', state: { itemId: params.itemId } } : null;
      },
      (path) => path === '/add' ? { type: 'add', state: {} } : null
    ]
  };

  it('parses base path as null', () => {
    expect(parseDestination('/inventory', config)).toBeNull();
  });

  it('parses detail destination', () => {
    expect(parseDestination('/inventory/item-123', config)).toEqual({
      type: 'detail',
      state: { itemId: '123' }
    });
  });

  it('parses edit destination', () => {
    expect(parseDestination('/inventory/item-456/edit', config)).toEqual({
      type: 'edit',
      state: { itemId: '456' }
    });
  });

  it('parses add destination', () => {
    expect(parseDestination('/inventory/add', config)).toEqual({
      type: 'add',
      state: {}
    });
  });

  it('returns null for invalid paths', () => {
    expect(parseDestination('/invalid', config)).toBeNull();
  });
});
```

### Unit Tests: Pattern Matching

```typescript
import { matchPath } from '@composable-svelte/core/routing';

describe('matchPath', () => {
  it('matches simple parameter', () => {
    expect(matchPath('/item-:id', '/item-123')).toEqual({ id: '123' });
  });

  it('matches multiple parameters', () => {
    expect(matchPath('/user/:userId/post/:postId', '/user/42/post/99')).toEqual({
      userId: '42',
      postId: '99'
    });
  });

  it('returns null for non-matching path', () => {
    expect(matchPath('/item-:id', '/other/123')).toBeNull();
  });

  it('matches constrained parameter', () => {
    expect(matchPath('/item-:id(\\d+)', '/item-123')).toEqual({ id: '123' });
    expect(matchPath('/item-:id(\\d+)', '/item-abc')).toBeNull();
  });
});
```

### Integration Tests: Browser History

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStore } from '@composable-svelte/core';
import { syncBrowserHistory } from '@composable-svelte/core/routing';

describe('Browser History Integration', () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    history.replaceState(null, '', '/inventory');
  });

  afterEach(() => {
    if (cleanup) cleanup();
  });

  it('updates state when back button clicked', async () => {
    const store = createStore({
      initialState: { destination: null },
      reducer,
      dependencies: {}
    });

    cleanup = syncBrowserHistory(store, config);

    // Navigate to item
    store.dispatch({ type: 'itemSelected', itemId: '123' });
    await waitForURL('/inventory/item-123');

    // Click back button
    history.back();
    await waitForPopState();

    // State should update
    expect(store.state.destination).toBeNull();
    expect(window.location.pathname).toBe('/inventory');
  });

  it('handles forward navigation', async () => {
    const store = createStore({
      initialState: { destination: null },
      reducer,
      dependencies: {}
    });

    cleanup = syncBrowserHistory(store, config);

    // Navigate: / → item-123 → item-456
    store.dispatch({ type: 'itemSelected', itemId: '123' });
    await waitForURL('/inventory/item-123');

    store.dispatch({ type: 'itemSelected', itemId: '456' });
    await waitForURL('/inventory/item-456');

    // Back to item-123
    history.back();
    await waitForPopState();
    expect(window.location.pathname).toBe('/inventory/item-123');

    // Forward to item-456
    history.forward();
    await waitForPopState();
    expect(window.location.pathname).toBe('/inventory/item-456');
  });
});

// Test helpers
function waitForURL(path: string): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (window.location.pathname === path) {
        resolve();
      } else {
        setTimeout(check, 10);
      }
    };
    check();
  });
}

function waitForPopState(): Promise<void> {
  return new Promise((resolve) => {
    window.addEventListener('popstate', () => resolve(), { once: true });
  });
}
```

### Testing Query Parameters

```typescript
import { parseQueryParams, serializeQueryParams } from '@composable-svelte/core/routing';

describe('Query Parameters', () => {
  describe('parseQueryParams', () => {
    it('parses simple query string', () => {
      expect(parseQueryParams('?search=laptop&page=2')).toEqual({
        search: 'laptop',
        page: '2'
      });
    });

    it('parses array values', () => {
      expect(parseQueryParams('?tag=a&tag=b&tag=c')).toEqual({
        tag: ['a', 'b', 'c']
      });
    });

    it('handles URL decoding', () => {
      expect(parseQueryParams('?q=hello%20world')).toEqual({
        q: 'hello world'
      });
    });

    it('handles empty query string', () => {
      expect(parseQueryParams('')).toEqual({});
    });
  });

  describe('serializeQueryParams', () => {
    it('serializes simple object', () => {
      expect(serializeQueryParams({ search: 'laptop', page: 2 })).toBe(
        'search=laptop&page=2'
      );
    });

    it('serializes array values', () => {
      expect(serializeQueryParams({ tag: ['a', 'b', 'c'] })).toBe(
        'tag=a&tag=b&tag=c'
      );
    });

    it('omits undefined and null', () => {
      expect(serializeQueryParams({ a: 'value', b: undefined, c: null })).toBe(
        'a=value'
      );
    });

    it('includes empty strings', () => {
      expect(serializeQueryParams({ flag: '' })).toBe('flag=');
    });
  });
});
```

## Best Practices

### 1. Single Source of Truth

State drives URLs, not the other way around.

```typescript
// ✅ CORRECT: State → URL
case 'itemSelected': {
  const newState = {
    ...state,
    destination: { type: 'detail', state: { itemId: action.itemId } }
  };
  return [newState, urlSyncEffect(newState)];
}

// ❌ WRONG: Manually updating URL
case 'itemSelected': {
  history.pushState(null, '', `/item-${action.itemId}`); // Don't do this!
  return [
    { ...state, destination: { type: 'detail', state: { itemId: action.itemId } } },
    Effect.none()
  ];
}
```

### 2. Parser Ordering

Always order parsers from most specific to least specific.

```typescript
// ✅ CORRECT
const parsers = [
  matchPattern('/item-:id/edit'),       // Most specific
  matchPattern('/item-:id'),            // Less specific
  matchPattern('/:category'),           // Least specific
];

// ❌ WRONG
const parsers = [
  matchPattern('/:category'),           // Matches everything!
  matchPattern('/item-:id'),            // Never reached
];
```

### 3. Validate Parameters

Always validate URL parameters in parsers.

```typescript
// ✅ CORRECT: Validate before returning
const parser = (path) => {
  const params = matchPath('/item-:id', path);
  if (!params) return null;

  // Validate ID format
  if (!/^\d+$/.test(params.id)) {
    console.warn(`Invalid item ID: ${params.id}`);
    return null;
  }

  return { type: 'detail', state: { itemId: params.id } };
};

// ❌ WRONG: No validation
const parser = (path) => {
  const params = matchPath('/item-:id', path);
  return params ? { type: 'detail', state: { itemId: params.id } } : null;
};
```

### 4. Use Replace for Intermediate States

Don't create history entries for ephemeral states.

```typescript
// ✅ CORRECT: Replace for search-as-you-type
case 'searchQueryChanged': {
  const newState = { ...state, searchQuery: action.query };
  return [
    newState,
    createURLSyncEffect(serialize, { replace: true })(newState)
  ];
}

// ✅ CORRECT: Push for navigation
case 'itemSelected': {
  const newState = {
    ...state,
    destination: { type: 'detail', state: { itemId: action.itemId } }
  };
  return [
    newState,
    createURLSyncEffect(serialize)(newState) // Default: push
  ];
}
```

### 5. Debounce High-Frequency Updates

Use debouncing for rapid state changes.

```typescript
// ✅ CORRECT: Debounce slider updates
const urlSync = createURLSyncEffect(serialize, {
  debounceMs: 300,
  replace: true
});

case 'sliderMoved': {
  const newState = { ...state, value: action.value };
  return [newState, urlSync(newState)];
}
```

### 6. Deep Link Validation

Validate deep-linked state on initialization.

```typescript
// ✅ CORRECT: Validate and handle errors
const initialState = createInitialStateFromURL(
  defaultState,
  (path) => {
    const dest = parseDestination(path, config);
    if (!dest) return null;

    // Validate destination makes sense
    if (dest.type === 'edit' && !canEdit(dest.state.itemId)) {
      console.warn('User cannot edit this item');
      return null; // Fallback to defaultState
    }

    return dest;
  },
  (state, dest) => ({ ...state, destination: dest })
);
```

### 7. Test URL Flows

Write integration tests for URL synchronization.

```typescript
// ✅ CORRECT: Test complete flows
it('syncs state to URL and back', async () => {
  // User action → State update → URL update
  store.dispatch({ type: 'itemSelected', itemId: '123' });
  await waitForURL('/item-123');

  // Back button → URL change → State update
  history.back();
  await waitForPopState();
  expect(store.state.destination).toBeNull();
});
```

### 8. Clean Up Listeners

Always clean up browser history listeners.

```typescript
// ✅ CORRECT: Clean up in onDestroy
const cleanup = syncBrowserHistory(store, config);

onDestroy(() => {
  cleanup();
});
```

## Common Pitfalls

### Pitfall 1: Infinite Loops

**Problem:** URL updates trigger state updates, which trigger URL updates...

**Solution:** Use metadata to detect self-triggered events.

```typescript
// Built into syncBrowserHistory - checks timestamp
if (event.state?.composableSvelteSync && timeSinceLastPush < 50) {
  return; // Ignore self-triggered popstate
}
```

### Pitfall 2: Parser Order

**Problem:** Generic parsers match before specific ones.

```typescript
// ❌ WRONG
const parsers = [
  (path) => matchPath('/:category', path),  // Matches everything!
  (path) => matchPath('/item-:id', path)    // Never reached
];

// ✅ CORRECT
const parsers = [
  (path) => matchPath('/item-:id', path),   // Specific first
  (path) => matchPath('/:category', path)   // Generic last
];
```

### Pitfall 3: Missing Query Parameter Handling

**Problem:** Query params lost during navigation.

```typescript
// ❌ WRONG: Ignores query params
const serialize = (state) => serializeDestination(state.destination, config);
// URL: /inventory?search=laptop
// After navigation: /inventory/item-123 (search param lost!)

// ✅ CORRECT: Preserve query params
const serialize = (state) => {
  const path = serializeDestination(state.destination, config);
  const query = serializeQueryParams({ search: state.searchQuery });
  return query ? `${path}?${query}` : path;
};
// URL: /inventory/item-123?search=laptop
```

### Pitfall 4: Forgetting to Clean Up

**Problem:** Memory leaks from event listeners.

```typescript
// ❌ WRONG: No cleanup
syncBrowserHistory(store, config);

// ✅ CORRECT: Clean up on unmount
const cleanup = syncBrowserHistory(store, config);
onDestroy(() => cleanup());
```

### Pitfall 5: Direct History Manipulation

**Problem:** Bypassing the effect system.

```typescript
// ❌ WRONG: Manually calling pushState
case 'itemSelected': {
  history.pushState(null, '', `/item-${action.itemId}`);
  return [
    { ...state, destination: { type: 'detail', state: { itemId: action.itemId } } },
    Effect.none()
  ];
}

// ✅ CORRECT: Use URL sync effect
case 'itemSelected': {
  const newState = {
    ...state,
    destination: { type: 'detail', state: { itemId: action.itemId } }
  };
  return [newState, urlSyncEffect(newState)];
}
```

### Pitfall 6: Type Coercion Errors

**Problem:** Query params are always strings, but state expects numbers/booleans.

```typescript
// ❌ WRONG: No type coercion
const query = parseQueryParams(window.location.search);
const page = query.page; // '2' (string!)
if (page > 1) { /* This will fail! */ }

// ✅ CORRECT: Parse with schema
const query = parseQueryParamsWithSchema(window.location.search, {
  page: optional(number({ min: 1 }))
});
const page = query.page; // 2 (number!)
if (page && page > 1) { /* Works! */ }
```

### Pitfall 7: Deep Link Data Loading

**Problem:** Deep-linked state refers to data not yet loaded.

```typescript
// ❌ WRONG: Assume data exists
const initialState = createInitialStateFromURL(
  defaultState,
  parseDestination,
  (state, dest) => ({ ...state, destination: dest })
);
// Problem: destination.itemId exists, but items array is empty!

// ✅ CORRECT: Trigger data load
const initialState = createInitialStateFromURL(
  defaultState,
  parseDestination,
  (state, dest) => ({ ...state, destination: dest, isLoading: true })
);

// In reducer
case 'storeInitialized': {
  if (state.destination?.type === 'detail') {
    return [
      state,
      Effect.run(async (dispatch) => {
        const item = await deps.api.fetchItem(state.destination.state.itemId);
        dispatch({ type: 'itemLoaded', item });
      })
    ];
  }
  return [state, Effect.none()];
}
```

### Pitfall 8: Forgetting Base Path

**Problem:** Routes don't account for deployment subdirectory.

```typescript
// ❌ WRONG: Hardcoded paths
const serializers = {
  detail: (state) => `/item-${state.itemId}` // Breaks if app deployed to /my-app/
};

// ✅ CORRECT: Use basePath
const serializers = {
  detail: (state) => `/inventory/item-${state.itemId}`
};
const config = {
  basePath: '/inventory', // Consistent base path
  serializers
};
```

---

## Additional Resources

- [The Composable Architecture (TCA)](https://github.com/pointfreeco/swift-composable-architecture) - Original inspiration
- [path-to-regexp](https://github.com/pillarjs/path-to-regexp) - Pattern matching library
- [History API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/History_API) - Browser history reference

## Next Steps

- [Navigation System](/packages/core/docs/navigation/) - State-driven navigation components
- [DSL Guide](/packages/core/docs/dsl/) - Fluent API for reducer composition
- [Testing Guide](/packages/core/docs/backend/testing.md) - Testing strategies for routing
