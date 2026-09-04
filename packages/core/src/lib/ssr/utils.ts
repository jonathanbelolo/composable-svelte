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
