/**
 * Security headers middleware for SSR applications.
 *
 * Adds essential security headers to prevent common attacks:
 * - XSS (Cross-Site Scripting)
 * - Clickjacking
 * - MIME type sniffing
 * - etc.
 */

/**
 * Every field is optional and merges over `defaultSecurityHeaders`: name only
 * what you change. `false` (or `undefined`) for a field drops that header.
 * `X-Content-Type-Options: nosniff` and `X-XSS-Protection` are always set.
 */
export interface SecurityHeadersConfig {
  /** Content Security Policy directive */
  contentSecurityPolicy?: string | false | undefined;

  /** X-Frame-Options value (DENY, SAMEORIGIN, or ALLOW-FROM) */
  frameOptions?: 'DENY' | 'SAMEORIGIN' | string | false | undefined;

  /** Referrer policy */
  referrerPolicy?: string | false | undefined;

  /** Enable HSTS (HTTP Strict Transport Security) */
  hsts?: boolean | { maxAge: number; includeSubDomains?: boolean | undefined } | undefined;

  /** Custom headers to add */
  customHeaders?: Record<string, string> | undefined;
}

import { installsOnParent } from './plugin.js';

export const defaultSecurityHeaders: SecurityHeadersConfig = {
  contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
  frameOptions: 'DENY',
  referrerPolicy: 'strict-origin-when-cross-origin',
  hsts: { maxAge: 31536000, includeSubDomains: true }
};

/**
 * Generate security headers object.
 * Works with any Node.js framework (Express, Fastify, etc.)
 *
 * The config merges over `defaultSecurityHeaders`. The first form used the
 * defaults only when the argument was absent, so `{}` — which is what
 * Fastify passes to a plugin registered without options — produced two
 * headers and no CSP, frame or HSTS policy (AUDIT-2026-09-03-FINDINGS SS3).
 */
export function createSecurityHeaders(
  options: SecurityHeadersConfig = {}
): Record<string, string> {
  const config: SecurityHeadersConfig = { ...defaultSecurityHeaders, ...options };
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
 *
 * `app.register(fastifySecurityHeaders, options)` installs the headers on the
 * registering instance's routes (the plugin carries Fastify's skip-override
 * marker); `fastifySecurityHeaders(app, options)` does the same directly —
 * the hook is added before the returned promise settles.
 */
export const fastifySecurityHeaders = installsOnParent(async function fastifySecurityHeaders(
  fastify: any,
  options: SecurityHeadersConfig = {}
): Promise<void> {
  const headers = createSecurityHeaders(options);

  fastify.addHook('onRequest', async (request: any, reply: any) => {
    Object.entries(headers).forEach(([key, value]) => {
      reply.header(key, value);
    });
  });
});
