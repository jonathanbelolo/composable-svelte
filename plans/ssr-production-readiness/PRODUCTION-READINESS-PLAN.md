# SSR Production Readiness Plan

**Status**: 🟡 In Progress
**Created**: 2025-01-11
**Target**: Full production-ready SSR framework + example

## Executive Summary

This plan outlines the steps to take Composable Svelte's SSR implementation from its current functional state to full production readiness. The focus is on **framework-level enhancements** (reusable) with minimal example-specific changes.

### Current Status

**Framework Core**: ✅ Solid foundation - rendering, hydration, routing all work correctly
**Example Implementation**: ⚠️ Functional but lacks production hardening

### Goals

1. **Security**: Eliminate vulnerabilities, add protection layers
2. **Performance**: Optimize caching, compression, bundle size
3. **Reliability**: Error handling, monitoring, graceful degradation
4. **Developer Experience**: Better tooling, debugging, documentation
5. **Testing**: Comprehensive coverage, performance benchmarks
6. **Deployment**: Production-ready configuration, Docker, CI/CD

---

## Phase 1: Security Hardening (Critical - P0)

**Timeline**: 2-3 days
**Priority**: 🔴 Critical - Must complete before production deployment

### 1.1 Framework: Security Middleware Package

**Location**: `packages/core/src/lib/ssr/middleware/`

**Create**: `security-headers.ts`
```typescript
/**
 * Security headers middleware for SSR applications.
 *
 * Adds essential security headers to prevent common attacks:
 * - XSS (Cross-Site Scripting)
 * - Clickjacking
 * - MIME type sniffing
 * - etc.
 */

export interface SecurityHeadersConfig {
  /** Content Security Policy directive */
  contentSecurityPolicy?: string | false;

  /** X-Frame-Options value (DENY, SAMEORIGIN, or ALLOW-FROM) */
  frameOptions?: 'DENY' | 'SAMEORIGIN' | string;

  /** Referrer policy */
  referrerPolicy?: string;

  /** Enable HSTS (HTTP Strict Transport Security) */
  hsts?: boolean | { maxAge: number; includeSubDomains?: boolean };

  /** Custom headers to add */
  customHeaders?: Record<string, string>;
}

export const defaultSecurityHeaders: SecurityHeadersConfig = {
  contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
  frameOptions: 'DENY',
  referrerPolicy: 'strict-origin-when-cross-origin',
  hsts: { maxAge: 31536000, includeSubDomains: true }
};

/**
 * Generate security headers object.
 * Works with any Node.js framework (Express, Fastify, etc.)
 */
export function createSecurityHeaders(
  config: SecurityHeadersConfig = defaultSecurityHeaders
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
  };

  if (config.frameOptions) {
    headers['X-Frame-Options'] = config.frameOptions;
  }

  if (config.referrerPolicy) {
    headers['Referrer-Policy'] = config.referrerPolicy;
  }

  if (config.contentSecurityPolicy) {
    headers['Content-Security-Policy'] = config.contentSecurityPolicy;
  }

  if (config.hsts) {
    const hstsValue = typeof config.hsts === 'boolean'
      ? 'max-age=31536000; includeSubDomains'
      : `max-age=${config.hsts.maxAge}${config.hsts.includeSubDomains ? '; includeSubDomains' : ''}`;
    headers['Strict-Transport-Security'] = hstsValue;
  }

  // Add custom headers
  if (config.customHeaders) {
    Object.assign(headers, config.customHeaders);
  }

  return headers;
}

/**
 * Fastify plugin for security headers.
 */
export function fastifySecurityHeaders(
  fastify: any,
  options: SecurityHeadersConfig = defaultSecurityHeaders
) {
  const headers = createSecurityHeaders(options);

  fastify.addHook('onSend', async (request: any, reply: any) => {
    Object.entries(headers).forEach(([key, value]) => {
      reply.header(key, value);
    });
  });
}
```

**Create**: `html-sanitization.ts`
```typescript
/**
 * HTML sanitization utilities for SSR.
 *
 * Provides safe HTML rendering to prevent XSS attacks.
 */

import DOMPurify from 'isomorphic-dompurify';

export interface SanitizeOptions {
  /** Allow specific HTML tags */
  allowedTags?: string[];

  /** Allow specific HTML attributes */
  allowedAttributes?: Record<string, string[]>;

  /** Allow data URIs (dangerous - use with caution) */
  allowDataUri?: boolean;

  /** Custom DOMPurify config */
  domPurifyConfig?: any;
}

/**
 * Default safe configuration for blog posts/user content.
 */
export const defaultSanitizeOptions: SanitizeOptions = {
  allowedTags: [
    'p', 'br', 'strong', 'em', 'u', 's', 'a',
    'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'img', 'figure', 'figcaption'
  ],
  allowedAttributes: {
    'a': ['href', 'title', 'rel'],
    'img': ['src', 'alt', 'title', 'width', 'height']
  },
  allowDataUri: false
};

/**
 * Sanitize HTML content to prevent XSS.
 *
 * @param html - Raw HTML string (potentially unsafe)
 * @param options - Sanitization options
 * @returns Safe HTML string
 *
 * @example
 * ```typescript
 * const userContent = '<script>alert("XSS")</script><p>Hello</p>';
 * const safeContent = sanitizeHTML(userContent);
 * // Result: '<p>Hello</p>' (script removed)
 * ```
 */
export function sanitizeHTML(
  html: string,
  options: SanitizeOptions = defaultSanitizeOptions
): string {
  if (!html) return '';

  // Build allowed attributes array from all tags
  const allowedAttrs = options.allowedAttributes
    ? Object.values(options.allowedAttributes).flat()
    : [];

  const config: any = {
    ALLOWED_TAGS: options.allowedTags || [],
    ALLOWED_ATTR: allowedAttrs,
    ...options.domPurifyConfig
  };

  // Disable data URIs unless explicitly allowed
  if (!options.allowDataUri) {
    config.ALLOW_DATA_ATTR = false;
  }

  return DOMPurify.sanitize(html, config);
}

/**
 * Create a sanitizer function with preset options.
 * Useful for consistent sanitization across your app.
 */
export function createSanitizer(options: SanitizeOptions = defaultSanitizeOptions) {
  return (html: string) => sanitizeHTML(html, options);
}
```

