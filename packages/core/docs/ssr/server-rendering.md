# Server-Side Rendering (SSR) & Static Site Generation (SSG)

Composable Svelte supports both Server-Side Rendering (SSR) and Static Site Generation (SSG) with full state hydration.

## Overview

- **SSR**: Render pages on-demand for each request
- **SSG**: Pre-render pages at build time for static hosting
- **Hydration**: Seamlessly rehydrate server-rendered HTML on the client
- **State Serialization**: Automatic JSON serialization of app state
- **Isomorphic**: Same code runs on server and client

## When to Use What

| Scenario | Recommendation | Reason |
|----------|----------------|--------|
| Blog posts, docs | **SSG** | Content rarely changes, many reads |
| User dashboards | **SSR** | Personalized, private data |
| Product catalog | **SSG** | Public, static content |
| Search results | **SSR** | Dynamic, user-specific |
| Marketing pages | **SSG** | Static, performance-critical |
| Admin panels | **SSR** | Dynamic, authenticated |

## SSR (Server-Side Rendering)

### Quick Start

**1. Install Dependencies**:

```bash
pnpm add fastify @fastify/static
pnpm add -D vite
```

**2. Create Server** (`src/server/index.ts`):

```typescript
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { createStore } from '@composable-svelte/core';
import { renderToHTML } from '@composable-svelte/core/ssr';
import App from '../shared/App.svelte';
import { appReducer } from '../shared/reducer';
import { initialState } from '../shared/types';

const fastify = Fastify({ logger: true });

// Serve static assets (CSS, JS)
fastify.register(fastifyStatic, {
  root: join(__dirname, '../client'),
  prefix: '/assets/'
});

// SSR route handler
fastify.get('*', async (request, reply) => {
  // 1. Create new store for each request
  const store = createStore({
    initialState,
    reducer: appReducer,
    dependencies: {} // Server dependencies
  });

  // 2. Render to HTML with state
  const html = renderToHTML(App, { store });

  // 3. Send response
  reply.type('text/html').send(html);
});

// Start server
fastify.listen({ port: 3000 }, (err, address) => {
  if (err) throw err;
  console.log(`Server listening on ${address}`);
});
```

**3. Create Client** (`src/client/index.ts`):

```typescript
import { hydrate as hydrateComponent } from 'svelte';
import { hydrateStore } from '@composable-svelte/core/ssr';
import App from '../shared/App.svelte';
import { appReducer } from '../shared/reducer';

// Hydrate on client
function hydrate() {
  const stateElement = document.getElementById('__COMPOSABLE_SVELTE_STATE__');

  if (!stateElement) {
    throw new Error('No hydration data found');
  }

  // Hydrate store with real client dependencies
  const store = hydrateStore(stateElement.textContent, {
    reducer: appReducer,
    dependencies: {
      // Client dependencies (real implementations)
      fetchData: async () => fetch('/api/data').then(r => r.json())
    }
  });

  // Hydrate component
  hydrateComponent(App, {
    target: document.body,
    props: { store }
  });
}

hydrate();
```

**4. Build Configuration** (`vite.config.ts`):

```typescript
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  build: {
    rollupOptions: {
      input: {
        client: 'src/client/index.ts',
        server: 'src/server/index.ts'
      },
      output: {
        entryFileNames: '[name]/index.js'
      }
    }
  }
});
```

### SSR with Data Loading

Load data on the server before rendering:

```typescript
fastify.get('/posts/:id', async (request, reply) => {
  const { id } = request.params;

  // Load data on server
  const post = await loadPost(id);
  const comments = await loadComments(id);

  // Create store with loaded data
  const store = createStore({
    initialState: {
      ...initialState,
      post,
      comments,
      isLoading: false
    },
    reducer: appReducer,
    dependencies: {}
  });

  const html = renderToHTML(App, { store });
  reply.type('text/html').send(html);
});
```

### SSR with URL Routing

Parse URL and set initial state:

```typescript
import { parseDestinationFromURL } from '../shared/routing';

fastify.get('*', async (request, reply) => {
  // Parse URL to destination
  const destination = parseDestinationFromURL(request.url);

  // Load data based on destination
  let data = {};
  if (destination.type === 'post') {
    data = await loadPost(destination.state.postId);
  }

  const store = createStore({
    initialState: {
      ...initialState,
      destination,
      ...data
    },
    reducer: appReducer,
    dependencies: {}
  });

  const html = renderToHTML(App, { store });
  reply.send(html);
});
```

