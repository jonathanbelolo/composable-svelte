# Performance Optimization Guide

Strategies to optimize Composable Svelte SSR applications for production performance.

---

## Docker Build Optimization

### Multi-Stage Build Benefits

Our Dockerfile uses 3 stages for maximum efficiency:

```
Stage 1 (deps):     Install production deps    → Cached layer
Stage 2 (builder):  Build application         → Cached if source unchanged
Stage 3 (runner):   Copy artifacts only       → Minimal final image (<150MB)
```

### Layer Caching Strategy

```dockerfile
# ✅ GOOD: Copy package files first (changes rarely)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install

# ✅ THEN: Copy source code (changes frequently)
COPY src ./src
RUN pnpm build

# ❌ BAD: Copy everything at once (cache invalidated on any change)
COPY . .
RUN pnpm install && pnpm build
```

### Build Time Improvements

```bash
# Use BuildKit for parallel stage execution
DOCKER_BUILDKIT=1 docker build -t app .

# Use cache mounts (faster pnpm installs)
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
```

---

## Bundle Size Optimization

### Code Splitting

Vite automatically code-splits routes. For manual splitting:

```typescript
// Lazy load heavy components
const HeavyChart = lazy(() => import('./HeavyChart.svelte'));

// In component
{#if showChart}
  <Suspense fallback={<Spinner />}>
    <HeavyChart data={chartData} />
  </Suspense>
{/if}
```

### Tree Shaking

Ensure proper imports for tree-shaking:

```typescript
// ✅ GOOD: Named imports
import { createStore, Effect } from '@composable-svelte/core';

// ❌ BAD: Wildcard imports
import * as Core from '@composable-svelte/core';
```

### Bundle Analysis

```bash
# Build with analysis
vite build --mode analyze

# Check bundle sizes
ls -lh dist/assets/
```

**Target Sizes**:
- Initial JS: <100KB (gzipped)
- CSS: <50KB (gzipped)
- Total: <150KB (gzipped)

---

## Server-Side Rendering Optimization

### Caching Strategy

#### 1. Static Pages (SSG)

Generate at build time for blogs, documentation:

```typescript
// scripts/generate-static.ts
import { renderToHTML } from '@composable-svelte/core/ssr';

const staticRoutes = ['/about', '/docs', '/blog'];

for (const route of staticRoutes) {
  const html = await renderToHTML(App, { initialState, route });
  await fs.writeFile(`dist${route}/index.html`, html);
}
```

#### 2. Dynamic Pages (SSR with Cache)

Cache rendered HTML for frequently accessed pages:

```typescript
// Simple in-memory cache
const cache = new Map<string, { html: string; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute

app.get('*', async (request, reply) => {
  const cacheKey = request.url;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return reply.type('text/html').send(cached.html);
  }

  const html = await renderToHTML(/* ... */);
  cache.set(cacheKey, { html, timestamp: Date.now() });

  return reply.type('text/html').send(html);
});
```

#### 3. Redis Cache (Multi-Instance)

For multiple Fly instances, use Redis:

```typescript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

async function getCachedHTML(key: string) {
  return await redis.get(key);
}

async function setCachedHTML(key: string, html: string, ttl: number) {
  await redis.setex(key, ttl, html);
}
```

### Streaming SSR (Future)

Stream HTML as it's generated for faster TTFB:

```typescript
// Future: Streaming SSR support
app.get('*', async (request, reply) => {
  const stream = renderToStream(App, { initialState });
  reply.type('text/html').send(stream);
});
```

---

## API Performance

### Request Deduplication

Prevent duplicate API calls during SSR:

```typescript
// In your reducer
const pendingRequests = new Map<string, Promise<any>>();

case 'loadPosts': {
  const cacheKey = 'posts';

  if (pendingRequests.has(cacheKey)) {
    // Request already in-flight, wait for it
    const promise = pendingRequests.get(cacheKey)!;
    return [state, Effect.run(async (dispatch) => {
      const posts = await promise;
      dispatch({ type: 'postsLoaded', posts });
    })];
  }

  // New request
  const promise = deps.apiClient.get('/api/posts');
  pendingRequests.set(cacheKey, promise);

  return [
    { ...state, loading: true },
    Effect.run(async (dispatch) => {
      try {
        const response = await promise;
        pendingRequests.delete(cacheKey);
        dispatch({ type: 'postsLoaded', posts: response.data });
      } catch (error) {
        pendingRequests.delete(cacheKey);
        dispatch({ type: 'postsLoadFailed', error });
      }
    })
  ];
}
```

