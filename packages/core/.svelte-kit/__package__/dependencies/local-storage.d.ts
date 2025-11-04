/**
 * LocalStorage implementation with type safety and namespacing.
 *
 * Provides injectable localStorage for reducers with JSON serialization,
 * optional schema validation, and cross-tab synchronization.
 *
 * @module
 */
import type { Storage, SyncStorage, StorageConfig } from './storage.js';
/**
 * Create localStorage wrapper with type safety.
 *
 * @template T - Type of values stored
 * @param config - Storage configuration
 * @returns LocalStorage instance with cross-tab sync
 * @throws {EnvironmentNotSupportedError} When localStorage is unavailable
 *
 * @example
 * ```typescript
 * // Basic usage
 * const storage = createLocalStorage<{ name: string; id: number }>();
 * storage.setItem('user', { name: 'Alice', id: 123 });
 *
 * // With prefix and validation
 * const authStorage = createLocalStorage<User>({
 *   prefix: 'auth:',
 *   validator: (v): v is User => typeof v.name === 'string'
 * });
 * ```
 */
export declare function createLocalStorage<T = unknown>(config?: StorageConfig<T>): SyncStorage<T>;
/**
 * Create sessionStorage wrapper with type safety.
 *
 * Similar to localStorage but data persists only for the session
 * (cleared when tab/window is closed). Does NOT support cross-tab sync.
 *
 * @template T - Type of values stored
 * @param config - Storage configuration
 * @returns SessionStorage instance (no cross-tab sync)
 * @throws {EnvironmentNotSupportedError} When sessionStorage is unavailable
 *
 * @example
 * ```typescript
 * const storage = createSessionStorage<FormData>({
 *   prefix: 'form:'
 * });
 * storage.setItem('draft', { title: 'My Post', content: '...' });
 * ```
 */
export declare function createSessionStorage<T = unknown>(config?: StorageConfig<T>): Storage<T>;
/**
 * Create no-op storage for SSR contexts.
 * All operations are safe no-ops that return null/empty.
 *
 * @template T - Type of values stored
 * @returns Storage instance that does nothing
 *
 * @example
 * ```typescript
 * const storage = isBrowser()
 *   ? createLocalStorage<User>()
 *   : createNoopStorage<User>();
 * ```
 */
export declare function createNoopStorage<T = unknown>(): Storage<T>;
//# sourceMappingURL=local-storage.d.ts.map