### SSR with i18n

Detect locale from request and preload translations:

```typescript
import {
  createInitialI18nState,
  BundledTranslationLoader,
  createStaticLocaleDetector,
  serverDOM
} from '@composable-svelte/core/i18n';

function detectLocale(request: any): string {
  // 1. Check query param (?lang=fr)
  const queryLang = request.query?.lang;
  if (queryLang && ['en', 'fr', 'es'].includes(queryLang)) {
    return queryLang;
  }

  // 2. Check Accept-Language header
  const acceptLanguage = request.headers?.['accept-language'];
  if (acceptLanguage) {
    const languages = acceptLanguage.split(',')
      .map(lang => lang.trim().split(';')[0].split('-')[0]);

    for (const lang of languages) {
      if (['en', 'fr', 'es'].includes(lang)) {
        return lang;
      }
    }
  }

  // 3. Default
  return 'en';
}

fastify.get('*', async (request, reply) => {
  const locale = detectLocale(request);
  const i18nState = createInitialI18nState(locale, ['en', 'fr', 'es'], 'en');

  const translationLoader = new BundledTranslationLoader({
    bundles: {
      en: { common: enTranslations },
      fr: { common: frTranslations },
      es: { common: esTranslations }
    }
  });

  // Preload translations
  const translations = await translationLoader.load('common', locale);
  const updatedI18nState = {
    ...i18nState,
    translations: { [`${locale}:common`]: translations }
  };

  const store = createStore({
    initialState: {
      ...initialState,
      i18n: updatedI18nState
    },
    reducer: appReducer,
    dependencies: {
      translationLoader,
      localeDetector: createStaticLocaleDetector(locale, ['en', 'fr', 'es']),
      storage: mockStorage, // No-op on server
      dom: serverDOM
    }
  });

  const html = renderToHTML(App, { store });
  reply.send(html);
});
```

## SSG (Static Site Generation)

### Quick Start

**1. Create Build Script** (`src/build/ssg.ts`):

```typescript
import { generateStaticSite } from '@composable-svelte/core/ssr';
import App from '../shared/App.svelte';
import { appReducer } from '../shared/reducer';
import { loadPosts } from '../server/data';

async function build() {
  console.log('Starting SSG build...');

  const posts = await loadPosts();

  const result = await generateStaticSite(App, {
    routes: [
      { path: '/' },
      { path: '/about' },
      {
        path: '/posts/:id',
        paths: posts.map(p => `/posts/${p.id}`),
        getServerProps: async (path) => {
          const id = parseInt(path.split('/').pop()!);
          const post = await loadPost(id);
          return { post };
        }
      }
    ],
    outDir: './static',
    baseURL: 'https://example.com',
    onPageGenerated: (path, outPath) => {
      console.log(`✓ ${path} → ${outPath}`);
    }
  }, {
    reducer: appReducer,
    dependencies: {}
  });

  console.log(`✅ Generated ${result.pagesGenerated} pages in ${result.duration}ms`);
}

build().catch(console.error);
```

**2. Add Build Script** (`package.json`):

```json
{
  "scripts": {
    "build:ssg": "vite build && tsx src/build/ssg.ts"
  }
}
```

**3. Run Build**:

```bash
pnpm build:ssg
```

**Result**:

```
static/
├── index.html
├── about/
│   └── index.html
├── posts/
│   ├── 1/
│   │   └── index.html
│   ├── 2/
│   │   └── index.html
│   └── 3/
│       └── index.html
└── assets/
    ├── index.css
    └── index.js
```

### SSG with Dynamic Routes

Generate multiple pages from a single route pattern:

```typescript
await generateStaticSite(App, {
  routes: [
    {
      path: '/posts/:id',
      // Specify all paths to generate
      paths: ['/posts/1', '/posts/2', '/posts/3'],
      getServerProps: async (path) => {
        const id = parseInt(path.split('/').pop()!);
        const post = await loadPost(id);
        return { post };
      }
    }
  ],
  outDir: './static'
}, { reducer: appReducer, dependencies: {} });
```

### SSG with i18n (Multi-Locale)

Generate static pages for each locale:

```typescript
const supportedLocales = ['en', 'fr', 'es'];
const posts = await loadPosts();
const routes = [];

for (const locale of supportedLocales) {
  const localePrefix = locale === 'en' ? '' : `/${locale}`;

  // Home page
  routes.push({
    path: `${localePrefix}/`,
    getServerProps: async () => {
      const i18nState = await initI18n(locale);
      return { ...initialState, i18n: i18nState };
    }
  });

  // Post pages
  for (const post of posts) {
    routes.push({
      path: `${localePrefix}/posts/${post.id}`,
      getServerProps: async () => {
        const i18nState = await initI18n(locale);
        const postData = await loadPost(post.id);
        return { ...initialState, post: postData, i18n: i18nState };
      }
    });
  }
}

await generateStaticSite(App, { routes, outDir: './static' }, { reducer: appReducer });
```

**Result**:

```
static/
├── index.html           (English)
├── fr/
│   └── index.html       (French)
├── es/
│   └── index.html       (Spanish)
├── posts/
│   └── 1/
│       └── index.html   (English)
├── fr/
│   └── posts/
│       └── 1/
│           └── index.html (French)
└── es/
    └── posts/
        └── 1/
            └── index.html (Spanish)
```

### SSG with Assets

Copy CSS and JavaScript to static folder:

```typescript
import { cp, mkdir } from 'fs/promises';
import { join } from 'path';

async function build() {
  const staticDir = join(__dirname, '../../static');
  const clientDir = join(__dirname, '../../dist/client');
  const assetsDir = join(staticDir, 'assets');

  // Copy assets
  await mkdir(assetsDir, { recursive: true });
  await cp(join(clientDir, 'index.css'), join(assetsDir, 'index.css'));
  await cp(join(clientDir, 'index.js'), join(assetsDir, 'index.js'));

  // Generate pages
  await generateStaticSite(App, {
    routes: [/* ... */],
    outDir: staticDir,
    renderOptions: {
      head: '<link rel="stylesheet" href="/assets/index.css">',
      clientScript: '/assets/index.js'
    }
  }, { reducer: appReducer, dependencies: {} });
}
```

## Hybrid SSG + SSR

Combine static generation with server-side fallback:

**1. Generate static pages at build time**:

```bash
pnpm build:ssg  # Generates static HTML
```

**2. Serve static files first, SSR as fallback**:

```typescript
import { existsSync } from 'fs';
import { join } from 'path';

fastify.get('*', async (request, reply) => {
  // Try static file first
  const staticPath = join(__dirname, '../static', request.url, 'index.html');

  if (existsSync(staticPath)) {
    return reply.sendFile(staticPath);
  }

  // Fallback to SSR for dynamic routes
  const store = createStore({ /* ... */ });
  const html = renderToHTML(App, { store });
  reply.send(html);
});
```

**Use Cases**:
- Static pages: Blog posts, marketing pages
- Dynamic pages: User dashboards, search results
- Best of both worlds: Fast static pages + dynamic content

## Security Hardening

### Rate Limiting

```typescript
import { fastifyRateLimit } from '@composable-svelte/core/ssr';

fastify.register(fastifyRateLimit, {
  max: 100,             // 100 requests
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded'
  })
});
```

### Security Headers

```typescript
import { fastifySecurityHeaders } from '@composable-svelte/core/ssr';

fastify.register(fastifySecurityHeaders, {
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"]
  },
  xFrameOptions: 'DENY',
  xContentTypeOptions: 'nosniff'
});
```

## Performance Optimization

### 1. Per-Request Stores

```typescript
// ✅ GOOD: New store for each request
fastify.get('*', async (request, reply) => {
  const store = createStore({ /* ... */ });
  const html = renderToHTML(App, { store });
  reply.send(html);
});

// ❌ BAD: Shared store across requests
const globalStore = createStore({ /* ... */ });

fastify.get('*', async (request, reply) => {
  const html = renderToHTML(App, { store: globalStore });
  reply.send(html);
});
```

### 2. Defer Effects on Server

```typescript
// ✅ GOOD: Skip effects on server
const store = createStore({
  initialState,
  reducer: appReducer,
  dependencies: {},
  deferEffects: true // Don't execute effects on server
});
```

### 3. Preload Critical Data

```typescript
// ✅ GOOD: Load data before rendering
const data = await loadData();
const store = createStore({
  initialState: { ...initialState, data },
  reducer: appReducer,
  dependencies: {}
});
```