**Create**: `rate-limiting.ts`
```typescript
/**
 * Rate limiting utilities for SSR applications.
 *
 * Protects against DoS attacks and abuse.
 */

export interface RateLimitConfig {
  /** Maximum requests per window */
  max: number;

  /** Time window in milliseconds */
  windowMs: number;

  /** Key generator function (default: IP address) */
  keyGenerator?: (request: any) => string;

  /** Custom error message */
  message?: string;

  /** HTTP status code for rate limit exceeded */
  statusCode?: number;
}

/**
 * In-memory rate limiter (use Redis in production for distributed systems).
 */
export class RateLimiter {
  private requests = new Map<string, { count: number; resetTime: number }>();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(private config: RateLimitConfig) {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Check if request is within rate limit.
   * @returns { allowed: boolean, remaining: number, resetTime: number }
   */
  check(key: string): {
    allowed: boolean;
    remaining: number;
    resetTime: number;
    retryAfter?: number;
  } {
    const now = Date.now();
    const record = this.requests.get(key);

    // No record or expired - allow and create new
    if (!record || now > record.resetTime) {
      const resetTime = now + this.config.windowMs;
      this.requests.set(key, { count: 1, resetTime });
      return {
        allowed: true,
        remaining: this.config.max - 1,
        resetTime
      };
    }

    // Within window - check limit
    if (record.count < this.config.max) {
      record.count++;
      return {
        allowed: true,
        remaining: this.config.max - record.count,
        resetTime: record.resetTime
      };
    }

    // Rate limit exceeded
    return {
      allowed: false,
      remaining: 0,
      resetTime: record.resetTime,
      retryAfter: Math.ceil((record.resetTime - now) / 1000)
    };
  }

  /**
   * Clean up expired entries.
   */
  private cleanup() {
    const now = Date.now();
    for (const [key, record] of this.requests.entries()) {
      if (now > record.resetTime) {
        this.requests.delete(key);
      }
    }
  }

  /**
   * Destroy the rate limiter and clean up resources.
   * Call this when shutting down the server.
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.requests.clear();
  }
}

/**
 * Fastify plugin for rate limiting.
 */
export function fastifyRateLimit(
  fastify: any,
  config: RateLimitConfig
) {
  const limiter = new RateLimiter(config);
  const keyGen = config.keyGenerator || ((req: any) => req.ip);

  fastify.addHook('onRequest', async (request: any, reply: any) => {
    const key = keyGen(request);
    const result = limiter.check(key);

    // Add rate limit headers
    reply.header('X-RateLimit-Limit', config.max);
    reply.header('X-RateLimit-Remaining', result.remaining);
    reply.header('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

    if (!result.allowed) {
      reply.header('Retry-After', result.retryAfter!);
      reply.status(config.statusCode || 429).send({
        error: 'Too Many Requests',
        message: config.message || 'Rate limit exceeded. Please try again later.',
        retryAfter: result.retryAfter
      });
    }
  });
}
```

**Export**: Update `packages/core/src/lib/ssr/index.ts`
```typescript
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

// Error handling & resilience
export {
  createSSRError,
  renderErrorPage,
  notFoundError,
  validationError,
  setupFastifyErrorHandlers,
  setupGracefulShutdown,
  type SSRError,
  type ErrorPageOptions,
  type GracefulShutdownOptions
} from './error-handling.js';

export {
  validateParams,
  createValidationMiddleware,
  type ValidationRule,
  type ValidationSchema
} from './validation.js';

export {
  validateEnv,
  validateEnvOrExit,
  type EnvSchema
} from './env-validation.js';

// Performance
export {
  generateCacheControl,
  generateETag,
  checkETag,
  addCachingHeaders,
  SSRCache,
  type CacheOptions
} from './caching.js';

export {
  setupFastifyCompression,
  defaultCompressionOptions,
  type CompressionOptions
} from './compression.js';

// Logging
export {
  createSSRLogger,
  setupFastifyLogging,
  type LoggerOptions
} from './logging.js';
```

**Dependencies**: Add to `packages/core/package.json`
```json
{
  "dependencies": {
    "isomorphic-dompurify": "^2.16.0",
    "@fastify/compress": "^7.0.0",
    "pino": "^8.17.0",
    "pino-pretty": "^10.3.0"
  }
}
```

### 1.2 Example: Apply Security Middleware

**Update**: `examples/ssr-server/src/server/index.ts`

```typescript
import {
  fastifySecurityHeaders,
  fastifyRateLimit,
  sanitizeHTML
} from '@composable-svelte/core/ssr';

// Security headers
fastifySecurityHeaders(app, {
  contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:",
  frameOptions: 'DENY',
  referrerPolicy: 'strict-origin-when-cross-origin',
  hsts: { maxAge: 31536000, includeSubDomains: true }
});

// Rate limiting
fastifyRateLimit(app, {
  max: 100,
  windowMs: 60000, // 1 minute
  message: 'Too many requests from this IP, please try again later.'
});
```

**Update**: `examples/ssr-server/src/server/data.ts`

```typescript
import { sanitizeHTML } from '@composable-svelte/core/ssr';

// Sanitize post content on load
export async function loadPosts(): Promise<Post[]> {
  await new Promise((resolve) => setTimeout(resolve, 10));

  // Sanitize HTML content
  return mockPosts.map(post => ({
    ...post,
    content: sanitizeHTML(post.content)
  }));
}
```

### 1.3 Documentation

**Create**: `packages/core/src/lib/ssr/SECURITY.md`

