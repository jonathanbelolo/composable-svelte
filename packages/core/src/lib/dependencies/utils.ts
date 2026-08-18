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
export function isBrowser(): boolean {
	return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Check whether the library is running in a development build.
 *
 * Reads Vite's `import.meta.env.DEV` when a bundler injected it, and otherwise
 * falls back to `process.env.NODE_ENV`. Consuming `import.meta.env` directly
 * throws in a plain Node SSR process, where `import.meta` has no `env`.
 *
 * This is the one place in the package that touches `import.meta`, so
 * `svelte-package` warns about a single module rather than eight.
 *
 * @returns True when running a development build
 *
 * @example
 * ```typescript
 * if (isDev()) {
 *   console.warn('[Composable Svelte] destination is missing a `type` field');
 * }
 * ```
 */
export function isDev(): boolean {
	try {
		const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
		if (env) return Boolean(env.DEV);
	} catch {
		// `import.meta` is unavailable in a CommonJS interop context.
	}

	return typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
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
export async function getStorageQuota(): Promise<{
	usage: number;
	quota: number;
} | null> {
	if (!isBrowser() || !navigator.storage?.estimate) {
		return null;
	}

	try {
		const estimate = await navigator.storage.estimate();
		return {
			usage: estimate.usage ?? 0,
			quota: estimate.quota ?? 0
		};
	} catch (error) {
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
export function getByteSize(str: string): number {
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
export function isStorageAvailable(storage: Storage): boolean {
	try {
		const testKey = '__composable_svelte_test__';
		storage.setItem(testKey, 'test');
		storage.removeItem(testKey);
		return true;
	} catch {
		return false;
	}
}
