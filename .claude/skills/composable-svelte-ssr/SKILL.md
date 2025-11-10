---
name: composable-svelte-ssr
description: Server-side rendering patterns for Composable Svelte. Use when implementing SSR, hydration, server rendering, isomorphic code, or working with meta tags and SEO. Covers renderToHTML, hydrateStore, server-side routing, state serialization, and avoiding common SSR pitfalls.
---

# Composable Svelte SSR

This skill covers server-side rendering (SSR) patterns for Composable Svelte applications.

---

## SSR APIs

### renderToHTML - Server Rendering

```typescript
import { renderToHTML } from '@composable-svelte/core/ssr';
import { createStore } from '@composable-svelte/core';
import App from './App.svelte';

app.get('/', async (req, res) => {
  // 1. Load data for this request
  const data = await loadData(req.user);

  // 2. Create store with pre-populated data
  const store = createStore({
    initialState: data,
    reducer: appReducer,
    dependencies: {}  // Empty on server - effects won't run
  });

  // 3. Render to HTML
  const html = renderToHTML(App, { store }, {
    head: `<link rel="stylesheet" href="/assets/index.css">`,
    clientScript: '/assets/index.js'
  });

  // 4. Send response
  res.send(html);
});
```

### hydrateStore - Client Hydration

```typescript
import { hydrateStore } from '@composable-svelte/core/ssr';
import { mount } from 'svelte';
import App from './App.svelte';

// 1. Read state from script tag
const stateJSON = document.getElementById('__COMPOSABLE_SVELTE_STATE__')?.textContent;

// 2. Hydrate with client dependencies
const store = hydrateStore(stateJSON, {
  reducer: appReducer,
  dependencies: {
    api: createAPIClient(),
    storage: createLocalStorage()
  }
});

// 3. Mount app (reuses existing DOM from SSR)
mount(App, { target: document.body, props: { store } });
```

---

## ISOMORPHIC PATTERNS

### Server vs Client Dependencies

**Key Pattern**: Server has empty dependencies, client has real implementations.

```typescript
// server.ts
const store = createStore({
  initialState: data,
  reducer: appReducer,
  dependencies: {} as AppDependencies  // Empty - effects won't run
  // ssr.deferEffects defaults to true, so effects are automatically skipped
});

// client.ts
const store = hydrateStore(stateJSON, {
  reducer: appReducer,
  dependencies: {
    api: createAPIClient(),      // Real API client
    storage: localStorage,        // Real storage
    clock: new SystemClock()      // Real clock
  }
});
```

**Why**: Server doesn't need to execute effects - it just renders initial state. Client needs real dependencies for interactivity.

---

### Router Pure Functions on Server

**Key Pattern**: Use router's pure functions (`parseDestination`, `matchPath`, `serializeDestination`) on both server and client.

```typescript
// routing.ts (shared between server and client)
export function parsePostFromURL(path: string, defaultId: number): number {
  const match = path.match(/^\/posts\/(\d+)$/);
  return match ? parseInt(match[1], 10) : defaultId;
}

// server.ts
async function renderApp(request: any, reply: any) {
  const posts = await loadPosts();
  const path = request.url;
  const requestedPostId = parsePostFromURL(path, posts[0]?.id || 1);

  const store = createStore({
    initialState: {
      posts,
      selectedPostId: requestedPostId,
      meta: computeMetaForPost(posts.find(p => p.id === requestedPostId))
    },
    reducer: appReducer,
    dependencies: {}
  });

  const html = renderToHTML(App, { store });
  reply.type('text/html').send(html);
}
```

---

## STATE INITIALIZATION FROM URL

### Pattern: Parse URL on Server, Initialize State

