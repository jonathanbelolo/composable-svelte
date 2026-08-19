/**
 * Server-only SSR middleware.
 *
 * Split out of the `./ssr` barrel deliberately. `html-sanitization.ts` imports
 * `isomorphic-dompurify`, which depends on `jsdom`; while these exports lived
 * on the `./ssr` barrel, every consumer of that entry — and of the root entry,
 * which re-exports through it — pulled DOMPurify into their module graph. A
 * browser bundle would tree-shake it back out, but only after parsing it, and
 * jsdom ships CommonJS that not every bundler can parse.
 *
 * Import these from `@composable-svelte/core/ssr/middleware`. Nothing here is
 * meant to run in a browser.
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

// HTML sanitisation — the one module here with a server-only dependency.
export {
  sanitizeHTML,
  createSanitizer,
  defaultSanitizeOptions,
  type SanitizeOptions
} from './html-sanitization.js';

// Rate limiting
export {
  RateLimiter,
  fastifyRateLimit,
  type RateLimitConfig
} from './rate-limiting.js';
