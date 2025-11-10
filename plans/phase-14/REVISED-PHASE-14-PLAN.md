# Phase 14: Static Site Generation (SSG) & Server-Side Rendering

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
10. [Future Phases](#future-phases)

---

## Overview

Add Static Site Generation (SSG) support to Composable Svelte, enabling pre-rendering of HTML at build time for:
- Blogs, documentation sites, marketing pages
- Product catalogs with static data
- Any content that can be pre-rendered

**Key Principle**: Server and client have **different data loading patterns**. Server uses direct data access (DB, files, APIs), client uses effects via dependencies.

---

## Architecture Philosophy

### Core Insight

Composable Svelte's architecture is **already SSG-ready** because:

1. **State is Pure Data**: Always serializable (no WebSocket, no functions, no DOM refs)
2. **Effects are Data Structures**: Can be deferred/skipped without breaking state
3. **Dependencies are Injected**: Side effects live outside state in environment
4. **Reducers are Pure Functions**: Can run anywhere (server, client, build time)

### SSG Flow

```
Build Time:
  1. Load data (DB queries, file reads, API calls)
  2. Create store with pre-populated state
  3. Render component to HTML
  4. Serialize state to JSON
  5. Write HTML + JSON to file

Request Time (Static Hosting):
  6. Serve pre-rendered HTML file
  7. Client downloads HTML + JavaScript
  8. Client hydrates store from JSON
  9. Effects execute, app becomes interactive
```

### No Server Dependencies Needed

**Why?** Because during server/SSG rendering:
- No user interactions (no effects triggered)
- Data is pre-loaded (no API calls during render)
- No side effects execute (effects deferred)

Therefore: Server store needs **empty dependencies object**.

```typescript
// Server/SSG: No dependencies
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

### Decision 1: SSG First, SSR Later

**Chosen**: Focus on Static Site Generation (build-time rendering) for Phase 14.

**Rationale**:
- Simpler (no server runtime needed)
- More common use case for Composable Svelte apps
- Can add request-time SSR in Phase 15
- Styleguide example can be SSG'd

**Deferred**: Dynamic SSR (request-time rendering)

---

### Decision 2: Data Loading Outside Store

**Chosen**: Load data before creating store, inject as initial state.

**Server Data Loading**:
```typescript
// Server-specific data loading (OUTSIDE store)
const items = await db.query('SELECT * FROM items');
const posts = await readMarkdownFiles('./content');
const user = await serverAPI.getUser();

// Inject into initial state
const store = createStore({
  initialState: {
    items,  // Pre-loaded
    posts,  // Pre-loaded
    user    // Pre-loaded
  },
  reducer
});
```

**Client Data Loading**:
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
- Server: Direct DB/file access (optimal)
- Client: Effects via dependencies (standard pattern)
- No need for "isomorphic" dependencies
- Clear separation of concerns

**Trade-off Accepted**: Some data loading logic duplication between server and client.

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
- Explicit opt-in if server effects needed (Phase 15)

**Detection**: Automatic via `typeof window === 'undefined'`.

---

### Decision 4: Separate Entry Points

**Chosen**: Server and client have separate entry files.

```
src/
├── server.ts    # SSG build script (Node.js)
├── client.ts    # Client entry (browser)
└── lib/         # Shared code (components, reducers)
```

**Rationale**:
- Clearest pattern (no magic)
- Standard Node.js/web development practice
- Build tools naturally separate them
- No risk of bundling server code in client

---

### Decision 5: SSG Trigger Pattern

**Chosen**: Separate build script (user runs it explicitly).

```bash
# User runs this to generate static HTML
node build-ssg.js
```

**Not Chosen**:
- ❌ Vite plugin (too coupled)
- ❌ Config flag (less flexible)

**Rationale**:
- Explicit and clear
- Maximum flexibility
- Easy to customize per project
- No framework dependency

---

## Core Features

### 1. State Serialization

```typescript
export function serializeStore<State, Action>(
  store: Store<State, Action>
): string;
```

Converts store state to JSON string for transfer to client.

**Requirements**:
- Pure state is always serializable (architecture guarantee)
- Includes timestamp for debugging
- Compact format (no extra metadata)

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

**Behavior**:
- Overrides `config.initialState` with hydrated state
- Sets up full client dependencies
- Enables effect execution (client environment)

---

### 3. Effect Deferral (Automatic)

**Server/Build Time**:
```typescript
// Environment detection
const isServer = typeof window === 'undefined';
const deferEffects = config.ssr?.deferEffects ?? true;

if (isServer && deferEffects) {
  // Skip effect execution
  return;
}
```

**Client**:
```typescript
// Effects execute normally
executeEffect(effect);
```

---

### 4. Rendering Helper

```typescript
export function renderToStaticHTML(
  Component: SvelteComponent,
  props: ComponentProps
): string;
```

Thin wrapper around `svelte/server` render function.

**Returns**: Complete HTML string with:
- Rendered component HTML
- Hydration script with state data
- Proper HTML structure

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
- `packages/core/src/lib/types.ts` - Add `SSRConfig` to `StoreConfig`
- `packages/core/src/lib/ssr/serialize.ts` - NEW
- `packages/core/src/lib/ssr/hydrate.ts` - NEW
- `packages/core/src/lib/ssr/index.ts` - NEW: Public API
- `packages/core/src/lib/utils.ts` - Add `isServer` constant
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

**Tests**:
```typescript
describe('serializeStore', () => {
  it('should serialize state to JSON');
  it('should include timestamp');
  it('should handle nested objects');
  it('should handle arrays');
  it('should handle null/undefined');
});

describe('hydrateStore', () => {
  it('should restore state from JSON');
  it('should override initialState');
  it('should preserve reducer');
  it('should accept new dependencies');
  it('should handle corrupted data gracefully');
});
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
    // Skip execution on server
    return;
  }

  // Normal execution
  switch (effect._tag) {
    // ... existing logic
  }
}
```

**Tests**:
```typescript
describe('Effect Deferral', () => {
  it('should skip effects on server by default');
  it('should execute effects on client');
  it('should respect deferEffects: false');
  it('should not affect state updates');
});
```

**Acceptance Criteria**:
- ✅ Effects skipped on server (when `isServer === true`)
- ✅ Effects execute on client (when `isServer === false`)
- ✅ State updates work on both server and client
- ✅ Configurable via `ssr.deferEffects`

---

### Milestone 3: Rendering Helper (Week 2)

**Goal**: Helper function for rendering components to HTML.

**Tasks**:
- [ ] Create `renderToStaticHTML()` function
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

export function renderToStaticHTML<Props extends Record<string, any>>(
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

**Tests**:
```typescript
describe('renderToStaticHTML', () => {
  it('should render component to HTML string');
  it('should include hydration script');
  it('should handle components without store');
  it('should include head content');
});
```

**Acceptance Criteria**:
- ✅ Renders valid HTML
- ✅ Includes hydration script with state
- ✅ Works with Svelte components
- ✅ Type-safe

---

### Milestone 4: Example Implementation (Week 3)

**Goal**: Complete SSG example with build script.

**Tasks**:
- [ ] Create `examples/ssg-blog/` directory
- [ ] Write build script (`build-ssg.ts`)
- [ ] Create sample blog components
- [ ] Add markdown content
- [ ] Write data loading functions
- [ ] Build and verify output
- [ ] Document setup

**Structure**:
```
examples/ssg-blog/
├── content/              # Markdown blog posts
│   ├── post-1.md
│   └── post-2.md
├── src/
│   ├── lib/
│   │   ├── components/   # Svelte components
│   │   └── store/        # Reducers, types
│   ├── client.ts         # Client entry
│   └── App.svelte        # Main component
├── build-ssg.ts          # SSG build script
├── dist/                 # Generated HTML
└── README.md             # Setup guide
```

**Build Script** (`build-ssg.ts`):
```typescript
import { renderToStaticHTML } from '@composable-svelte/core/ssr';
import { createStore } from '@composable-svelte/core';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import App from './src/App.svelte';
import { appReducer } from './src/lib/store/reducer';