```markdown
# SSR Security Guide

## XSS (Cross-Site Scripting) Prevention

Always sanitize user-generated HTML content before rendering:

\`\`\`typescript
import { sanitizeHTML } from '@composable-svelte/core/ssr';

const safeContent = sanitizeHTML(userContent, {
  allowedTags: ['p', 'strong', 'em', 'a'],
  allowedAttributes: { 'a': ['href', 'title'] }
});
\`\`\`

**Key Rules**:
- ✅ Use `sanitizeHTML()` for all user content rendered with `{@html}`
- ✅ Use text interpolation `{content}` when possible (auto-escaped)
- ❌ Never use `{@html}` with unsanitized user input
- ❌ Never use `javascript:` URLs in sanitized content

## CSRF (Cross-Site Request Forgery) Protection

**When CSRF Protection is Required**:
- Forms that modify server state (POST, PUT, DELETE)
- Authenticated endpoints with cookies/sessions
- State-changing operations

**When CSRF Protection is Optional**:
- Read-only SSR applications (our current example)
- Public content rendering without authentication
- Stateless APIs with bearer tokens (not cookies)

**Implementation** (if needed):

\`\`\`typescript
// Framework: packages/core/src/lib/ssr/middleware/csrf.ts
import { randomBytes } from 'crypto';

export function generateCSRFToken(): string {
  return randomBytes(32).toString('hex');
}

export function fastifyCSRF(fastify: any) {
  fastify.addHook('onRequest', async (request: any, reply: any) => {
    if (request.method === 'GET') {
      // Generate token for GET requests
      const token = generateCSRFToken();
      request.csrfToken = token;
      reply.setCookie('csrf-token', token, {
        httpOnly: true,
        sameSite: 'strict'
      });
    } else {
      // Validate token for POST/PUT/DELETE
      const cookieToken = request.cookies['csrf-token'];
      const headerToken = request.headers['x-csrf-token'];

      if (!cookieToken || cookieToken !== headerToken) {
        reply.status(403).send({ error: 'Invalid CSRF token' });
      }
    }
  });
}
\`\`\`

**Note**: The current SSR example does not require CSRF protection as it only renders content and does not handle form submissions. Implement CSRF if you add:
- User authentication
- Form submissions (POST/PUT/DELETE)
- Cookie-based sessions

## Rate Limiting

Protects against DoS attacks and abuse:

\`\`\`typescript
import { fastifyRateLimit } from '@composable-svelte/core/ssr';

fastifyRateLimit(app, {
  max: 100,          // 100 requests
  windowMs: 60000,   // per minute
  keyGenerator: (req) => req.ip  // per IP address
});
\`\`\`

**Best Practices**:
- Use Redis for distributed systems (multiple servers)
- Different limits for different endpoints (stricter for auth)
- Return `Retry-After` header when rate limited
- Monitor rate limit hits for abuse patterns

## Security Headers

Essential headers for production:

\`\`\`typescript
import { fastifySecurityHeaders } from '@composable-svelte/core/ssr';

fastifySecurityHeaders(app, {
  contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline'",
  frameOptions: 'DENY',
  referrerPolicy: 'strict-origin-when-cross-origin',
  hsts: { maxAge: 31536000, includeSubDomains: true }
});
\`\`\`

**Header Explanations**:
- **CSP**: Prevents XSS by restricting resource loading
- **X-Frame-Options**: Prevents clickjacking attacks
- **X-Content-Type-Options**: Prevents MIME type sniffing
- **HSTS**: Forces HTTPS connections
- **Referrer-Policy**: Controls referrer information

## Common Pitfalls

1. **Using `{@html}` with user content**: Always sanitize first
2. **Trusting URL parameters**: Always validate with schema
3. **No rate limiting**: Enables DoS attacks
4. **Missing CSP**: Allows XSS attacks
5. **Logging sensitive data**: Redact passwords, tokens, cookies
6. **No HTTPS in production**: Man-in-the-middle attacks possible

## Production Checklist

- [ ] All user content sanitized
- [ ] Security headers configured
- [ ] Rate limiting enabled
- [ ] Input validation on all routes
- [ ] HTTPS enforced (reverse proxy/CDN)
- [ ] Secrets in environment variables (not code)
- [ ] Sensitive fields redacted from logs
- [ ] CSRF protection (if handling authenticated forms)
- [ ] Regular security audits (`pnpm audit`)

\`\`\`


**Deliverables**:
- ✅ Security headers middleware
- ✅ HTML sanitization utilities
- ✅ Rate limiting implementation
- ✅ Example integration
- ✅ Security documentation

---

## Phase 2: Error Handling & Resilience (P0)

**Timeline**: 2 days
**Priority**: 🔴 Critical

### 2.1 Framework: Error Handling Utilities

**Create**: `packages/core/src/lib/ssr/error-handling.ts`

```typescript
/**
 * Error handling utilities for SSR applications.
 */

export interface SSRError extends Error {
  statusCode?: number;
  isOperational?: boolean;
  context?: Record<string, unknown>;
}

/**
 * Create a typed SSR error.
 */
export function createSSRError(
  message: string,
  statusCode: number = 500,
  context?: Record<string, unknown>
): SSRError {
  const error = new Error(message) as SSRError;
  error.statusCode = statusCode;
  error.isOperational = true;
  error.context = context;
  return error;
}

/**
 * Error page renderer.
 */
export interface ErrorPageOptions {
  /** Error object */
  error: SSRError | Error;

  /** Request path */
  path: string;

  /** Show detailed error (only in development) */
  showDetails?: boolean;

  /** Custom error component */
  ErrorComponent?: any;
}

/**
 * Render error page HTML.
 */
