/**
 * Server-Side Rendering (SSR) and Static Site Generation (SSG) utilities.
 *
 * This module provides:
 * - State serialization (server → JSON)
 * - State hydration (JSON → client store)
 * - Rendering helpers (component → HTML)
 * - Static site generation (build-time HTML generation)
 * - Environment detection (server vs browser)
 *
 * @example Server-Side Rendering
 * ```typescript
 * // server.ts
 * import { renderToHTML } from '@composable-svelte/core/ssr';
 * import { createStore } from '@composable-svelte/core';
 * import App from './App.svelte';
 *
 * app.get('/', async (req, res) => {
 *   // Load data for this request
 *   const data = await loadData(req.user);
 *
 *   // Create store with pre-populated data
 *   const store = createStore({
 *     initialState: data,
 *     reducer: appReducer,
 *     dependencies: {}  // Empty on server
 *   });
 *
 *   // Render to HTML
 *   const html = renderToHTML(App, { store });
 *   res.send(html);
 * });
 * ```
 *
 * @example Static Site Generation
 * ```typescript
 * // build.ts
 * import { generateStaticSite } from '@composable-svelte/core/ssr';
 * import App from './App.svelte';
 * import { appReducer } from './reducer';
 *
 * const posts = await loadPosts();
 *
 * const result = await generateStaticSite(App, {
 *   routes: [
 *     { path: '/' },
 *     { path: '/about' },
 *     {
 *       path: '/posts/:id',
 *       paths: posts.map(p => `/posts/${p.id}`),
 *       getServerProps: async (path) => ({
 *         post: await loadPost(path)
 *       })
 *     }
 *   ],
 *   outDir: './dist',
 *   baseURL: 'https://example.com'
 * }, {
 *   reducer: appReducer,
 *   dependencies: {},
 *   getInitialState: () => ({ posts: [], selectedPost: null })
 * });
 *
 * console.log(`Generated ${result.pagesGenerated} pages in ${result.duration}ms`);
 * ```
 *
 * @example Client Hydration
 * ```typescript
 * // client.ts
 * import { hydrateStore } from '@composable-svelte/core/ssr';
 * import { mount } from 'svelte';
 * import App from './App.svelte';
 *
 * // Read state from script tag
 * const stateJSON = document.getElementById('__COMPOSABLE_SVELTE_STATE__')?.textContent;
 *
 * // Hydrate with client dependencies
 * const store = hydrateStore(stateJSON, {
 *   reducer: appReducer,
 *   dependencies: {
 *     api: createAPIClient(),
 *     storage: createLocalStorage()
 *   }
 * });
 *
 * // Mount app
 * mount(App, { target: document.body, props: { store } });
 * ```
 *
 * @module ssr
 */

// Serialization
export { serializeStore, serializeState } from './serialize.js';

// Hydration
export { hydrateStore, parseState } from './hydrate.js';

// Rendering
export {
  renderToHTML,
  renderComponent,
  buildHydrationScript,
  type RenderOptions
} from './render.js';

// Utilities
export { isServer, isBrowser } from './utils.js';

// Static Site Generation
// NOTE: SSG functions are only available via '@composable-svelte/core/ssr/ssg'
// to avoid Node.js module imports breaking browser builds.
//
// Example:
// import { generateStaticSite } from '@composable-svelte/core/ssr/ssg';
//
// Re-export types only (types don't cause runtime imports)
export type {
  SSGConfig,
  SSGRoute,
  SSGResult,
  SSGGenerateOptions
} from './ssg.js';

// Security
export {
  createSecurityHeaders,
  fastifySecurityHeaders,
  defaultSecurityHeaders,
  type SecurityHeadersConfig
} from './middleware/security-headers.js';

export {
  sanitizeHTML,
  createSanitizer,
  defaultSanitizeOptions,
  type SanitizeOptions
} from './middleware/html-sanitization.js';

export {
  RateLimiter,
  fastifyRateLimit,
  type RateLimitConfig
} from './middleware/rate-limiting.js';
