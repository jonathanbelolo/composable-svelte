# Phase 14: Server-Side Rendering (SSR) & Static Site Generation

**Status**: Planning → Ready for Implementation
**Priority**: High
**Estimated Duration**: 3-4 weeks
**Last Updated**: 2025-01-10

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Philosophy](#architecture-philosophy)
3. [Design Decisions](#design-decisions)
4. [Core Features](#core-features)
5. [Implementation Plan](#implementation-plan)
6. [API Design](#api-design)
7. [Example Usage](#example-usage)
8. [Testing Strategy](#testing-strategy)
9. [Success Criteria](#success-criteria)

---

## Overview

Add **Server-Side Rendering (SSR)** support to Composable Svelte, enabling:
- **Primary**: Request-time HTML rendering with Node.js server
- **Secondary**: Build-time Static Site Generation (opt-in)

**Key Principle**: Server and client have **different data loading patterns**. Server uses direct data access (DB, files, APIs), client uses effects via dependencies.

---

## Architecture Philosophy

### Core Insight

Composable Svelte's architecture is **already SSR-ready** because:

1. **State is Pure Data**: Always serializable (no WebSocket, no functions, no DOM refs)
2. **Effects are Data Structures**: Can be deferred/skipped without breaking state
3. **Dependencies are Injected**: Side effects live outside state in environment
4. **Reducers are Pure Functions**: Can run anywhere (server, client, build time)

### SSR Flow (Request-Time)

```
Request:
  1. Load data for this request (DB queries, API calls)
  2. Create store with pre-populated state
  3. Render component to HTML
  4. Serialize state to JSON
  5. Send HTML + JSON as response

Client:
  6. Browser receives HTML (instant display)
  7. JavaScript downloads and executes
  8. Client hydrates store from JSON
  9. Effects execute, app becomes interactive
```

### No Server Dependencies Needed

**Why?** Because during server rendering:
- No user interactions (no effects triggered)
- Data is pre-loaded (no API calls during render)
- No side effects execute (effects deferred)

Therefore: Server store needs **empty dependencies object**.

```typescript
// Server: No dependencies
const serverStore = createStore({
  initialState: preloadedData,  // Already has data
  reducer,
  dependencies: {}  // Empty! No effects will run
});

// Client: Full dependencies
const clientStore = hydrateStore(serverData, {
  initialState: serverData,
  reducer,
  dependencies: {
    storage: createLocalStorage(),
    api: createAPIClient(),
    websocket: createLiveWebSocket()
  }
});
```

---

## Design Decisions

### Decision 1: SSR First, SSG Optional

**Primary Use Case**: **Server-Side Rendering** (request-time)
- Node.js server (Express, Fastify, etc.)
- Dynamic content per request
- User-specific data
- Example: Dashboard, authenticated app

**Secondary Use Case**: **Static Site Generation** (build-time, opt-in)
- Pre-render at build time
- Static hosting (Netlify, Vercel)
- Same primitives, different timing
- Example: Blog, docs

**Rationale**:
- SSR is more flexible (covers SSG use case too)
- Primary example and docs focus on SSR
- SSG is a special case of SSR (run at build time instead of request time)

---

### Decision 2: Data Loading Outside Store

**Chosen**: Load data before creating store, inject as initial state.

**Server Data Loading** (request handler):
```typescript
// Server-specific data loading (OUTSIDE store)
export async function handleRequest(req: Request) {
  // Load data for THIS request
  const user = await db.users.findOne({ id: req.session.userId });
  const items = await db.items.findMany({ userId: user.id });

  // Create store with pre-populated data
  const store = createStore({
    initialState: { user, items, isLoading: false },
    reducer,
    dependencies: {}
  });

  // Render
  const html = renderToHTML(App, { store });
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}
```

**Client Data Loading** (effects):
```typescript
// Client uses effects (INSIDE store via effects)
case 'loadItems': {
  return [
    { ...state, isLoading: true },
    Effect.run(async (dispatch) => {
      const items = await deps.api.get('/items');
      dispatch({ type: 'itemsLoaded', items });
    })
  ];
}
```

**Rationale**:
- Server and client have different data access patterns
- Server: Direct DB/file access (optimal for that request)
- Client: Effects via dependencies (standard pattern)
- No need for "isomorphic" dependencies
- Clear separation of concerns

**Trade-off Accepted**: Some data loading logic exists in both places.

---

### Decision 3: Effect Deferral Default

**Chosen**: `ssr.deferEffects` defaults to `true`.

```typescript
// Default behavior
createStore({
  initialState,
  reducer
  // ssr.deferEffects implicitly true on server
});
```

**Rationale**:
- Safe by default (no effects on server)
- Client doesn't need `deferEffects: false` everywhere
- Explicit opt-in if server effects needed (future)

**Detection**: Automatic via `typeof window === 'undefined'`.

---

### Decision 4: Separate Entry Points

**Chosen**: Server and client have separate entry files.

```
src/
├── server.ts    # SSR request handler (Node.js)
├── client.ts    # Client entry (browser)
└── lib/         # Shared code (components, reducers)
```

**Rationale**:
- Clearest pattern (no magic)
- Standard Node.js/web development practice
- Build tools naturally separate them
- No risk of bundling server code in client

---

## Core Features

### 1. State Serialization

```typescript
export function serializeStore<State, Action>(
  store: Store<State, Action>
): string;
```

Converts store state to JSON string for transfer to client.

**Format**:
```json
{
  "state": { "count": 0, "user": null },
  "timestamp": 1704916800000
}
```

---

### 2. State Hydration

```typescript
export function hydrateStore<State, Action, Dependencies>(
  data: string,
  config: StoreConfig<State, Action, Dependencies>
): Store<State, Action>;
```

Restores store from serialized state on client.

---

### 3. Effect Deferral (Automatic)

**Server/Build Time**:
```typescript
const isServer = typeof window === 'undefined';
const deferEffects = config.ssr?.deferEffects ?? true;

if (isServer && deferEffects) {
  return; // Skip effect execution
}
```

---

### 4. Rendering Helper

```typescript
export function renderToHTML(
  Component: SvelteComponent,
  props: ComponentProps
): string;
```

Renders component to complete HTML with hydration script.

---

## Implementation Plan

### Milestone 1: Core Serialization (Week 1)

**Goal**: State serialization and hydration.

**Tasks**:
- [ ] Add `ssr` field to `StoreConfig` type
- [ ] Implement `serializeStore()` function
- [ ] Implement `hydrateStore()` function
- [ ] Add environment detection (`isServer`)
- [ ] Write unit tests (20+ tests)

**Files**:
- `packages/core/src/lib/types.ts` - Add `SSRConfig`
- `packages/core/src/lib/ssr/serialize.ts` - NEW
- `packages/core/src/lib/ssr/hydrate.ts` - NEW
- `packages/core/src/lib/ssr/index.ts` - NEW: Public API
- `packages/core/src/lib/utils.ts` - Add `isServer`
- `packages/core/tests/ssr/serialization.test.ts` - NEW

**API**:
```typescript
// types.ts
export interface StoreConfig<State, Action, Dependencies> {
  initialState: State;
  reducer: Reducer<State, Action, Dependencies>;
  dependencies?: Dependencies;
  maxHistorySize?: number;
  ssr?: {
    deferEffects?: boolean;  // Default: true
  };
}

export interface HydrationData<State> {
  state: State;
  timestamp: number;
}

// ssr/index.ts
export function serializeStore<State, Action>(
  store: Store<State, Action>
): string;

export function hydrateStore<State, Action, Dependencies>(
  data: string,
  config: StoreConfig<State, Action, Dependencies>
): Store<State, Action>;
```

**Acceptance Criteria**:
- ✅ Serialize/hydrate roundtrip preserves state
- ✅ All tests pass
- ✅ Type-safe API
- ✅ Handles edge cases (null, empty, nested)

---

### Milestone 2: Effect Deferral (Week 1-2)

**Goal**: Automatically defer effects on server.

**Tasks**:
- [ ] Modify `store.ts` to check environment
- [ ] Skip effect execution when `isServer && deferEffects`
- [ ] Add configuration option `ssr.deferEffects`
- [ ] Write tests for server behavior
- [ ] Document behavior

**Files**:
- `packages/core/src/lib/store.ts` - Modify `executeEffect()`
- `packages/core/tests/ssr/effect-deferral.test.ts` - NEW

**Implementation**:
```typescript
// store.ts
function executeEffect(effect: Effect<Action>): void {
  const isServer = typeof window === 'undefined';
  const deferEffects = config.ssr?.deferEffects ?? true;

  if (isServer && deferEffects) {
    return; // Skip execution on server
  }

  // Normal execution
  switch (effect._tag) {
    // ... existing logic
  }
}
```

**Acceptance Criteria**:
- ✅ Effects skipped on server
- ✅ Effects execute on client
- ✅ State updates work on both
- ✅ Configurable via `ssr.deferEffects`

---

### Milestone 3: Rendering Helper (Week 2)

**Goal**: Helper function for rendering components to HTML.

**Tasks**:
- [ ] Create `renderToHTML()` function
- [ ] Build complete HTML with hydration script
- [ ] Handle component props
- [ ] Write tests
- [ ] Document usage

**Files**:
- `packages/core/src/lib/ssr/render.ts` - NEW
- `packages/core/tests/ssr/render.test.ts` - NEW

**Implementation**:
```typescript
// ssr/render.ts
import { render } from 'svelte/server';

export function renderToHTML<Props extends Record<string, any>>(
  Component: any,
  props: Props
): string {
  // Render component
  const { html, head } = render(Component, { props });

  // Extract store state if present
  const store = props.store;
  const hydrationScript = store
    ? `<script id="__COMPOSABLE_SVELTE_STATE__" type="application/json">
${serializeStore(store)}
</script>`
    : '';

  // Build complete HTML
  return `<!DOCTYPE html>
<html>
  <head>
    ${head}
  </head>
  <body>
    ${html}
    ${hydrationScript}
  </body>
</html>`;
}
```

**Acceptance Criteria**:
- ✅ Renders valid HTML
- ✅ Includes hydration script
- ✅ Works with Svelte components
- ✅ Type-safe

---

### Milestone 4: SSR Server Example (Week 3)

**Goal**: Complete SSR example with Node.js server.

**Tasks**:
- [ ] Create `examples/ssr-server/` directory
- [ ] Write Express server with SSR handler
- [ ] Create sample dashboard app
- [ ] Add database mock/SQLite
- [ ] Write data loading functions
- [ ] Test server locally
- [ ] Document setup

**Structure**:
```
examples/ssr-server/
├── data/                 # Mock data or SQLite
├── src/
│   ├── lib/
│   │   ├── components/   # Svelte components
│   │   └── store/        # Reducers, types
│   ├── server/
│   │   ├── routes.ts     # Route handlers
│   │   ├── loaders.ts    # Data loading functions
│   │   └── server.ts     # Express app
│   ├── client.ts         # Client entry
│   └── App.svelte        # Main component
├── public/               # Static assets
├── dist/                 # Built files
├── package.json
└── README.md             # Setup guide
```

**Server** (`src/server/server.ts`):
```typescript
import express from 'express';
import { renderToHTML } from '@composable-svelte/core/ssr';
import { createStore } from '@composable-svelte/core';
import { loadDashboardData } from './loaders';
import App from '../App.svelte';
import { appReducer } from '../lib/store/reducer';

const app = express();

// Serve static assets
app.use(express.static('public'));

// SSR route handler
app.get('/', async (req, res) => {
  try {
    // 1. Load data for this request
    const data = await loadDashboardData(req.session?.userId);

    // 2. Create store with pre-populated data
    const store = createStore({
      initialState: data,
      reducer: appReducer,
      dependencies: {}  // No effects during render
    });

    // 3. Render to HTML
    const html = renderToHTML(App, { store });

    // 4. Send response
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error('SSR Error:', error);
    res.status(500).send('Server Error');
  }
});

// User-specific route
app.get('/dashboard', async (req, res) => {
  if (!req.session?.userId) {
    return res.redirect('/login');
  }

  const data = await loadUserDashboard(req.session.userId);
  const store = createStore({
    initialState: data,
    reducer: appReducer,
    dependencies: {}
  });

  const html = renderToHTML(App, { store });
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

app.listen(3000, () => {
  console.log('SSR server running on http://localhost:3000');
});
```

**Data Loaders** (`src/server/loaders.ts`):
```typescript
import db from './db';

export async function loadDashboardData(userId?: string) {
  if (!userId) {
    return {
      user: null,
      items: [],
      stats: null
    };
  }

  const [user, items, stats] = await Promise.all([
    db.users.findOne({ id: userId }),
    db.items.findMany({ userId }),
    db.stats.getForUser(userId)
  ]);

  return { user, items, stats };
}

export async function loadUserDashboard(userId: string) {
  const [user, recentActivity, notifications] = await Promise.all([
    db.users.findOne({ id: userId }),
    db.activity.getRecent(userId, 10),
    db.notifications.getUnread(userId)
  ]);

  return { user, recentActivity, notifications };
}
```

**Client Entry** (`src/client.ts`):
```typescript
import { mount } from 'svelte';
import { hydrateStore } from '@composable-svelte/core/ssr';
import App from './App.svelte';
import { appReducer } from './lib/store/reducer';
import { createClientDependencies } from './lib/store/dependencies';

// Get server state
const hydrationEl = document.getElementById('__COMPOSABLE_SVELTE_STATE__');
const hydrationData = hydrationEl?.textContent || '{"state":{}}';

// Hydrate with client dependencies
const store = hydrateStore(hydrationData, {
  initialState: {},  // Overridden
  reducer: appReducer,
  dependencies: createClientDependencies()
});

// Mount
mount(App, {
  target: document.body,
  props: { store }
});
```

**Acceptance Criteria**:
- ✅ Server runs locally on port 3000
- ✅ Server renders HTML with data
- ✅ Client successfully hydrates
- ✅ Interactive after hydration
- ✅ Multiple routes work
- ✅ README documents setup

---

### Milestone 5: SSG Support & Documentation (Week 3-4)

**Goal**: Add SSG build script + comprehensive documentation.

**Tasks**:
- [ ] Create SSG build script example
- [ ] Add SSG documentation
- [ ] Write SSR guide (`docs/guides/SSR.md`)
- [ ] Write SSG guide (`docs/guides/SSG.md`)
- [ ] Update CLAUDE.md
- [ ] Write E2E tests

**SSG Build Script** (optional pattern):
```typescript
// build-ssg.ts (opt-in, for static sites)
import { renderToHTML } from '@composable-svelte/core/ssr';
import { createStore } from '@composable-svelte/core';
import { writeFileSync, mkdirSync } from 'fs';

const routes = [
  { path: '/', getData: () => loadHomeData() },
  { path: '/about', getData: () => loadAboutData() },
  { path: '/blog', getData: () => loadBlogData() }
];

async function buildStatic() {
  for (const route of routes) {
    const data = await route.getData();
    const store = createStore({
      initialState: data,
      reducer: appReducer,
      dependencies: {}
    });

    const html = renderToHTML(App, { store });

    const dir = `dist${route.path}`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/index.html`, html);
  }

  console.log(`✅ Built ${routes.length} pages`);
}

buildStatic();
```

**Documentation**:
- `docs/guides/SSR.md` - Complete SSR guide (PRIMARY)
- `docs/guides/SSG.md` - SSG guide (SECONDARY, opt-in)
- `docs/guides/SSR-Architecture.md` - Architecture explanation
- `examples/ssr-server/README.md` - Server setup
- `CLAUDE.md` - Update with Phase 14

**E2E Test**:
```typescript
describe('SSR E2E', () => {
  it('should render and hydrate', async () => {
    // Start server
    const server = await startTestServer();

    // Load page
    await page.goto('http://localhost:3000');

    // Verify server-rendered content
    await expect(page.locator('h1')).toHaveText('Dashboard');
    await expect(page.locator('text=User: Alice')).toBeVisible();

    // Verify hydration
    await page.waitForFunction(() => {
      return window.__HYDRATED__ === true;
    });

    // Verify interactivity
    await page.click('button#refresh');
    await expect(page.locator('text=Loading...')).toBeVisible();
  });
});
```

**Acceptance Criteria**:
- ✅ SSG build script works
- ✅ Documentation complete
- ✅ E2E test passes
- ✅ Both SSR and SSG documented

---

## API Design

### Complete API Surface

```typescript
// @composable-svelte/core
export interface StoreConfig<State, Action, Dependencies> {
  initialState: State;
  reducer: Reducer<State, Action, Dependencies>;
  dependencies?: Dependencies;
  maxHistorySize?: number;
  ssr?: {
    deferEffects?: boolean;  // Default: true
  };
}

// @composable-svelte/core/ssr
export function serializeStore<State, Action>(
  store: Store<State, Action>
): string;

export function hydrateStore<State, Action, Dependencies>(
  data: string,
  config: StoreConfig<State, Action, Dependencies>
): Store<State, Action>;

export function renderToHTML<Props extends Record<string, any>>(
  Component: SvelteComponent,
  props: Props
): string;

export interface HydrationData<State> {
  state: State;
  timestamp: number;
}

// @composable-svelte/core/utils
export const isServer: boolean;
export const isClient: boolean;
```

---

## Example Usage

### SSR Server (Primary)

```typescript
// server.ts
import express from 'express';
import { renderToHTML } from '@composable-svelte/core/ssr';
import { createStore } from '@composable-svelte/core';

const app = express();

app.get('/', async (req, res) => {
  // Load data for this request
  const user = await db.users.find(req.session.userId);
  const items = await db.items.findByUser(user.id);

  // Create store
  const store = createStore({
    initialState: { user, items },
    reducer,
    dependencies: {}
  });

  // Render
  const html = renderToHTML(App, { store });
  res.send(html);
});

app.listen(3000);
```

### SSG Build (Secondary, Opt-in)

```typescript
// build-ssg.ts
import { renderToHTML } from '@composable-svelte/core/ssr';

const data = await loadStaticData();
const store = createStore({ initialState: data, reducer });
const html = renderToHTML(App, { store });
writeFileSync('dist/index.html', html);
```

### Client Hydration (Both)

```typescript
// client.ts
import { hydrateStore } from '@composable-svelte/core/ssr';

const data = document.getElementById('__COMPOSABLE_SVELTE_STATE__')!.textContent!;
const store = hydrateStore(data, {
  initialState: {},
  reducer,
  dependencies: {
    api: createAPIClient(),
    storage: createLocalStorage()
  }
});

mount(App, { target: document.body, props: { store } });
```

---

## Testing Strategy

### Unit Tests (50+ tests)
- Serialization/hydration
- Effect deferral
- Rendering
- Edge cases

### Integration Tests (5+ tests)
- Full request flow
- Multiple routes
- Data loading

### E2E Tests (3+ tests)
- Browser rendering
- Hydration
- Interactivity

---

## Success Criteria

- [ ] `serializeStore()` and `hydrateStore()` work
- [ ] Effect deferral automatic on server
- [ ] `renderToHTML()` generates valid HTML
- [ ] **SSR server example works locally**
- [ ] SSG build script works (opt-in)
- [ ] 95%+ test coverage
- [ ] E2E test passes
- [ ] Documentation complete
- [ ] Zero breaking changes

---

## Timeline

**Week 1**: Serialization + Effect Deferral
**Week 2**: Rendering Helper
**Week 3**: **SSR Server Example** (primary)
**Week 4**: SSG + Documentation

**Total**: 3-4 weeks
