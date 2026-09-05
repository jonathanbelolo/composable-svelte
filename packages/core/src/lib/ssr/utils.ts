/**
 * SSR utility functions for environment detection and helpers.
 */

/**
 * Detects if code is running in a server environment.
 *
 * Checks for the absence of browser-specific globals:
 * - window
 * - document
 *
 * @returns true if running on server, false if in browser
 *
 * @example
 * ```typescript
 * if (isServer()) {
 *   // Skip browser-only code
 *   return;
 * }
 * // Safe to use window, document, etc.
 * ```
 */
export function isServer(): boolean {
  return typeof window === 'undefined' || typeof document === 'undefined';
}

/**
 * Detects if code is running in a browser environment.
 *
 * @returns true if running in browser, false if on server
 */
export function isBrowser(): boolean {
  return !isServer();
}

/**
 * Escapes HTML special characters to prevent XSS.
 *
 * For text in ordinary markup and for attribute values (both quote
 * characters are escaped). State going into a `<script>` element uses
 * `escapeJSONInScript` in `render.ts` instead — see the note there.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** `escapeHtml`, named for the place it is used: a double-quoted attribute. */
export const escapeAttribute = escapeHtml;

/**
 * Percent-encode a URL path segment by segment, idempotently.
 *
 * Each segment is decoded first (a segment that is not valid percent-encoding
 * is taken as it is) and then encoded with `encodeURIComponent`, so an
 * already-encoded path is not double-encoded and `?`, `#` and `&` inside a
 * segment stay in the path rather than starting a query or fragment.
 * `encodeURI` did neither: `/a%20b` became `/a%2520b`, and `/a?x#y` kept its
 * `?` and `#` so a `?lang=` appended after it landed in the fragment
 * (R1-REVIEW 1.9). Pass a path, not a URL.
 */
export function encodePath(path: string): string {
  return path
    .split('/')
    .map((segment) => {
      let decoded = segment;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        // Not valid percent-encoding: encode what is there.
      }
      return encodeURIComponent(decoded);
    })
    .join('/');
}