// 1. Load markdown posts
function loadPosts() {
  const postsDir = join(__dirname, 'content');
  const files = readdirSync(postsDir);

  return files.map(file => {
    const content = readFileSync(join(postsDir, file), 'utf-8');
    const { data, content: body } = parseMarkdown(content);
    return { ...data, body, slug: file.replace('.md', '') };
  });
}

// 2. Render each route
async function buildSite() {
  const posts = loadPosts();

  // Homepage
  const homeStore = createStore({
    initialState: {
      posts: posts.slice(0, 10),  // Latest 10
      selectedPost: null
    },
    reducer: appReducer,
    dependencies: {}  // Empty - no effects during render
  });

  const homeHTML = renderToStaticHTML(App, { store: homeStore });

  mkdirSync('dist', { recursive: true });
  writeFileSync('dist/index.html', homeHTML);

  // Individual post pages
  for (const post of posts) {
    const postStore = createStore({
      initialState: {
        posts,
        selectedPost: post
      },
      reducer: appReducer,
      dependencies: {}
    });

    const postHTML = renderToStaticHTML(App, { store: postStore });

    mkdirSync(`dist/blog/${post.slug}`, { recursive: true });
    writeFileSync(`dist/blog/${post.slug}/index.html`, postHTML);
  }

  console.log(`✅ Built ${posts.length + 1} pages`);
}

