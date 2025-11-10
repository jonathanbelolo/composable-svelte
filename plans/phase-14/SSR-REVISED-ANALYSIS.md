# SSR for Composable Svelte - Revised Analysis

**Date**: 2025-01-10
**Context**: User feedback on SvelteKit integration approach

---

## Key Insight from User

> "In SvelteKit, I'm not sure we need a load function integration because the way we load data with our Composable Svelte is more controlled. And also, the way we do routing is completely different. So I guess the only thing that could be valuable from SvelteKit is the rendering logic, in a sense actually generating the preview files, HTML that will be delivered statically."

---

## Architecture Reality Check

### What Composable Svelte Already Has

1. **Custom Routing System** (Phase 7)
   - Framework-agnostic (uses browser History API)
   - State-first (URL is serialization of state)
   - Pure functions for serialization/parsing
   - `serializeDestination()`, `parseDestination()`, `matchPath()`
   - `createInitialStateFromURL()` for deep linking

2. **Data Loading Pattern**
   - Data fetching happens **in reducers via effects**
   - No separate "load function" layer
   - Effects describe what to load, store executes them

3. **State Management**
   - Fully controlled by store/reducer pattern
   - State is source of truth, not URL or framework

### What SvelteKit Provides

1. **File-Based Routing** - ❌ Not needed (have custom routing)
2. **Load Functions** - ❌ Not needed (data loading in effects)
3. **Server Rendering** - ✅ **This is what we need**
4. **Build Tools** - ✅ Helpful but not required
5. **Adapters** - ✅ Nice for deployment but not core

---

## What SSR Actually Means Here

### Traditional SvelteKit SSR Flow

```
Request → Load Function → Fetch Data → Render Component → Send HTML
```

### Composable Svelte SSR Flow

```
Request → Parse URL to Initial State → Create Store → Render Component → Send HTML + State
```

**Key Difference**: No load function, initial state comes from URL parsing!

---

## The Real Requirements

For Composable Svelte SSR, we actually need:

1. **URL-to-State Conversion**
   - ✅ Already have: `createInitialStateFromURL()`
   - Parse incoming URL to initial destination state

2. **Server-Side Rendering**
   - ❌ Need: Svelte's `render()` function
   - Convert component to HTML string

3. **State Serialization**
   - ❌ Need: Serialize store state to JSON
   - Send state to client for hydration

4. **Client Hydration**
   - ❌ Need: Restore store from serialized state
   - Re-run effects on client

5. **Static Site Generation** (Optional)
   - Build-time rendering for known URLs
   - Generate HTML files at build time

---

## Revised SSR Approaches

### Option 1: Svelte SSR Only (No Framework)

**Concept**: Use Svelte's built-in server rendering without any framework.

```typescript
// server.ts
import { render } from 'svelte/server';
import App from './App.svelte';
import { createStore } from '@composable-svelte/core';
import { createInitialStateFromURL } from '@composable-svelte/core/routing';

export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // 1. Parse URL to initial state (using existing routing system)
  const initialState = createInitialStateFromURL(url.pathname, routeConfig);

  // 2. Create store with initial state
  const store = createStore({
    initialState,
    reducer,
    dependencies: serverDependencies,
    ssr: { deferEffects: true }  // Skip effects on server
  });

  // 3. Render component to HTML
  const { html, head } = render(App, {
    props: { store }
  });

  // 4. Serialize state for client
  const hydrationData = {
    state: store.state,
    timestamp: Date.now()
  };

  // 5. Build complete HTML
  const fullHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        ${head}
      </head>
      <body>
        ${html}
        <script id="__COMPOSABLE_SVELTE_STATE__" type="application/json">
          ${JSON.stringify(hydrationData)}
        </script>
        <script type="module" src="/app.js"></script>
      </body>
    </html>
  `;

  return new Response(fullHTML, {
    headers: { 'Content-Type': 'text/html' }
  });
}
```

**Pros**:
- ✅ No framework dependency
- ✅ Full control over rendering
- ✅ Uses existing routing system
- ✅ Minimal complexity

**Cons**:
- ❌ Need custom server setup
- ❌ No dev server hot reload
- ❌ Manual build tooling
- ❌ No deployment adapters

### Option 2: SvelteKit for Infrastructure Only

**Concept**: Use SvelteKit's dev server and build tools, but bypass its routing/loading.

```typescript
// src/routes/[...path]/+page.server.ts
import { error } from '@sveltejs/kit';
import { createInitialStateFromURL } from '@composable-svelte/core/routing';

