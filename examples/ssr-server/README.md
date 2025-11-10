# SSR Server Example

A complete example of **Server-Side Rendering** with Composable Svelte and Fastify.

This example demonstrates:
- ✅ Server-side rendering with Fastify
- ✅ Client-side hydration
- ✅ Data loading on the server
- ✅ Automatic effect deferral
- ✅ Production-ready patterns

## 📁 Project Structure

```
ssr-server/
├── src/
│   ├── server/
│   │   ├── index.ts       # Fastify server with SSR
│   │   └── data.ts        # Mock data loading
│   ├── client/
│   │   └── index.ts       # Client hydration entry point
│   └── shared/
│       ├── App.svelte     # Main application component
│       ├── PostList.svelte
│       ├── PostDetail.svelte
│       ├── types.ts       # Shared types
│       └── reducer.ts     # Application reducer
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Development Mode

```bash
pnpm dev
```

This starts the server with hot-reload enabled. Open http://localhost:3000

### 3. Production Build

```bash
# Build both client and server
pnpm build

# Start production server
pnpm start
```

## 📚 How It Works

### Server-Side Rendering (server/index.ts)

The server follows this flow:

```typescript
// 1. Load data on the server
const posts = await loadPosts();

// 2. Create store with pre-populated data
const store = createStore({
  initialState: { posts, ... },
  reducer: appReducer,
  dependencies: {}  // Empty - effects won't run on server
});

// 3. Render component to HTML
const html = renderToHTML(App, { store });

// 4. Send response
reply.type('text/html').send(html);
```

**Key points:**
- Data is loaded **before** creating the store
- Store is created with empty dependencies
- Effects are automatically deferred (default behavior)
- HTML includes serialized state in a `<script>` tag

### Client Hydration (client/index.ts)

The client reactivates the application:

```typescript
// 1. Read serialized state from server
const stateJSON = document.getElementById('__COMPOSABLE_SVELTE_STATE__').textContent;

// 2. Hydrate store with client dependencies
const store = hydrateStore(stateJSON, {
  reducer: appReducer,
  dependencies: {
    fetchPosts: async () => { /* real API */ }
  }
});

// 3. Mount the app
mount(App, { target: document.body, props: { store } });
```

**Key points:**
- State is restored from the `<script>` tag
- Client dependencies are injected
- Effects now execute normally
- User interactions work immediately

## 🎯 Key Patterns

### Pattern 1: Pure, Serializable State

```typescript
// ✅ Good - only plain data
interface AppState {
  posts: Post[];
  selectedPostId: number | null;
  isLoading: boolean;
}

// ❌ Bad - non-serializable
interface BadState {
  posts: Post[];
  apiClient: APIClient;  // Functions can't be serialized!
  fetchFn: () => void;   // Functions can't be serialized!
}
```

### Pattern 2: Dependencies for Side Effects

```typescript
// Side effects live in dependencies, NOT state
interface AppDependencies {
  fetchPosts: () => Promise<Post[]>;
}

// Server: empty dependencies (no effects)
const serverStore = createStore({
  initialState: { posts: await loadPosts() },
  reducer,
  dependencies: {}
});

// Client: real dependencies
const clientStore = hydrateStore(json, {
  reducer,
  dependencies: {
    fetchPosts: () => fetch('/api/posts').then(r => r.json())
  }
});
```

### Pattern 3: Data Loading Before Store

```typescript
// Server loads data BEFORE creating store
app.get('/', async (req, res) => {
  // Load data (database, API, file system, etc.)
  const posts = await loadPosts();
  const user = await loadUser(req.session.userId);

  // Create store with pre-loaded data
  const store = createStore({
    initialState: { posts, user },
    reducer
  });

  const html = renderToHTML(App, { store });
  res.send(html);
});
```

## 🔧 Configuration

### Vite Configuration

The project uses separate builds for client and server:

```typescript
// Client build (browser)
{
  build: {
    outDir: 'dist/client',
    rollupOptions: {
      input: 'src/client/index.ts'
    }
  }
}

// Server build (Node.js)
{
  build: {
    ssr: true,
    outDir: 'dist/server',
    rollupOptions: {
      input: 'src/server/index.ts'
    }
  }
}
```

### Port Configuration

```bash
# Set custom port
PORT=4000 pnpm dev

# Set custom host
HOST=127.0.0.1 pnpm dev
```

## 🎨 Customization

### Adding New Routes

```typescript
// server/index.ts
app.get('/about', async (request, reply) => {
  const store = createStore({
    initialState: { page: 'about' },
    reducer
  });

  const html = renderToHTML(AboutPage, { store });
  reply.type('text/html').send(html);
});
```

### Adding API Endpoints

```typescript
// server/index.ts
app.get('/api/posts', async () => {
  const posts = await loadPosts();
  return { posts };
});
```

### Custom Data Loading

Replace `src/server/data.ts` with real database queries:

```typescript
import { db } from './database';

export async function loadPosts() {
  return await db.posts.findMany({
    orderBy: { date: 'desc' }
  });
}
```

## 📊 Performance Tips

1. **Cache Rendered HTML**: For static content, cache the rendered HTML
2. **Stream Responses**: Use Fastify's streaming for large responses
3. **Lazy Load Data**: Only load data needed for the current page
4. **Optimize Bundle Size**: Use code splitting for large applications

## 🧪 Testing

The project includes comprehensive E2E tests that verify the complete SSR flow.

### Running Tests

```bash
# Run E2E tests (headless)
pnpm test:e2e

# Run with UI mode (interactive debugging)
pnpm test:e2e:ui

# Run in headed mode (see the browser)
pnpm test:e2e:headed
```

### What the Tests Cover

The E2E test suite (`tests/e2e/ssr.spec.ts`) verifies:

1. **Server-Side Rendering**: HTML is rendered correctly on the server
2. **State Serialization**: Application state is embedded in `__COMPOSABLE_SVELTE_STATE__` script tag
3. **Client Hydration**: State is restored and application becomes interactive
4. **Interactivity**: Post selection and navigation work correctly
5. **Responsive Layout**: Application works across different viewport sizes
6. **SEO**: Meta tags and semantic HTML are present
7. **No JavaScript Fallback**: Content is accessible even without JavaScript
8. **Error-Free Execution**: No console errors during normal operation

### Test Infrastructure

- **Framework**: Playwright
- **Browsers**: Chrome, Firefox, Safari
- **Test Server**: Automatically builds and starts the production server
- **Configuration**: `playwright.config.ts`

## 🐛 Troubleshooting

### "No hydration data found"

**Problem**: The `__COMPOSABLE_SVELTE_STATE__` script tag is missing.

**Solution**: Ensure `renderToHTML()` is called correctly and the response includes the full HTML.

### "Effects not working on client"

**Problem**: Client dependencies are not injected properly.

**Solution**: Check that you're passing `dependencies` to `hydrateStore()`.

### "State mismatch after hydration"

**Problem**: Server state doesn't match client state.

**Solution**: Ensure your state only contains serializable data (no functions, classes, etc.).

### "Tests failing to connect"

**Problem**: E2E tests can't connect to the server.

**Solution**: Ensure the build completes successfully and port 3000 is available. The test server will automatically build and start before running tests.

## 📚 Learn More

- [Composable Svelte Docs](../../packages/core/README.md)
- [SSR Module Docs](../../packages/core/src/lib/ssr/README.md)
- [Fastify Documentation](https://fastify.dev)
- [Svelte 5 Documentation](https://svelte.dev/docs/svelte/overview)

## 📝 License

MIT
