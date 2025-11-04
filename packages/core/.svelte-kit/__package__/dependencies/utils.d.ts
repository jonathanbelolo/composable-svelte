/**
 * Utility functions for dependency implementations.
 * Provides environment detection, quota checking, and byte size calculation.
 */
/**
 * Check if code is running in browser environment.
 *
 * @returns True if window and document are available (browser environment)
 *
 * @example
 * ```typescript
 * if (isBrowser()) {
 *   const storage = createLocalStorage();
 * } else {
 *   const storage = createNoopStorage();
 * }
 * ```
 */
export declare function isBrowser(): boolean;
/**
 * Get available storage space using Storage API.
 *
 * @returns Object with usage and quota in bytes, or null if not supported
 *
 * @example
 * ```typescript
 * const quota = await getStorageQuota();
 * if (quota && quota.usage > quota.quota * 0.9) {
 *   console.warn('Storage almost full');
 * }
 * ```
 */
export declare function getStorageQuota(): Promise<{
    usage: number;
    quota: number;
} | null>;
/**
 * Calculate byte size of string.
 * Uses Blob API for accurate UTF-8 byte counting.
 *
 * @param str - String to measure
 * @returns Size in bytes
 *
 * @example
 * ```typescript
 * const size = getByteSize('hello');  // 5
 * const size = getByteSize('hello 👋'); // 10 (emoji is 4 bytes)
 * ```
 */
export declare function getByteSize(str: string): number;
/**
 * Check if storage is available and working.
 * Some browsers disable storage in private mode or with certain settings.
 *
 * @param storage - Storage object to test (localStorage or sessionStorage)
 * @returns True if storage is available and working
 *
 * @example
 * ```typescript
 * if (!isStorageAvailable(window.localStorage)) {
 *   throw new EnvironmentNotSupportedError('localStorage', 'current browser');
 * }
 * ```
 */
export declare function isStorageAvailable(storage: Storage): boolean;
//# sourceMappingURL=utils.d.ts.map