```typescript
// server.ts
import { parseDestination } from './shared/routing';

app.get('/posts/:id', async (req, res) => {
  const postId = parseInt(req.params.id, 10);

  // Load data based on URL
  const posts = await loadPosts();
  const selectedPost = posts.find(p => p.id === postId) || posts[0];

  // Initialize state with URL-driven selection
  const store = createStore({
    initialState: {
      posts,
      selectedPostId: selectedPost?.id || null,
      // Set initial meta based on URL-selected post
      meta: selectedPost
        ? {
            title: `${selectedPost.title} - Blog`,
            description: selectedPost.content.slice(0, 160),
            ogImage: `/og/post-${selectedPost.id}.jpg`,
            canonical: `https://example.com/posts/${selectedPost.id}`
          }
        : initialState.meta
    },
    reducer: appReducer,
    dependencies: {}
  });

  const html = renderToHTML(App, { store });
  res.send(html);
});
```

---

## STATE SERIALIZATION/DESERIALIZATION

### Automatic Serialization

When you call `renderToHTML`, the store state is automatically serialized and embedded in the HTML:

```typescript
const html = renderToHTML(App, { store });
// HTML contains: <script id="__COMPOSABLE_SVELTE_STATE__" type="application/json">...</script>
```

### Automatic Deserialization

When you call `hydrateStore`, the state is automatically deserialized:

```typescript
const stateJSON = document.getElementById('__COMPOSABLE_SVELTE_STATE__')?.textContent;
const store = hydrateStore(stateJSON, { reducer, dependencies });
```

### Custom Serialization (Advanced)

For complex types (Date, Map, Set), provide custom serializers:

```typescript
import { serializeState, parseState } from '@composable-svelte/core/ssr';

// Server
const serialized = serializeState(store.state, {
  customSerializers: {
    Date: (date) => ({ __type: 'Date', value: date.toISOString() }),
    Map: (map) => ({ __type: 'Map', entries: Array.from(map.entries()) })
  }
});

// Client
const state = parseState(serialized, {
  customParsers: {
    Date: (obj) => new Date(obj.value),
    Map: (obj) => new Map(obj.entries)
  }
});
```

---

## STATE-DRIVEN META TAGS

### Pattern: Compute Meta Tags in Reducer

**Best Practice**: Meta tags should be computed from state in the reducer, then rendered via `<svelte:head>` in components.

```typescript
// State
interface AppState {
  posts: Post[];
  selectedPostId: number | null;
  meta: MetaTags;
}

interface MetaTags {
  title: string;
  description: string;
  ogImage?: string;
  canonical?: string;
}

// Reducer computes meta tags
case 'selectPost': {
  const post = state.posts.find(p => p.id === action.postId);

  return [
    {
      ...state,
      selectedPostId: action.postId,
      meta: post
        ? {
            title: `${post.title} - Blog`,
            description: post.content.slice(0, 160),
            ogImage: `/og/post-${post.id}.jpg`,
            canonical: `https://example.com/posts/${post.id}`
          }
        : state.meta
    },
    Effect.none()
  ];
}

// Component renders meta tags
<svelte:head>
  <title>{$store.meta.title}</title>
  <meta name="description" content={$store.meta.description} />
  {#if $store.meta.ogImage}
    <meta property="og:title" content={$store.meta.title} />
    <meta property="og:description" content={$store.meta.description} />
    <meta property="og:image" content={$store.meta.ogImage} />
  {/if}
  {#if $store.meta.canonical}
    <link rel="canonical" href={$store.meta.canonical} />
  {/if}
</svelte:head>
```

**Why**: Meta tags are part of application state. Computing them in the reducer ensures they're consistent on server and client, and testable with TestStore.

---

## COMPLETE SSR EXAMPLE

### Server (Fastify)

```typescript
// server/index.ts
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { createStore } from '@composable-svelte/core';
import { renderToHTML } from '@composable-svelte/core/ssr';
import App from '../shared/App.svelte';
import { appReducer } from '../shared/reducer';
import { initialState } from '../shared/types';
import { loadPosts } from './data';
import { parsePostFromURL } from '../shared/routing';

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
  }
});

// Serve static files (client bundle)
app.register(fastifyStatic, {
  root: join(__dirname, '../client'),
  prefix: '/assets/'
});