buildSite().catch(console.error);
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
const hydrationData = hydrationEl
  ? hydrationEl.textContent!
  : JSON.stringify({ state: { posts: [], selectedPost: null } });

// Hydrate store
const store = hydrateStore(hydrationData, {
  initialState: { posts: [], selectedPost: null },  // Overridden
  reducer: appReducer,
  dependencies: createClientDependencies()
});

// Mount app
mount(App, {
  target: document.body,
  props: { store }
});
```

**Acceptance Criteria**:
- ✅ Build script generates static HTML files
- ✅ HTML contains server-rendered content
- ✅ Hydration script included
- ✅ Client successfully hydrates
- ✅ Interactive after hydration
- ✅ README documents setup

---

### Milestone 5: Testing & Documentation (Week 3-4)

**Goal**: Comprehensive tests and documentation.

**Tasks**:
- [ ] Unit tests for all SSR functions (50+ tests)
- [ ] E2E test: build → render → hydrate
- [ ] Integration test: full SSG flow
- [ ] Write SSG guide (`docs/guides/SSG.md`)
- [ ] Update CLAUDE.md
- [ ] Update main README

**E2E Test**:
```typescript
describe('SSG E2E', () => {
  it('should generate valid HTML with data', async () => {
    // 1. Create store with data
    const store = createStore({
      initialState: { items: [{ id: 1, name: 'Item 1' }] },
      reducer: (s) => [s, Effect.none()]
    });

    // 2. Render to HTML
    const html = renderToStaticHTML(TestComponent, { store });

    // 3. Verify HTML contains data
    expect(html).toContain('Item 1');
    expect(html).toContain('__COMPOSABLE_SVELTE_STATE__');

    // 4. Verify hydration data
    const match = html.match(/<script id="__COMPOSABLE_SVELTE_STATE__"[^>]*>([^<]+)<\/script>/);
    const hydrationData = JSON.parse(match![1]);
    expect(hydrationData.state.items).toHaveLength(1);
  });

  it('should hydrate and become interactive', async () => {
    // Full flow test with browser
    const html = await buildPage('/');

    // Write to temp file
    writeFileSync('test.html', html);

    // Load in headless browser
    await page.goto('file://' + path.resolve('test.html'));

    // Verify content
    await expect(page.locator('text=Item 1')).toBeVisible();

    // Verify interactive
    await page.click('button');
    await expect(page.locator('text=Clicked')).toBeVisible();
  });
});
```

**Documentation**:
- `docs/guides/SSG.md` - Complete SSG guide
- `docs/guides/SSR-Architecture.md` - Architecture explanation
- `examples/ssg-blog/README.md` - Example setup
- `CLAUDE.md` - Update with Phase 14 status

**Acceptance Criteria**:
- ✅ 95%+ code coverage
- ✅ E2E test passes
- ✅ Documentation complete
- ✅ Example runs successfully

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

export function renderToStaticHTML<Props extends Record<string, any>>(
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

### Bundle Size Impact

- `serializeStore()` + `hydrateStore()`: ~1KB
- `renderToStaticHTML()`: ~0.5KB (thin wrapper)
- Total: **~1.5KB** (minified + gzip)
- Client-only builds: **0KB** (tree-shaken)

---

## Example Usage

### Complete Example

**1. Data Loading (Server)**

```typescript
// data/loaders.ts (server-only)
import { readFileSync } from 'fs';
import { join } from 'path';

