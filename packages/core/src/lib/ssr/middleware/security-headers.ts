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

  fastify.addHook('onRequest', async (request: any, reply: any) => {
    Object.entries(headers).forEach(([key, value]) => {
      reply.header(key, value);
    });
  });
}
