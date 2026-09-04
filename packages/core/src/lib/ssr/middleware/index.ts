/**
 * Server-only SSR middleware: security headers and rate limiting.
 *
 * Split out of the `./ssr` barrel deliberately. That barrel is browser-safe —
 * the root entry re-exports through it, so anything server-side placed there
 * lands in every consumer's bundle graph.
 *
 * Neither module here has any dependency of its own, so this entry always
 * resolves. HTML sanitisation lives at `@composable-svelte/core/ssr/sanitize`
 * instead, because it needs `isomorphic-dompurify` (and therefore jsdom); if it
 * were re-exported here, importing this barrel for rate limiting alone would
 * eagerly load it.
 *
 * Both `fastify*` functions carry Fastify's skip-override marker, so
 * `app.register()` installs them on the registering instance rather than on
 * an encapsulated child; they also take the instance as a plain argument —
 * core does not depend on fastify.
 *
 * @example
 * ```typescript
 * import {
 *   fastifySecurityHeaders,
 *   fastifyRateLimit
 * } from '@composable-svelte/core/ssr/middleware';
 *
 * app.register(fastifySecurityHeaders);
 * app.register(fastifyRateLimit, { max: 100, windowMs: 60_000 });
 * ```
 *
 * @packageDocumentation
 */

// Security headers
export {
  createSecurityHeaders,
  fastifySecurityHeaders,
  defaultSecurityHeaders,
  type SecurityHeadersConfig
} from './security-headers.js';

// Rate limiting
export {
  RateLimiter,
  fastifyRateLimit,
  type RateLimitConfig
} from './rate-limiting.js';