// Main SSR route handler
async function renderAppRoute(request: any, reply: any) {
  try {
    // 1. Parse URL using router (same logic as client!)
    const posts = await loadPosts();
    const path = request.url;
    const requestedPostId = parsePostFromURL(path, posts[0]?.id || 1);

    // Find the requested post
    const selectedPost = posts.find((p) => p.id === requestedPostId) || posts[0];

    // 2. Create store with URL-driven state
    const store = createStore({
      initialState: {
        ...initialState,
        posts,
        selectedPostId: selectedPost?.id || null,
        // Set initial meta based on URL-selected post
        meta: selectedPost
          ? {
              title: `${selectedPost.title} - Blog`,
              description: selectedPost.content.slice(0, 160),
              ogImage: `/og/post-${selectedPost.id}.jpg`,
              canonical: `https://example.com/posts/${selectedPost.id}`
            }
          : initialState.meta
      },
      reducer: appReducer,
      dependencies: {}
      // ssr.deferEffects defaults to true, so effects are automatically skipped
    });

    // 3. Render component to HTML
    const html = renderToHTML(App, { store }, {
      head: `
        <link rel="stylesheet" href="/assets/index.css">
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; }
        </style>
      `,
      clientScript: '/assets/index.js'
    });

    // 4. Send response
    reply.type('text/html').send(html);
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Register routes
app.get('/', renderAppRoute);
app.get('/posts/:id', renderAppRoute);

// Start server
const start = async () => {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });
    console.log(`Server running at http://localhost:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
```

### Client

```typescript
// client/index.ts
import { hydrate as hydrateComponent } from 'svelte';
import { hydrateStore } from '@composable-svelte/core/ssr';
import { syncBrowserHistory } from '@composable-svelte/core/routing';
import App from '../shared/App.svelte';
import { appReducer } from '../shared/reducer';
import type { AppDependencies, AppState, AppAction } from '../shared/types';
import { parserConfig, serializerConfig } from '../shared/routing';

// Client-side dependencies
const clientDependencies: AppDependencies = {
  fetchPosts: async () => {
    // In a real app, this would fetch from an API
    // For this example, we'll just return empty array
    // (the data is already loaded via SSR)
    return [];
  }
};

// Hydrate the application
function hydrate() {
  try {
    // 1. Read serialized state from the server
    const stateElement = document.getElementById('__COMPOSABLE_SVELTE_STATE__');

    if (!stateElement || !stateElement.textContent) {
      throw new Error('No hydration data found. Server-side rendering may have failed.');
    }

    // 2. Hydrate the store with client dependencies
    const store = hydrateStore<AppState, AppAction, AppDependencies>(
      stateElement.textContent,
      {
        reducer: appReducer,
        dependencies: clientDependencies
      }
    );

    // 3. Sync browser history with state (URL routing!)
    syncBrowserHistory(store, {
      serializers: serializerConfig.serializers,
      parsers: parserConfig.parsers,
      // Map state → destination for URL serialization
      getDestination: (state) => {
        if (state.selectedPostId !== null) {
          return { type: 'post' as const, state: { postId: state.selectedPostId } };
        }
        return null;
      },
      // Map destination → action for back/forward navigation
      destinationToAction: (dest) => {
        if (dest?.type === 'post') {
          return { type: 'selectPost', postId: dest.state.postId };
        }
        return null;
      }
    });

    // 4. Hydrate the app (reuse existing DOM from SSR)
    const app = hydrateComponent(App, {
      target: document.body,
      props: { store }
    });

    console.log('✅ Composable Svelte hydrated successfully with URL routing');

    // Cleanup on unmount (for HMR during development)
    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        app.$destroy?.();
      });
    }
  } catch (error) {
    console.error('❌ Hydration failed:', error);

    // Show error to user
    document.body.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #fee; color: #c00; font-family: monospace; padding: 2rem;">
        <div>
          <h1>Hydration Error</h1>
          <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      </div>
    `;
  }
}

// Start hydration when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hydrate);
} else {
  hydrate();
}
```

---

## AVOIDING STATE LEAKS

### ❌ WRONG - Shared Store

```typescript
// server.ts
// ❌ BAD: Shared store across requests
const globalStore = createStore({
  initialState: {},
  reducer: appReducer,
  dependencies: {}
});