### Parallel Data Fetching

Fetch independent data in parallel:

```typescript
case 'pageLoaded': {
  return [
    state,
    Effect.batch(
      // These run in parallel
      Effect.run(async (d) => {
        const posts = await deps.apiClient.get('/api/posts');
        d({ type: 'postsLoaded', posts: posts.data });
      }),
      Effect.run(async (d) => {
        const user = await deps.apiClient.get('/api/user');
        d({ type: 'userLoaded', user: user.data });
      })
    )
  ];
}
```

---

## Network Optimization

### Compression

Enable compression in Fastify:

```typescript
import compress from '@fastify/compress';

app.register(compress, {
  global: true,
  threshold: 1024, // Min size to compress (1KB)
  encodings: ['gzip', 'deflate', 'br'] // Brotli for best compression
});
```

### HTTP/2

Fly.io automatically provides HTTP/2 at the edge.

### Static Asset CDN

Serve static assets from CDN:

```typescript
// vite.config.ts
export default {
  build: {
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name].[hash][extname]'
      }
    }
  }
};
```

Then serve from Cloudflare CDN:

```typescript
// In HTML template
const CDN_URL = process.env.CDN_URL || '/assets';

`<link rel="stylesheet" href="${CDN_URL}/main.${hash}.css">`
```

---

## Database Optimization

### Connection Pooling

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Max connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});
```

### Query Optimization

```typescript
// ✅ GOOD: Select only needed fields
SELECT id, title, created_at FROM posts;

// ❌ BAD: Select all fields
SELECT * FROM posts;

// ✅ GOOD: Add indexes
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
```

---

## Monitoring Performance

### Web Vitals

Track Core Web Vitals client-side:

```typescript
// src/client/vitals.ts
import { onCLS, onFID, onLCP } from 'web-vitals';

function sendToAnalytics(metric) {
  fetch('/api/vitals', {
    method: 'POST',
    body: JSON.stringify(metric)
  });
}

onCLS(sendToAnalytics);
onFID(sendToAnalytics);
onLCP(sendToAnalytics);
```

### Server Metrics

```typescript
// Track SSR render time
const startTime = Date.now();
const html = await renderToHTML(App, { initialState });
const renderTime = Date.now() - startTime;

// Log slow renders
if (renderTime > 100) {
  console.warn(`Slow SSR render: ${renderTime}ms for ${request.url}`);
}
```

---

## Performance Targets

| Metric | Target | Excellent |
|--------|--------|-----------|
| Docker image size | <150MB | <100MB |
| Initial JS bundle | <100KB (gzipped) | <70KB |
| Time to First Byte (TTFB) | <200ms | <100ms |
| First Contentful Paint (FCP) | <1.8s | <1.0s |
| Largest Contentful Paint (LCP) | <2.5s | <1.5s |
| Time to Interactive (TTI) | <3.8s | <2.5s |
| Cumulative Layout Shift (CLS) | <0.1 | <0.05 |

---

## Profiling Tools

```bash
# Node.js profiling
node --inspect dist/server/index.js

# Chrome DevTools: chrome://inspect

# Heap snapshot
node --heap-prof dist/server/index.js

# CPU profile
node --cpu-prof dist/server/index.js
```

---

## Checklist

- [ ] Multi-stage Dockerfile (<150MB)
- [ ] Code splitting enabled
- [ ] Tree shaking working
- [ ] SSR caching implemented
- [ ] API request deduplication
- [ ] Compression enabled (Brotli)
- [ ] Static assets on CDN
- [ ] Database connection pooling
- [ ] Monitoring/metrics setup
- [ ] Performance targets met

---

**Next**: Review [SECURITY.md](./SECURITY.md) for security hardening.