export async function load({ params }) {
  const path = `/${params.path || ''}`;

  // Parse URL using OUR routing system
  const initialState = createInitialStateFromURL(path, routeConfig);

  if (!initialState) {
    throw error(404, 'Not found');
  }

  return {
    initialState
  };
}
```

```svelte
<!-- src/routes/[...path]/+page.svelte -->
<script lang="ts">
  import { browser } from '$app/environment';
  import { createStore } from '@composable-svelte/core';
  import App from '$lib/App.svelte';

  export let data;

  const store = browser
    ? hydrateStore(data.initialState)
    : createServerStore(data.initialState);
</script>

<App {store} />
```

**Pros**:
- ✅ Get SvelteKit's dev server
- ✅ Get hot module reload
- ✅ Get adapters (Vercel, Netlify, etc.)
- ✅ Still use our routing system

**Cons**:
- ❌ Overkill if just need rendering
- ❌ SvelteKit dependency
- ❌ Catch-all route feels like a hack

### Option 3: Vite + Custom SSR Plugin

**Concept**: Use Vite with a custom plugin for SSR.

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { composableSvelteSSR } from '@composable-svelte/vite-plugin-ssr';

export default defineConfig({
  plugins: [
    svelte(),
    composableSvelteSSR({
      // List of routes to pre-render
      routes: [
        '/',
        '/about',
        '/blog/*'  // Wildcard for dynamic routes
      ],
      // How to get initial state for each route
      getInitialState: (path) => {
        return createInitialStateFromURL(path, routeConfig);
      }
    })
  ]
});
```

**Pros**:
- ✅ Full control
- ✅ No SvelteKit dependency
- ✅ Can use existing Vite setup
- ✅ Custom to our needs

**Cons**:
- ❌ Need to build the plugin
- ❌ More maintenance burden

---

## Data Loading Challenge

### The Core Problem

In Composable Svelte, data fetching happens through **effects in reducers**:

```typescript
case 'loadItems': {
  return [
    { ...state, isLoading: true },
    Effect.run(async (dispatch) => {
      const items = await api.fetch('/items');
      dispatch({ type: 'itemsLoaded', items });
    })
  ];
}
```

**Problem**: On server, we skip effects (`deferEffects: true`), so data never loads!

**Question**: How do we get initial data into server-rendered HTML?

### Solution 1: Server Executes Safe Effects

Mark data-fetching effects as server-safe:

```typescript
case 'loadItems': {
  return [
    { ...state, isLoading: true },
    Effect.runServer(async (dispatch) => {  // Server-safe
      const items = await serverAPI.fetch('/items');
      dispatch({ type: 'itemsLoaded', items });
    })
  ];
}
```

**Flow**:
1. Server creates store
2. Server dispatches `{ type: 'loadItems' }`
3. Effect executes (marked server-safe)
4. State updated with data
5. Render with data in HTML

**Challenge**: Need to wait for async effect to complete before rendering!

```typescript
// Server needs to wait for effects
const store = createStore({ ... });

// Dispatch and wait
await new Promise(resolve => {
  store.dispatch({ type: 'loadItems' });

  // Wait for state to have data
  const unsub = store.subscribe(state => {
    if (state.items.length > 0 && !state.isLoading) {
      unsub();
      resolve();
    }
  });
});

// Now render with data
const { html } = render(App, { props: { store } });
```

### Solution 2: Pre-populate Initial State

Load data **before** creating store:

```typescript
// server.ts
export async function handleRequest(request: Request) {
  const url = new URL(request.url);

  // 1. Load data BEFORE creating store
  const items = await serverAPI.fetch('/items');

  // 2. Create store with pre-populated data
  const store = createStore({
    initialState: {
      items,  // Data already loaded!
      isLoading: false
    },
    reducer,
    ssr: { deferEffects: true }
  });

  // 3. Render (data is already there)
  const { html } = render(App, { props: { store } });
}
```

**Pros**:
- ✅ Simple - no effect waiting
- ✅ Fast - no store overhead for data
- ✅ Predictable - synchronous

**Cons**:
- ❌ Duplicate logic (load in server AND in effect)
- ❌ Doesn't use reducer for data loading

### Solution 3: Deferred Data Loading (Client-Only)

Don't load data on server, let client handle it:

```typescript
// Server: Render with empty state
const store = createStore({
  initialState: {
    items: [],  // Empty
    isLoading: false
  },
  reducer,
  ssr: { deferEffects: true }
});

// Client: Re-dispatch to load data
onMount(() => {
  store.dispatch({ type: 'loadItems' });
});
```

**Pros**:
- ✅ Simple server code
- ✅ Uses existing effect pattern
- ✅ No duplication

**Cons**:
- ❌ No data in initial HTML (bad for SEO)
- ❌ Client sees loading state briefly
- ❌ Flash of empty content

---

## Static Site Generation (SSG)

### What SSG Means

