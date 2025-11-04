/**
 * Cookie storage implementation with type safety and internal registry.
 *
 * Provides injectable cookie storage for reducers with JSON serialization,
 * 4KB size validation, and reliable removal via internal registry.
 *
 * @module
 */
import type { CookieStorage, CookieConfig } from './storage.js';
/**
 * Create cookie storage wrapper with type safety.
 *
 * Uses internal registry to track cookie options for reliable removal.
 * Validates 4KB size limit per cookie.
 *
 * @template T - Type of values stored
 * @param config - Cookie configuration
 * @returns CookieStorage instance
 * @throws {EnvironmentNotSupportedError} When cookies are unavailable
 *
 * @example
 * ```typescript
 * // Basic usage
 * const cookies = createCookieStorage<{ token: string }>();
 * cookies.setItem('session', { token: 'abc123' });
 *
 * // With secure defaults
 * const secureCookies = createCookieStorage<string>({
 *   secure: true,
 *   sameSite: 'Strict',
 *   maxAge: 3600
 * });
 * ```
 */
export declare function createCookieStorage<T = unknown>(config?: CookieConfig<T>): CookieStorage<T>;
/**
 * Create mock cookie storage for testing.
 * Stores cookies in memory without browser APIs.
 *
 * @template T - Type of values stored
 * @param config - Cookie configuration
 * @returns CookieStorage instance for testing
 *
 * @example
 * ```typescript
 * const cookies = createMockCookieStorage<string>();
 * cookies.setItem('session', 'token123');
 * console.log(cookies.getItem('session')); // 'token123'
 * ```
 */
export declare function createMockCookieStorage<T = unknown>(config?: CookieConfig<T>): CookieStorage<T>;
//# sourceMappingURL=cookie-storage.d.ts.map