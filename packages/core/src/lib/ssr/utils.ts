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
