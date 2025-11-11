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