export function renderErrorPage(options: ErrorPageOptions): string {
  const { error, path, showDetails = false } = options;
  const statusCode = (error as SSRError).statusCode || 500;
  const message = showDetails ? error.message : 'Internal Server Error';
  const stack = showDetails ? error.stack : undefined;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error ${statusCode}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #f5f5f5;
    }
    .error-container {
      max-width: 600px;
      padding: 2rem;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    h1 { margin: 0 0 1rem 0; color: #c00; }
    p { margin: 0 0 1rem 0; color: #666; }
    pre {
      background: #f5f5f5;
      padding: 1rem;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 0.875rem;
    }
    .path { font-family: monospace; background: #f0f0f0; padding: 0.25rem 0.5rem; border-radius: 3px; }
  </style>
</head>
<body>
  <div class="error-container">
    <h1>Error ${statusCode}</h1>
    <p><strong>Path:</strong> <span class="path">${escapeHtml(path)}</span></p>
    <p>${escapeHtml(message)}</p>
    ${stack ? `<pre>${escapeHtml(stack)}</pre>` : ''}
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Not found (404) error.
 */
export function notFoundError(path: string): SSRError {
  return createSSRError(`Page not found: ${path}`, 404, { path });
}

/**
 * Validation error (400).
 */
export function validationError(message: string, context?: Record<string, unknown>): SSRError {
  return createSSRError(message, 400, context);
}

/**
 * Fastify error handler setup.
 */
export function setupFastifyErrorHandlers(
  fastify: any,
  options: {
    isDevelopment?: boolean;
    ErrorComponent?: any;
  } = {}
) {
  const { isDevelopment = process.env.NODE_ENV !== 'production' } = options;

  // 404 handler
  fastify.setNotFoundHandler((request: any, reply: any) => {
    const html = renderErrorPage({
      error: notFoundError(request.url),
      path: request.url,
      showDetails: isDevelopment
    });
    reply.status(404).type('text/html').send(html);
  });

  // Global error handler
  fastify.setErrorHandler((error: Error, request: any, reply: any) => {
    request.log.error(error);

    const statusCode = (error as SSRError).statusCode || 500;
    const html = renderErrorPage({
      error,
      path: request.url,
      showDetails: isDevelopment
    });

    reply.status(statusCode).type('text/html').send(html);
  });
}
```

### 2.2 Framework: Request Validation

**Create**: `packages/core/src/lib/ssr/validation.ts`

```typescript
/**
 * Request validation utilities for SSR routes.
 */

export interface ValidationRule {
  type: 'string' | 'number' | 'boolean' | 'email' | 'url';
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  custom?: (value: any) => boolean | string;
}

export interface ValidationSchema {
  params?: Record<string, ValidationRule>;
  query?: Record<string, ValidationRule>;
}

/**
 * Validate request parameters.
 */
export function validateParams(
  params: Record<string, any>,
  schema: Record<string, ValidationRule>
): { valid: boolean; errors?: Record<string, string> } {
  const errors: Record<string, string> = {};

  for (const [key, rule] of Object.entries(schema)) {
    const value = params[key];

    // Required check
    if (rule.required && (value === undefined || value === null || value === '')) {
      errors[key] = `${key} is required`;
      continue;
    }

    // Skip validation if not required and empty
    if (!rule.required && !value) continue;

    // Type validation
    switch (rule.type) {
      case 'number': {
        const num = Number(value);
        if (isNaN(num)) {
          errors[key] = `${key} must be a number`;
          break;
        }
        if (rule.min !== undefined && num < rule.min) {
          errors[key] = `${key} must be at least ${rule.min}`;
          break;
        }
        if (rule.max !== undefined && num > rule.max) {
          errors[key] = `${key} must be at most ${rule.max}`;
          break;
        }
        break;
      }
      case 'email': {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          errors[key] = `${key} must be a valid email`;
        }
        break;
      }
      case 'url': {
        try {
          new URL(value);
        } catch {
          errors[key] = `${key} must be a valid URL`;
        }
        break;
      }
      case 'string': {
        if (typeof value !== 'string') {
          errors[key] = `${key} must be a string`;
          break;
        }
        if (rule.min !== undefined && value.length < rule.min) {
          errors[key] = `${key} must be at least ${rule.min} characters`;
          break;
        }
        if (rule.max !== undefined && value.length > rule.max) {
          errors[key] = `${key} must be at most ${rule.max} characters`;
          break;
        }
        if (rule.pattern && !rule.pattern.test(value)) {
          errors[key] = `${key} format is invalid`;
        }
        break;
      }
    }

    // Custom validation
    if (rule.custom) {
      const result = rule.custom(value);
      if (result !== true) {
        errors[key] = typeof result === 'string' ? result : `${key} is invalid`;
      }
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors: Object.keys(errors).length > 0 ? errors : undefined
  };
}

/**
 * Create validation middleware for Fastify.
 */
export function createValidationMiddleware(schema: ValidationSchema) {
  return (request: any, reply: any, done: Function) => {
    // Validate params
    if (schema.params) {
      const result = validateParams(request.params, schema.params);
      if (!result.valid) {
        reply.status(400).send({
          error: 'Validation Error',
          message: 'Invalid request parameters',
          details: result.errors
        });
        return;
      }
    }

    // Validate query
    if (schema.query) {
      const result = validateParams(request.query, schema.query);
      if (!result.valid) {
        reply.status(400).send({
          error: 'Validation Error',
          message: 'Invalid query parameters',
          details: result.errors
        });
        return;
      }
    }

    done();
  };
}
```

### 2.3 Example: Apply Error Handling

**Update**: `examples/ssr-server/src/server/index.ts`

```typescript
import {
  setupFastifyErrorHandlers,
  createValidationMiddleware,
  validationError
} from '@composable-svelte/core/ssr';

// Setup error handlers
setupFastifyErrorHandlers(app, {
  isDevelopment: process.env.NODE_ENV !== 'production'
});

// Register routes with validation
app.get('/posts/:id', {
  preHandler: createValidationMiddleware({
    params: {
      id: { type: 'number', required: true, min: 1 }
    }
  })
}, renderApp);

app.get('/posts/:id/comments', {
  preHandler: createValidationMiddleware({
    params: {
      id: { type: 'number', required: true, min: 1 }
    }
  })
}, renderApp);
```

### 2.4 Framework: Graceful Shutdown

**Add to**: `packages/core/src/lib/ssr/error-handling.ts`

```typescript
/**
 * Graceful shutdown handler for production servers.
 * Ensures in-flight requests complete before shutdown.
 */
export interface GracefulShutdownOptions {
  /** Shutdown timeout in milliseconds */
  timeout?: number;

  /** Callback before shutdown */
  onShutdown?: () => Promise<void> | void;

  /** Logger function */
  logger?: (message: string) => void;
}

/**
 * Setup graceful shutdown for Fastify.
 */
export function setupGracefulShutdown(
  fastify: any,
  options: GracefulShutdownOptions = {}
) {
  const { timeout = 10000, onShutdown, logger = console.log } = options;

  let isShuttingDown = false;

  // Add hook to reject new requests during shutdown
  fastify.addHook('onRequest', async (request: any, reply: any) => {
    if (isShuttingDown) {
      reply.status(503).send({ error: 'Server is shutting down' });
    }
  });

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;

    logger(`Received ${signal}, starting graceful shutdown...`);
    isShuttingDown = true;

    // Stop accepting new connections
    setTimeout(() => {
      logger('Shutdown timeout reached, forcing exit');
      process.exit(1);
    }, timeout);

    try {
      // Run custom cleanup
      if (onShutdown) {
        await onShutdown();
      }

      // Close Fastify
      await fastify.close();
      logger('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      logger(`Error during shutdown: ${error}`);
      process.exit(1);
    }
  };

  // Handle shutdown signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
```

### 2.5 Framework: Environment Validation

**Create**: `packages/core/src/lib/ssr/env-validation.ts`

```typescript
/**
 * Environment variable validation for production deployments.
 */

export interface EnvSchema {
  [key: string]: {
    required?: boolean;
    type?: 'string' | 'number' | 'boolean';
    default?: string | number | boolean;
    pattern?: RegExp;
    values?: readonly (string | number)[];
  };
}

/**
 * Validate environment variables against schema.
 */
export function validateEnv(schema: EnvSchema): {
  valid: boolean;
  errors: string[];
  env: Record<string, string | number | boolean>;
} {
  const errors: string[] = [];
  const env: Record<string, any> = {};

  for (const [key, config] of Object.entries(schema)) {
    const value = process.env[key];

    // Required check
    if (config.required && !value) {
      if (config.default === undefined) {
        errors.push(`${key} is required but not set`);
        continue;
      }
      env[key] = config.default;
      continue;
    }

    // Use default if not provided
    if (!value && config.default !== undefined) {
      env[key] = config.default;
      continue;
    }

    if (!value) {
      continue; // Optional and no default
    }

    // Type conversion and validation
    switch (config.type) {
      case 'number': {
        const num = Number(value);
        if (isNaN(num)) {
          errors.push(`${key} must be a number, got: ${value}`);
        } else {
          env[key] = num;
        }
        break;
      }
      case 'boolean': {
        if (value === 'true' || value === '1') {
          env[key] = true;
        } else if (value === 'false' || value === '0') {
          env[key] = false;
        } else {
          errors.push(`${key} must be a boolean (true/false), got: ${value}`);
        }
        break;
      }
      default:
        env[key] = value;
    }

    // Pattern validation
    if (config.pattern && !config.pattern.test(String(value))) {
      errors.push(`${key} does not match required pattern`);
    }

    // Enum validation
    if (config.values && !config.values.includes(value)) {
      errors.push(`${key} must be one of: ${config.values.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    env
  };
}

/**
 * Validate and exit if invalid (for application startup).
 */
export function validateEnvOrExit(schema: EnvSchema): Record<string, any> {
  const result = validateEnv(schema);

  if (!result.valid) {
    console.error('Environment validation failed:');
    result.errors.forEach(error => console.error(`  - ${error}`));
    process.exit(1);
  }

  return result.env;
}
```

### 2.6 Example: Apply Graceful Shutdown and Env Validation

**Update**: `examples/ssr-server/src/server/index.ts`

```typescript
import {
  setupGracefulShutdown,
  validateEnvOrExit
} from '@composable-svelte/core/ssr';

// Validate environment
const env = validateEnvOrExit({
  NODE_ENV: {
    required: true,
    default: 'development',
    values: ['development', 'production', 'test']
  },
  PORT: {
    required: true,
    type: 'number',
    default: 3000
  },
  HOST: {
    default: '0.0.0.0'
  },
  LOG_LEVEL: {
    values: ['debug', 'info', 'warn', 'error'],
    default: 'info'
  }
});

// ... server setup ...

// Setup graceful shutdown
setupGracefulShutdown(app, {
  timeout: 10000,
  onShutdown: async () => {
    console.log('Cleaning up resources...');
    // Clean up rate limiters, caches, etc.
  }
});

// Start server
await app.listen({ port: env.PORT, host: env.HOST });
console.log(`Server running on http://${env.HOST}:${env.PORT}`);
```

**Deliverables**:
- ✅ Error handling utilities
- ✅ Request validation framework
- ✅ Graceful shutdown handler
- ✅ Environment validation
- ✅ 404/500 error pages
- ✅ Fastify integration helpers
- ✅ Example integration

---

## Phase 3: Performance Optimization (P1)

**Timeline**: 3-4 days
**Priority**: 🟡 High

### 3.1 Framework: HTTP Caching Utilities

**Create**: `packages/core/src/lib/ssr/caching.ts`

```typescript
/**
 * HTTP caching utilities for SSR applications.
 */

export interface CacheOptions {
  /** Max age in seconds */
  maxAge?: number;

  /** Use stale-while-revalidate */
  staleWhileRevalidate?: number;

  /** Use stale-if-error */
  staleIfError?: number;

  /** Cache visibility (public, private, no-cache) */
  cacheControl?: 'public' | 'private' | 'no-cache' | 'no-store';

  /** Custom vary headers */
  vary?: string[];

  /** ETag generator function */
  etagGenerator?: (content: string) => string;
}

/**
 * Generate Cache-Control header value.
 */
export function generateCacheControl(options: CacheOptions): string {
  const parts: string[] = [];

  if (options.cacheControl) {
    parts.push(options.cacheControl);
  }

  if (options.maxAge !== undefined) {
    parts.push(`max-age=${options.maxAge}`);
  }

  if (options.staleWhileRevalidate !== undefined) {
    parts.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
  }

  if (options.staleIfError !== undefined) {
    parts.push(`stale-if-error=${options.staleIfError}`);
  }

  return parts.join(', ');
}

/**
 * Simple ETag generator (hash-based).
 */
export function generateETag(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `"${hash.toString(36)}"`;
}

/**
 * Check if request ETag matches.
 * Handles multiple ETags (comma-separated) and weak ETags.
 */
export function checkETag(request: any, etag: string): boolean {
  const ifNoneMatch = request.headers['if-none-match'];
  if (!ifNoneMatch) return false;

  // Handle multiple ETags (comma-separated) and weak ETags (W/"...")
  return ifNoneMatch.split(',')
    .map(e => e.trim())
    .some(e => e === etag || e === `W/${etag}` || `W/${e}` === etag);
}

/**
 * Add caching headers to response.
 */
export function addCachingHeaders(
  reply: any,
  content: string,
  options: CacheOptions
): void {
  // Cache-Control
  if (options.cacheControl !== 'no-store') {
    const cacheControl = generateCacheControl(options);
    if (cacheControl) {
      reply.header('Cache-Control', cacheControl);
    }
  } else {
    reply.header('Cache-Control', 'no-store');
  }

  // Vary
  if (options.vary && options.vary.length > 0) {
    reply.header('Vary', options.vary.join(', '));
  }

  // ETag
  if (options.etagGenerator || options.cacheControl === 'public') {
    const etag = options.etagGenerator
      ? options.etagGenerator(content)
      : generateETag(content);
    reply.header('ETag', etag);
  }
}

/**
 * In-memory cache for server-side rendering.
 * Use Redis in production for distributed systems.
 */
export class SSRCache<T = string> {
  private cache = new Map<string, {
    value: T;
    timestamp: number;
    etag?: string
  }>();

  constructor(
    private options: {
      /** Max cache size (entries) */
      maxSize?: number;
      /** TTL in milliseconds */
      ttl?: number;
    } = {}
  ) {
    // Cleanup expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Get cached value.
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check TTL
    if (this.options.ttl) {
      const age = Date.now() - entry.timestamp;
      if (age > this.options.ttl) {
        this.cache.delete(key);
        return undefined;
      }
    }

    return entry.value;
  }

  /**
   * Set cached value.
   */
  set(key: string, value: T, etag?: string): void {
    // Enforce max size
    if (this.options.maxSize && this.cache.size >= this.options.maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      etag
    });
  }

  /**
   * Delete a specific cached entry.
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Invalidate cache entries matching a pattern.
   * @param pattern - String pattern or RegExp to match keys
   */
  invalidate(pattern: string | RegExp): number {
    const regex = typeof pattern === 'string'
      ? new RegExp(pattern)
      : pattern;

    let count = 0;
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics.
   */
  stats(): { size: number; keys: string[]; hitRate?: number } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  private cleanup(): void {
    if (!this.options.ttl) return;

    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.options.ttl) {
        this.cache.delete(key);
      }
    }
  }
}
```

### 3.2 Framework: Compression Middleware

**Create**: `packages/core/src/lib/ssr/compression.ts`

```typescript
/**
 * Compression utilities for SSR applications.
 *
 * Note: Most frameworks have built-in compression plugins.
 * This provides a framework-agnostic interface.
 */

export interface CompressionOptions {
  /** Enable Brotli compression */
  brotli?: boolean;

  /** Enable Gzip compression */
  gzip?: boolean;

  /** Minimum size to compress (bytes) */
  threshold?: number;

  /** Compression level (1-9 for gzip, 0-11 for brotli) */
  level?: number;
}

/**
 * Default compression settings.
 */
export const defaultCompressionOptions: CompressionOptions = {
  brotli: true,
  gzip: true,
  threshold: 1024, // 1KB
  level: 6
};

/**
 * Fastify compression setup.
 */
export async function setupFastifyCompression(
  fastify: any,
  options: CompressionOptions = defaultCompressionOptions
) {
  const compress = await import('@fastify/compress');

  await fastify.register(compress.default, {
    global: true,
    threshold: options.threshold,
    encodings: options.brotli
      ? ['br', 'gzip', 'deflate']
      : ['gzip', 'deflate']
  });
}
```

### 3.3 Example: Apply Performance Optimizations

**Update**: `examples/ssr-server/src/server/index.ts`

```typescript
import {
  SSRCache,
  addCachingHeaders,
  setupFastifyCompression,
  checkETag,
  generateETag
} from '@composable-svelte/core/ssr';

// Setup compression
await setupFastifyCompression(app);

// Create SSR cache
const htmlCache = new SSRCache<string>({
  maxSize: 100,
  ttl: 60000 // 1 minute
});

async function renderApp(request: any, reply: any) {
  try {
    const path = request.url;

    // Check cache
    const cachedHTML = htmlCache.get(path);
    if (cachedHTML) {
      const etag = generateETag(cachedHTML);

      // Check if client has valid cache
      if (checkETag(request, etag)) {
        return reply.status(304).send();
      }

      addCachingHeaders(reply, cachedHTML, {
        cacheControl: 'public',
        maxAge: 60,
        staleWhileRevalidate: 300
      });

      return reply.type('text/html').send(cachedHTML);
    }

    // ... render logic ...

    // Cache the result
    htmlCache.set(path, html);

    addCachingHeaders(reply, html, {
      cacheControl: 'public',
      maxAge: 60,
      staleWhileRevalidate: 300
    });

    reply.type('text/html').send(html);
  } catch (error) {
    throw error;
  }
}
```

**Deliverables**:
- ✅ HTTP caching utilities
- ✅ In-memory SSR cache
- ✅ ETag generation
- ✅ Compression setup
- ✅ Example integration

---

## Phase 4: Testing & Quality (P1)

**Timeline**: 3-4 days
**Priority**: 🟡 High

### 4.1 Update E2E Tests

**Update**: `examples/ssr-server/tests/e2e/ssr.spec.ts`

```typescript
// Update all tests to use new routing structure
test('should serialize state correctly', async ({ page }) => {
  const response = await page.goto('/');
  const html = await response?.text();

  expect(html).toContain('__COMPOSABLE_SVELTE_STATE__');

  const stateMatch = html?.match(
    /<script id="__COMPOSABLE_SVELTE_STATE__" type="application\/json">(.*?)<\/script>/s
  );
  expect(stateMatch).toBeTruthy();

  const serializedState = JSON.parse(stateMatch![1]);

  // Updated to use destination instead of selectedPostId
  expect(serializedState).toHaveProperty('posts');
  expect(serializedState).toHaveProperty('destination');
  expect(serializedState).toHaveProperty('comments');
  expect(serializedState.destination).toEqual({ type: 'list' });
});

// Add new route tests
test('should render post detail page from URL', async ({ page }) => {
  await page.goto('/posts/2');
  await expect(page.locator('h1')).toContainText('Understanding Server-Side Rendering');
});

test('should render comments page from URL', async ({ page }) => {
  await page.goto('/posts/1/comments');
  await expect(page.locator('h1')).toContainText('Comments on');
});

// Add security tests
test('should have security headers', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.headers()['x-content-type-options']).toBe('nosniff');
  expect(response?.headers()['x-frame-options']).toBe('DENY');
  expect(response?.headers()['content-security-policy']).toBeTruthy();
});

// Add caching tests
test('should cache responses with ETag', async ({ page }) => {
  const response1 = await page.goto('/');
  const etag = response1?.headers()['etag'];
  expect(etag).toBeTruthy();

  const cacheControl = response1?.headers()['cache-control'];
  expect(cacheControl).toContain('max-age');
});

// Add performance tests
test('should respond within 200ms', async ({ page }) => {
  const start = Date.now();
  await page.goto('/');
  const duration = Date.now() - start;
  expect(duration).toBeLessThan(200);
});
```

### 4.2 Add Unit Tests for Security

**Create**: `packages/core/tests/ssr/security.test.ts`

```typescript
import { describe, test, expect } from 'vitest';
import { sanitizeHTML, createSecurityHeaders } from '../../src/lib/ssr';

describe('HTML Sanitization', () => {
  test('should remove script tags', () => {
    const dirty = '<script>alert("XSS")</script><p>Hello</p>';
    const clean = sanitizeHTML(dirty);
    expect(clean).toBe('<p>Hello</p>');
  });

  test('should preserve safe HTML', () => {
    const html = '<p><strong>Bold</strong> and <em>italic</em></p>';
    const clean = sanitizeHTML(html);
    expect(clean).toContain('<strong>Bold</strong>');
    expect(clean).toContain('<em>italic</em>');
  });

  test('should remove javascript: URLs', () => {
    const dirty = '<a href="javascript:alert(1)">Click</a>';
    const clean = sanitizeHTML(dirty);
    expect(clean).not.toContain('javascript:');
  });
});

describe('Security Headers', () => {
  test('should generate all security headers', () => {
    const headers = createSecurityHeaders();
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Content-Security-Policy']).toBeTruthy();
  });
});
```

### 4.3 Add Performance Benchmarks

**Create**: `examples/ssr-server/benchmarks/render-performance.ts`

```typescript
/**
 * Performance benchmarks for SSR rendering.
 */

import { performance } from 'perf_hooks';

async function benchmarkRender(url: string, iterations: number = 100) {
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fetch(`http://localhost:3000${url}`);
    const end = performance.now();
    times.push(end - start);
  }

  const avg = times.reduce((a, b) => a + b) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const p95 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];

  console.log(`\nBenchmark: ${url}`);
  console.log(`  Average: ${avg.toFixed(2)}ms`);
  console.log(`  Min: ${min.toFixed(2)}ms`);
  console.log(`  Max: ${max.toFixed(2)}ms`);
  console.log(`  P95: ${p95.toFixed(2)}ms`);
}

// Run benchmarks
await benchmarkRender('/');
await benchmarkRender('/posts/1');
await benchmarkRender('/posts/1/comments');
```

**Deliverables**:
- ✅ Updated E2E tests for new routes
- ✅ Security unit tests
- ✅ Performance benchmarks
- ✅ Test documentation

---

## Phase 5: Documentation & Developer Experience (P2)

**Timeline**: 2-3 days
**Priority**: 🟢 Medium

### 5.1 Framework Documentation

**Create**: `packages/core/src/lib/ssr/README.md`

Comprehensive SSR guide covering:
- Getting started
- Security best practices
- Performance optimization
- Error handling
- Caching strategies
- Deployment guide

### 5.2 Example README

**Create**: `examples/ssr-server/README.md`

```markdown
# Composable Svelte SSR Example

Production-ready server-side rendering example with Fastify.

## Features

- ✅ Server-side rendering with Svelte 5
- ✅ Client-side hydration
- ✅ URL routing with parameters
- ✅ Security hardening (headers, rate limiting, XSS protection)
- ✅ HTTP caching with ETags
- ✅ Compression (Brotli + Gzip)
- ✅ Error handling (404, 500)
- ✅ Request validation
- ✅ Performance monitoring

## Quick Start

\`\`\`bash
# Install dependencies
pnpm install

# Development
pnpm dev

# Production build
pnpm build

# Start production server
pnpm start
\`\`\`

## Architecture

[Detailed architecture explanation]

## Deployment

[Production deployment guide]

## Performance

[Performance benchmarks and optimization tips]
```

### 5.3 API Documentation

**Create**: `packages/core/src/lib/ssr/API.md`

Complete API reference for all SSR utilities.

**Deliverables**:
- ✅ Framework documentation
- ✅ Example README
- ✅ API reference
- ✅ Deployment guide

---

## Phase 6: Deployment & DevOps (P2)

**Timeline**: 2 days
**Priority**: 🟢 Medium

### 6.1 Docker Configuration

**Create**: `examples/ssr-server/Dockerfile`

```dockerfile
# Multi-stage build for production
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY packages/core ./packages/core
COPY examples/ssr-server ./examples/ssr-server

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build
WORKDIR /app/examples/ssr-server
RUN pnpm build

# Production image
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy built files
COPY --from=builder /app/examples/ssr-server/dist ./dist
COPY --from=builder /app/examples/ssr-server/package.json ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# Start server
CMD ["node", "dist/server/index.js"]
```

**Create**: `examples/ssr-server/docker-compose.yml`

```yaml
version: '3.8'

services:
  ssr-server:
    build: .
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      HOST: 0.0.0.0
      PORT: 3000
      LOG_LEVEL: info
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 3s
      retries: 3
```

### 6.2 Structured Logging

**Framework**: Add to `packages/core/src/lib/ssr/logging.ts`

```typescript
/**
 * Structured logging utilities for SSR applications.
 * Provides Pino logger integration with sensible defaults.
 */

export interface LoggerOptions {
  /** Log level */
  level?: 'debug' | 'info' | 'warn' | 'error';

  /** Pretty print for development */
  pretty?: boolean;

  /** Custom serializers */
  serializers?: Record<string, (value: any) => any>;

  /** Redact sensitive fields */
  redact?: string[];
}

/**
 * Create a Pino logger with SSR-friendly defaults.
 */
export async function createSSRLogger(options: LoggerOptions = {}) {
  const pino = await import('pino');

  const config: any = {
    level: options.level || 'info',
    serializers: {
      req: (req: any) => ({
        method: req.method,
        url: req.url,
        headers: {
          host: req.headers.host,
          'user-agent': req.headers['user-agent']
        },
        remoteAddress: req.ip,
        remotePort: req.socket?.remotePort
      }),
      res: (res: any) => ({
        statusCode: res.statusCode
      }),
      err: pino.default.stdSerializers.err,
      ...options.serializers
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.password',
        '*.token',
        '*.secret',
        ...(options.redact || [])
      ],
      remove: true
    }
  };

  // Pretty print for development
  if (options.pretty) {
    const pinoPretty = await import('pino-pretty');
    return pino.default(config, pinoPretty.default({
      colorize: true,
      ignore: 'pid,hostname',
      translateTime: 'HH:MM:ss'
    }));
  }

  return pino.default(config);
}

/**
 * Setup Fastify logging with Pino.
 */
export async function setupFastifyLogging(
  fastify: any,
  options: LoggerOptions = {}
) {
  const logger = await createSSRLogger(options);
  fastify.log = logger;

  // Log requests
  fastify.addHook('onRequest', async (request: any) => {
    request.log.info({ req: request }, 'incoming request');
  });

  // Log responses
  fastify.addHook('onResponse', async (request: any, reply: any) => {
    request.log.info({
      req: request,
      res: reply,
      responseTime: reply.getResponseTime()
    }, 'request completed');
  });
}
```

**Example Integration**: `examples/ssr-server/src/server/index.ts`

```typescript
import { setupFastifyLogging } from '@composable-svelte/core/ssr';

// Setup logging before any routes
await setupFastifyLogging(app, {
  level: process.env.LOG_LEVEL as any || 'info',
  pretty: process.env.NODE_ENV !== 'production'
});

// Use logger throughout the app
app.log.info('Server starting...');

// In routes
app.get('/', async (request, reply) => {
  request.log.debug({ path: request.url }, 'rendering page');
  // ...
});

// In error handlers
app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, 'unhandled error');
  // ...
});
```

### 6.3 Environment Configuration

**Create**: `examples/ssr-server/.env.example`

```bash
# Server Configuration
NODE_ENV=production
HOST=0.0.0.0
PORT=3000

# Logging
LOG_LEVEL=info

# Security
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000

# Caching
CACHE_TTL_MS=60000
CACHE_MAX_SIZE=100

# Performance
COMPRESSION_THRESHOLD=1024
```

### 6.3 CI/CD Pipeline

**Create**: `examples/ssr-server/.github/workflows/deploy.yml`

```yaml
name: Deploy SSR Server

on:
  push:
    branches: [main]
    paths:
      - 'examples/ssr-server/**'
      - 'packages/core/src/lib/ssr/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install
      - run: pnpm --filter ssr-server-example build
      - run: pnpm --filter ssr-server-example test:e2e

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/build-push-action@v5
        with:
          context: .
          file: examples/ssr-server/Dockerfile
          push: true
          tags: ghcr.io/${{ github.repository }}/ssr-server:latest
```

**Deliverables**:
- ✅ Dockerfile (optimized multi-stage build)
- ✅ docker-compose.yml
- ✅ Structured logging (Pino)
- ✅ Environment configuration
- ✅ CI/CD pipeline (GitHub Actions)
- ✅ Deployment documentation

---

## Summary

### Timeline

- **Phase 1 (P0)**: Security Hardening - 2-3 days
- **Phase 2 (P0)**: Error Handling - 2 days
- **Phase 3 (P1)**: Performance - 3-4 days
- **Phase 4 (P1)**: Testing - 3-4 days
- **Phase 5 (P2)**: Documentation - 2-3 days
- **Phase 6 (P2)**: Deployment - 2 days

**Total**: ~14-18 days

### Key Deliverables

**Framework (Reusable)**:
- ✅ Security middleware (headers, sanitization, rate limiting)
- ✅ Error handling utilities (404/500 pages, validation)
- ✅ Graceful shutdown handler
- ✅ Environment validation framework
- ✅ Request validation framework
- ✅ HTTP caching utilities (ETag, Cache-Control, SSRCache)
- ✅ Compression helpers (Brotli + Gzip)
- ✅ Structured logging (Pino integration)
- ✅ Comprehensive documentation with security guide

**Example (Reference Implementation)**:
- ✅ Production-ready SSR server
- ✅ Complete E2E test suite
- ✅ Performance benchmarks
- ✅ Docker deployment
- ✅ CI/CD pipeline

### Success Criteria

- ✅ Zero security vulnerabilities
- ✅ Sub-200ms server response time
- ✅ 95%+ test coverage for SSR utilities
- ✅ Complete documentation
- ✅ Production deployment working
- ✅ All E2E tests passing
- ✅ Performance benchmarks meeting targets

---

## Next Steps

1. **Start with Phase 1**: Security is critical - begin immediately
2. **Parallel Phase 2**: Error handling can be developed alongside security
3. **Sequential Phases 3-6**: Build on previous phases

Would you like to proceed with Phase 1: Security Hardening?