### 4. Cache Rendered Pages

```typescript
const cache = new Map<string, string>();

fastify.get('*', async (request, reply) => {
  const cacheKey = request.url;

  // Check cache
  if (cache.has(cacheKey)) {
    return reply.type('text/html').send(cache.get(cacheKey));
  }

  // Render and cache
  const store = createStore({ /* ... */ });
  const html = renderToHTML(App, { store });
  cache.set(cacheKey, html);

  reply.type('text/html').send(html);
});
```

## Troubleshooting

### Hydration Mismatch

**Problem**: Server and client render different content.

**Solution**: Ensure consistent state:

```typescript
// Server: Set isLoading: false (data already loaded)
const store = createStore({
  initialState: { data, isLoading: false },
  reducer: appReducer,
  dependencies: {}
});

// Client: Hydrate with same state
const store = hydrateStore(serializedState, {
  reducer: appReducer,
  dependencies: clientDeps
});
```

### Effects Running on Server

**Problem**: Effects execute during SSR causing errors.

**Solution**: Use `deferEffects`:

```typescript
const store = createStore({
  initialState,
  reducer: appReducer,
  dependencies: {},
  deferEffects: true // Skip effects on server
});
```

### Missing State Script

**Problem**: `document.getElementById('__COMPOSABLE_SVELTE_STATE__')` returns null.

**Solution**: Ensure `renderToHTML` includes state:

```typescript
const html = renderToHTML(App, {
  store,
  includeState: true // Default: true
});
```

### Build Errors with Node.js Modules

**Problem**: Cannot use `fs`, `path` in client build.

**Solution**: Mark as external in Vite config:

```typescript
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['fs/promises', 'path', 'url']
    }
  }
});
```

## API Reference

### SSR Functions

```typescript
// Render component to HTML string
renderToHTML(
  component: SvelteComponent,
  props: { store: Store<S, A> },
  options?: {
    includeState?: boolean;      // Default: true
    head?: string;                // Additional <head> content
    clientScript?: string;        // Path to client JS
  }
): string

// Hydrate store on client
hydrateStore<S, A, D>(
  serializedState: string,
  config: {
    reducer: Reducer<S, A, D>;
    dependencies: D;
  }
): Store<S, A>
```

### SSG Functions

```typescript
// Generate static site
generateStaticSite(
  component: SvelteComponent,
  config: {
    routes: RouteConfig[];
    outDir: string;
    baseURL?: string;
    onPageGenerated?: (path: string, outPath: string) => void;
    renderOptions?: RenderOptions;
  },
  storeConfig: {
    reducer: Reducer<S, A, D>;
    dependencies: D;
    getInitialState?: (path: string) => S;
  }
): Promise<{ pagesGenerated: number; duration: number }>

// Generate single page
generateStaticPage(
  component: SvelteComponent,
  path: string,
  outDir: string,
  storeConfig: StoreConfig<S, A, D>
): Promise<string>
```

### Route Configuration

```typescript
interface RouteConfig {
  path: string;                           // Route pattern
  paths?: string[] | (() => Promise<string[]>); // Paths to generate
  getServerProps?: (path: string) => Promise<Partial<S>>; // Load data
}
```

## Examples

### Complete SSR Example

See [examples/ssr-server](../../../examples/ssr-server/) for:
- Fastify server with SSR
- Multi-locale support (en/fr/es)
- URL routing integration
- Client-side hydration
- SSG build script

### Complete SSG Example

See [examples/ssr-server/src/build/ssg.ts](../../../examples/ssr-server/src/build/ssg.ts) for:
- Static site generation
- Multi-locale pages (33 HTML files)
- Dynamic route enumeration
- Asset copying

## Next Steps

- **[Internationalization](../i18n/internationalization.md)** - Multi-locale SSR/SSG
- **[URL Routing](../routing/url-sync.md)** - Browser history sync
- **[Testing SSR](../core-concepts/testing.md#testing-ssr)** - Test server rendering
- **[Deployment](#)** - Deploy SSR/SSG apps

## Resources

- [Svelte SSR Guide](https://svelte.dev/docs/server-side-component-api)
- [Fastify Documentation](https://www.fastify.io/)
- [Vite SSR Guide](https://vitejs.dev/guide/ssr.html)
