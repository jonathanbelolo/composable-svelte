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
export function isBrowser() {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
}
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
export async function getStorageQuota() {
    if (!isBrowser() || !navigator.storage?.estimate) {
        return null;
    }
    try {
        const estimate = await navigator.storage.estimate();
        return {
            usage: estimate.usage ?? 0,
            quota: estimate.quota ?? 0
        };
    }
    catch (error) {
        // Storage API may throw in some environments (e.g., private browsing)
        console.warn('[Composable Svelte] Failed to get storage quota:', error);
        return null;
    }
}
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
export function getByteSize(str) {
    return new Blob([str]).size;
}
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
export function isStorageAvailable(storage) {
    try {
        const testKey = '__composable_svelte_test__';
        storage.setItem(testKey, 'test');
        storage.removeItem(testKey);
        return true;
    }
    catch {
        return false;
    }
}