**Concept**: Render HTML files at **build time**, not request time.

```
Build Time: URL → Initial State → Render → Write HTML file
Request Time: Serve pre-rendered HTML file
```

### How It Works with Composable Svelte

```typescript
// build-ssr.ts
import { render } from 'svelte/server';
import { writeFileSync } from 'fs';

const routes = [
  { path: '/', component: Home },
  { path: '/about', component: About },
  { path: '/blog/post-1', component: BlogPost }
];

for (const route of routes) {
  // 1. Get initial state for route
  const initialState = createInitialStateFromURL(route.path, routeConfig);

  // 2. Create store
  const store = createStore({
    initialState,
    reducer,
    ssr: { deferEffects: true }
  });

  // 3. Render component
  const { html, head } = render(route.component, {
    props: { store }
  });

  // 4. Write HTML file
  const fullHTML = buildFullHTML(html, head, store.state);
  writeFileSync(`dist${route.path}/index.html`, fullHTML);
}
```

### SSG for Dynamic Routes

**Challenge**: Blog posts, product pages, etc. - can't hardcode all URLs.

**Solution**: Generate routes from data source:

```typescript
// Get all blog post slugs
const posts = await api.fetchAllPosts();

const routes = posts.map(post => ({
  path: `/blog/${post.slug}`,
  component: BlogPost,
  props: { post }
}));

// Render each one
for (const route of routes) {
  // ... render logic
}
```

---

## Recommendations

### For SSR (Server-Side Rendering)

**Use**: **Svelte SSR + Custom Server** (Option 1)

**Why**:
- You don't need SvelteKit's routing (have your own)
- You don't need load functions (data in effects)
- You just need rendering capability
- Gives maximum control

**Implementation**:
1. Create simple Node.js server (Express, Fastify, or plain http)
2. Use `svelte/server` for rendering
3. Use your routing system to parse URLs
4. Serialize state, send to client
5. Client hydrates with existing logic

### For SSG (Static Site Generation)

**Use**: **Vite Plugin** or **Custom Build Script** (Option 3)

**Why**:
- Need build-time rendering
- Want integration with existing Vite setup
- Can be simple Node script

**Implementation**:
1. Create build script that:
   - Lists all routes
   - Renders each to HTML
   - Writes files to `dist/`
2. Use Vite for client-side bundle
3. Deploy `dist/` to static host (Netlify, Vercel, etc.)

### For Data Loading on Server

**Use**: **Solution 2 (Pre-populate Initial State)**

**Why**:
- Simplest for SSR/SSG
- No async effect waiting
- Data in initial HTML (SEO benefit)

**Trade-off**: Some duplication between server data loading and client effects

---

## Revised Phase 14 Scope

Based on this analysis, Phase 14 should focus on:

### Core Features

1. ✅ **State Serialization/Hydration**
   - `serializeStore(store)` → JSON string
   - `hydrateStore(data, config)` → Store

2. ✅ **Effect Deferral**
   - Skip effects on server by default
   - Optional: Mark effects as server-safe

3. ✅ **Server-Safe Dependencies**
   - `createNoOpStorage()` for server
   - `createServerAPI()` for Node.js fetch

4. ✅ **Rendering Helpers**
   - Wrapper around `svelte/server` render
   - Build full HTML with hydration script

### Example Implementations

5. ✅ **Simple SSR Server** (Express example)
6. ✅ **SSG Build Script** (Node.js script)
7. ✅ **Documentation** (how to set up your own)

### Out of Scope (For Now)

- ❌ SvelteKit integration
- ❌ Custom framework
- ❌ Advanced routing features
- ❌ Streaming SSR

---

## Next Steps

1. **Validate Approach**: Confirm this aligns with your vision
2. **Create Prototype**: Build simple SSR server example
3. **Test Rendering**: Verify Svelte `render()` works with stores
4. **Measure Performance**: Ensure rendering is fast enough
5. **Document Pattern**: Write guide for users

---

## Open Questions

1. **Data Loading**: Should we support server-safe effects, or always pre-populate?
2. **Build Tools**: Do you want any build tooling, or just documentation?
3. **Deployment**: What hosting platforms are you targeting?
4. **Dynamic Routes**: How should SSG handle dynamic routes (blog posts, products)?
5. **API Compatibility**: Should server API client be separate package?

---

## Conclusion

You were right - SvelteKit's load functions and file-based routing don't fit your architecture. What you actually need is:

1. **Svelte's rendering engine** (`svelte/server`)
2. **State serialization** (new code)
3. **Your existing routing system** (already have it!)
4. **Simple server setup** (minimal framework)

This is actually **simpler** than the original plan - less framework overhead, more control, and better alignment with Composable Architecture principles.