export async function loadBlogPosts() {
  const dir = join(__dirname, '../content');
  const files = readdirSync(dir);

  return files.map(file => {
    const content = readFileSync(join(dir, file), 'utf-8');
    return parseMarkdown(content);
  });
}

export async function loadPost(slug: string) {
  const content = readFileSync(
    join(__dirname, `../content/${slug}.md`),
    'utf-8'
  );
  return parseMarkdown(content);
}
```

**2. Build Script (Server)**

```typescript
// build-ssg.ts
import { renderToStaticHTML } from '@composable-svelte/core/ssr';
import { createStore } from '@composable-svelte/core';
import { loadBlogPosts, loadPost } from './data/loaders';
import App from './src/App.svelte';
import { appReducer } from './src/lib/store/reducer';

async function build() {
  const posts = await loadBlogPosts();

  // Build homepage
  const homeStore = createStore({
    initialState: { posts, selectedPost: null },
    reducer: appReducer,
    dependencies: {}  // No effects during render
  });

  const homeHTML = renderToStaticHTML(App, { store: homeStore });
  writeFileSync('dist/index.html', homeHTML);

  // Build post pages
  for (const post of posts) {
    const postData = await loadPost(post.slug);
    const postStore = createStore({
      initialState: { posts, selectedPost: postData },
      reducer: appReducer,
      dependencies: {}
    });

    const postHTML = renderToStaticHTML(App, { store: postStore });
    writeFileSync(`dist/blog/${post.slug}/index.html`, postHTML);
  }
}

build();
```

**3. Client Hydration**

```typescript
// src/client.ts
import { mount } from 'svelte';
import { hydrateStore } from '@composable-svelte/core/ssr';
import App from './App.svelte';
import { appReducer } from './lib/store/reducer';

// Extract server state
const el = document.getElementById('__COMPOSABLE_SVELTE_STATE__');
const data = el ? el.textContent! : '{"state":{}}';

// Hydrate with client dependencies
const store = hydrateStore(data, {
  initialState: {},  // Overridden by hydration
  reducer: appReducer,
  dependencies: {
    storage: createLocalStorage(),
    api: createAPIClient()
  }
});

// Mount
mount(App, { target: document.body, props: { store } });
```

**4. Component**

```svelte
<!-- src/App.svelte -->
<script lang="ts">
  import type { Store } from '@composable-svelte/core';
  import BlogPost from './lib/components/BlogPost.svelte';

  interface Props {
    store: Store<AppState, AppAction>;
  }

  let { store }: Props = $props();

  const posts = $derived($store.posts);
  const selectedPost = $derived($store.selectedPost);
</script>