app.get('/', (req, res) => {
  // ❌ State leaks between requests!
  const html = renderToHTML(App, { store: globalStore });
  res.send(html);
});
```

### ✅ CORRECT - Per-Request Store

```typescript
// server.ts
// ✅ GOOD: Create new store for each request
app.get('/', async (req, res) => {
  const store = createStore({
    initialState: await loadDataForRequest(req),
    reducer: appReducer,
    dependencies: {}
  });

  const html = renderToHTML(App, { store });
  res.send(html);
});
```

**Why**: Each request needs its own store to prevent state leaking between users.

---

## SSR PERFORMANCE CONSIDERATIONS

### 1. Defer Effects on Server

**Automatic**: Effects are automatically deferred on server (via `ssr.deferEffects: true` default).

```typescript
// No need to set this explicitly - it's the default
const store = createStore({
  initialState: data,
  reducer: appReducer,
  dependencies: {},
  // ssr: { deferEffects: true }  // Default
});
```

### 2. Load Data Once on Server

```typescript
app.get('/posts/:id', async (req, res) => {
  // Load data once
  const posts = await loadPosts();
  const postId = parseInt(req.params.id, 10);
  const selectedPost = posts.find(p => p.id === postId);

  // Initialize state with loaded data
  const store = createStore({
    initialState: {
      posts,  // Data already loaded
      selectedPostId: postId,
      meta: computeMeta(selectedPost)
    },
    reducer: appReducer,
    dependencies: {}
  });

  const html = renderToHTML(App, { store });
  res.send(html);
});
```

**Why**: Server pre-loads data, client hydrates with it. No need to fetch again on client.

---

## COMMON SSR PITFALLS

### 1. Using Browser APIs on Server

**❌ WRONG**:
```typescript
// reducer.ts
case 'init':
  const theme = localStorage.getItem('theme'); // ❌ localStorage not available on server!
  return [{ ...state, theme }, Effect.none()];
```

**✅ CORRECT**:
```typescript
// Use environment detection
import { isServer } from '@composable-svelte/core/ssr';

case 'init':
  const theme = isServer ? 'light' : localStorage.getItem('theme') || 'light';
  return [{ ...state, theme }, Effect.none()];
```

---

### 2. Not Handling Hydration Errors

**❌ WRONG**:
```typescript
// client.ts
const store = hydrateStore(stateJSON, { reducer, dependencies });
mount(App, { target: document.body, props: { store } });
// If hydration fails, user sees blank screen!
```

**✅ CORRECT**:
```typescript
try {
  const store = hydrateStore(stateJSON, { reducer, dependencies });
  mount(App, { target: document.body, props: { store } });
  console.log('✅ Hydrated successfully');
} catch (error) {
  console.error('❌ Hydration failed:', error);
  // Show error UI
  document.body.innerHTML = `<div class="error">Hydration failed: ${error.message}</div>`;
}
```

---

### 3. Forgetting to Set Meta Tags

**❌ WRONG**:
```typescript
// No meta tags in state, no <svelte:head> in component
// Search engines see generic meta tags
```

**✅ CORRECT**:
```typescript
// State includes meta tags
interface AppState {
  meta: { title: string; description: string; ogImage?: string };
}

// Component renders meta tags
<svelte:head>
  <title>{$store.meta.title}</title>
  <meta name="description" content={$store.meta.description} />
</svelte:head>
```

---

## SSR CHECKLIST

- [ ] 1. Create new store for each request (no shared state)
- [ ] 2. Use empty dependencies on server
- [ ] 3. Load data based on URL on server
- [ ] 4. Initialize state with loaded data
- [ ] 5. Compute meta tags in reducer
- [ ] 6. Render meta tags with `<svelte:head>`
- [ ] 7. Hydrate with real dependencies on client
- [ ] 8. Sync browser history on client (if using routing)
- [ ] 9. Handle hydration errors gracefully
- [ ] 10. Use environment detection for browser APIs

---

## SUMMARY

This skill covers SSR patterns for Composable Svelte:

1. **SSR APIs**: renderToHTML, hydrateStore
2. **Isomorphic Patterns**: Server vs client dependencies, router pure functions
3. **State Initialization**: Parse URL on server, initialize state
4. **State Serialization**: Automatic serialization/deserialization
5. **Meta Tags**: State-driven meta tags computed by reducer
6. **Complete Example**: Fastify server + client hydration with routing
7. **Avoiding Pitfalls**: Per-request stores, environment detection, error handling

**Remember**: Create new store for each request, use empty dependencies on server, hydrate with real dependencies on client.

For core architecture, see **composable-svelte-core** skill.
For URL routing, see **composable-svelte-navigation** skill.
For testing SSR, see **composable-svelte-testing** skill.