<main>
  {#if selectedPost}
    <BlogPost post={selectedPost} />
  {:else}
    <h1>Blog</h1>
    <ul>
      {#each posts as post}
        <li>
          <a href="/blog/{post.slug}">{post.title}</a>
        </li>
      {/each}
    </ul>
  {/if}
</main>
```

---

## Testing Strategy

### Unit Tests (50+ tests)

**Serialization**:
- Serialize simple state
- Serialize nested objects
- Serialize arrays
- Handle null/undefined
- Include timestamp
- Compact format

**Hydration**:
- Restore state from JSON
- Override initialState
- Preserve reducer
- Accept new dependencies
- Handle corrupted data
- Handle missing data

**Effect Deferral**:
- Skip effects on server
- Execute effects on client
- Respect configuration
- Don't affect state updates

**Rendering**:
- Render component to HTML
- Include hydration script
- Handle props
- Include head content
- Valid HTML output

### Integration Tests (5+ tests)

**Full SSG Flow**:
```typescript
it('should complete full SSG flow', async () => {
  // 1. Load data
  const data = await loadTestData();

  // 2. Create store
  const store = createStore({
    initialState: data,
    reducer: testReducer
  });

  // 3. Render
  const html = renderToStaticHTML(TestComponent, { store });

  // 4. Verify HTML
  expect(html).toContain('<!DOCTYPE html>');
  expect(html).toContain('__COMPOSABLE_SVELTE_STATE__');
  expect(html).toContain(data.title);

  // 5. Extract hydration data
  const match = html.match(/<script[^>]*>([^<]+)<\/script>/);
  const hydrationData = JSON.parse(match![1]);

  // 6. Verify data matches
  expect(hydrationData.state).toEqual(data);
});
```

### E2E Tests (3+ tests)

**Browser Rendering**:
```typescript
it('should render in browser and hydrate', async () => {
  // Generate HTML
  const html = await buildStaticPage('/test');

  // Serve HTML
  const server = await createTestServer(html);

  // Load in headless browser
  await page.goto(server.url);

  // Verify server-rendered content
  await expect(page.locator('h1')).toHaveText('Test Page');

  // Verify hydration
  await expect(page.locator('[data-hydrated]')).toBeVisible();

  // Verify interactivity
  await page.click('button');
  await expect(page.locator('text=Clicked')).toBeVisible();
});
```

---

## Success Criteria

### Must-Have (Phase 14)

- [ ] `serializeStore()` and `hydrateStore()` implemented
- [ ] Effect deferral works automatically on server
- [ ] `renderToStaticHTML()` generates valid HTML
- [ ] Complete example (blog with SSG)
- [ ] 95%+ test coverage
- [ ] E2E test: render → hydrate → interactive
- [ ] Documentation complete
- [ ] Zero breaking changes to existing API

### Performance Targets

- [ ] Serialization: < 1ms for typical state (< 100KB)
- [ ] Hydration: < 5ms for typical state
- [ ] Rendering: < 50ms per page (simple blog post)
- [ ] Bundle size: < 2KB added to core library

### Quality Targets

- [ ] Type-safe API (no `any` types)
- [ ] Handles edge cases (null, empty, nested)
- [ ] Clear error messages
- [ ] Comprehensive documentation
- [ ] Works with existing routing system

---

## Future Phases

### Phase 15: Advanced SSR

- Server-side effect execution (opt-in)
- Request-time rendering (dynamic SSR)
- Custom serialization transformers
- State validation
- Edge runtime support (Cloudflare, Vercel Edge)

### Phase 16: Build Optimizations

- Incremental SSG (only rebuild changed pages)
- Streaming SSR (out-of-order hydration)
- Islands architecture (selective hydration)
- Build-time data fetching strategies
- Cache management

---

## Migration Guide

**No migration needed!** This is purely additive - existing client-only apps continue working unchanged.

### Adopting SSG (Optional)

**Before (Client-Only)**:
```typescript
// src/main.ts
import { createStore } from '@composable-svelte/core';

const store = createStore({
  initialState: { items: [] },
  reducer,
  dependencies: {
    api: createAPIClient()
  }
});

// Load data on mount
onMount(() => {
  store.dispatch({ type: 'loadItems' });
});
```

**After (SSG)**:
```typescript
// build-ssg.ts (NEW)
const items = await loadItemsFromDB();
const store = createStore({
  initialState: { items },  // Pre-loaded
  reducer
});
const html = renderToStaticHTML(App, { store });
writeFileSync('dist/index.html', html);

// src/client.ts (NEW)
const store = hydrateStore(serverData, {
  initialState: {},
  reducer,
  dependencies: {
    api: createAPIClient()
  }
});
mount(App, { target: document.body, props: { store } });
```

**Benefits**:
- ✅ Faster initial load (no API call needed)
- ✅ SEO friendly (content in HTML)
- ✅ Works without JavaScript (progressive enhancement)

---

## References

- [Phase 14 Revised Analysis](./SSR-REVISED-ANALYSIS.md) - Architecture decisions
- [Phase 7 URL Routing](../phase-7/) - Existing routing system
- [Core Concepts: Store](../../packages/core/docs/core-concepts/store-and-reducers.md)
- [Dependencies Guide](../../packages/core/docs/backend/dependencies.md)

---

## Timeline

**Week 1**: Core serialization + effect deferral
**Week 2**: Rendering helper + tests
**Week 3**: Example implementation + documentation
**Week 4**: Polish, review, ship

**Total**: 3-4 weeks

**Risk**: Low (architecture already supports this)

---

## Conclusion

Phase 14 adds SSG support that:
- ✅ Aligns perfectly with Composable Architecture philosophy
- ✅ Requires minimal API surface (3 exports)
- ✅ Zero breaking changes
- ✅ Clear separation: server loads data, client handles interactivity
- ✅ Production-ready for blogs, docs, marketing sites

**Ready to implement.**
