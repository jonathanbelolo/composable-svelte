/**
 * Storage dependency interfaces and base types.
 *
 * Provides type-safe, injectable storage for reducers.
 * Supports localStorage, sessionStorage, and cookies with optional schema validation.
 *
 * @module
 */
/**
 * Base storage interface.
 * Provides key-value storage with type safety and JSON serialization.
 *
 * @template T - Type of values stored (must be JSON-serializable)
 */
export interface Storage<T = unknown> {
    /**
     * Get item by key.
     * Returns null if key doesn't exist or value is invalid.
     *
     * @param key - Storage key
     * @returns Stored value or null
     *
     * @example
     * ```typescript
     * const user = storage.getItem('user');
     * if (user) {
     *   console.log(user.name);
     * }
     * ```
     */
    getItem(key: string): T | null;
    /**
     * Set item by key.
     * Serializes value to JSON before storing.
     *
     * @param key - Storage key
     * @param value - Value to store
     * @throws {StorageQuotaExceededError} When storage quota is exceeded
     * @throws {EnvironmentNotSupportedError} When storage is unavailable
     *
     * @example
     * ```typescript
     * storage.setItem('user', { name: 'Alice', id: 123 });
     * ```
     */
    setItem(key: string, value: T): void;
    /**
     * Remove item by key.
     *
     * @param key - Storage key
     *
     * @example
     * ```typescript
     * storage.removeItem('user');
     * ```
     */
    removeItem(key: string): void;
    /**
     * Get all keys in storage.
     * Keys are filtered by prefix if configured.
     *
     * @returns Array of storage keys
     *
     * @example
     * ```typescript
     * const keys = storage.keys();
     * console.log(keys); // ['user', 'settings', 'preferences']
     * ```
     */
    keys(): string[];
    /**
     * Check if key exists in storage.
     *
     * @param key - Storage key
     * @returns True if key exists
     *
     * @example
     * ```typescript
     * if (storage.has('user')) {
     *   console.log('User is logged in');
     * }
     * ```
     */
    has(key: string): boolean;
    /**
     * Clear all items from storage.
     * Only clears items with configured prefix if set.
     *
     * @example
     * ```typescript
     * storage.clear(); // Remove all items
     * ```
     */
    clear(): void;
    /**
     * Get number of items in storage.
     * Only counts items with configured prefix if set.
     *
     * @returns Number of items
     *
     * @example
     * ```typescript
     * console.log(`Storage has ${storage.size()} items`);
     * ```
     */
    size(): number;
}
/**
 * Schema validator function.
 * Returns true if value matches expected type/shape.
 *
 * @template T - Expected value type
 * @param value - Value to validate
 * @returns True if value is valid T
 *
 * @example
 * ```typescript
 * const isUser: SchemaValidator<User> = (value): value is User => {
 *   return typeof value === 'object' &&
 *          value !== null &&
 *          typeof value.name === 'string' &&
 *          typeof value.id === 'number';
 * };
 * ```
 */
export type SchemaValidator<T> = (value: unknown) => value is T;
/**
 * Storage configuration options.
 *
 * @template T - Type of values stored
 */
export interface StorageConfig<T = unknown> {
    /**
     * Key prefix for namespacing.
     * Prevents collisions between different storage instances.
     *
     * @example
     * ```typescript
     * createLocalStorage({ prefix: 'auth:' })
     * // Keys stored as "auth:user", "auth:token"
     * ```
     */
    prefix?: string;
    /**
     * Optional schema validator.
     * Validates values on retrieval, returns null if validation fails.
     *
     * @example
     * ```typescript
     * createLocalStorage<User>({
     *   validator: (v): v is User => typeof v.name === 'string'
     * })
     * ```
     */
    validator?: SchemaValidator<T>;
    /**
     * Enable debug logging.
     * Logs all storage operations to console.
     *
     * @default false
     */
    debug?: boolean;
}
/**
 * Cookie configuration options.
 * Extends StorageConfig with cookie-specific settings.
 */
export interface CookieConfig<T = unknown> extends StorageConfig<T> {
    /**
     * Default path for cookies.
     * @default '/'
     */
    path?: string;
    /**
     * Default domain for cookies.
     * @default undefined (current domain)
     */
    domain?: string;
    /**
     * Default secure flag.
     * Only send cookies over HTTPS.
     * @default false
     */
    secure?: boolean;
    /**
     * Default SameSite policy.
     * Controls when cookies are sent in cross-site requests.
     * @default 'Lax'
     */
    sameSite?: 'Strict' | 'Lax' | 'None';
    /**
     * Default max age in seconds.
     * @default undefined (session cookie)
     */
    maxAge?: number;
}
/**
 * Cookie options for individual set operations.
 * Allows per-cookie customization of default config.
 */
export interface CookieOptions {
    /**
     * Cookie path.
     * @default config.path or '/'
     */
    path?: string;
    /**
     * Cookie domain.
     * @default config.domain
     */
    domain?: string;
    /**
     * Secure flag.
     * @default config.secure or false
     */
    secure?: boolean;
    /**
     * SameSite policy.
     * @default config.sameSite or 'Lax'
     */
    sameSite?: 'Strict' | 'Lax' | 'None';
    /**
     * Max age in seconds.
     * @default config.maxAge (session cookie)
     */
    maxAge?: number;
    /**
     * Expiration date.
     * Alternative to maxAge using absolute date.
     * @default undefined
     */
    expires?: Date;
}
/**
 * Cookie storage interface.
 * Extends base Storage with cookie-specific methods.
 */
export interface CookieStorage<T = unknown> extends Storage<T> {
    /**
     * Set cookie with options.
     * Allows per-cookie configuration overrides.
     *
     * @param key - Cookie name
     * @param value - Value to store
     * @param options - Cookie options
     * @throws {CookieSizeExceededError} When cookie exceeds 4KB
     *
     * @example
     * ```typescript
     * cookies.setItem('session', token, {
     *   maxAge: 3600,
     *   secure: true,
     *   sameSite: 'Strict'
     * });
     * ```
     */
    setItem(key: string, value: T, options?: CookieOptions): void;
}
/**
 * Storage event data for cross-tab synchronization.
 * Emitted when storage is modified in another tab.
 */
export interface StorageEventData<T = unknown> {
    /**
     * Storage key that changed.
     */
    key: string;
    /**
     * New value (null if removed).
     */
    newValue: T | null;
    /**
     * Previous value (null if new key).
     */
    oldValue: T | null;
    /**
     * URL of page that made the change.
     */
    url: string;
}
/**
 * Storage event listener callback.
 *
 * @template T - Type of values stored
 * @param event - Storage event data
 *
 * @example
 * ```typescript
 * const unsubscribe = storage.subscribe((event) => {
 *   console.log(`Key "${event.key}" changed in another tab`);
 *   console.log('New value:', event.newValue);
 * });
 * ```
 */
export type StorageEventListener<T = unknown> = (event: StorageEventData<T>) => void;
/**
 * Unsubscribe function returned by storage.subscribe().
 */
export type Unsubscribe = () => void;
/**
 * Storage with cross-tab synchronization support.
 * Extends base Storage with event subscription.
 */
export interface SyncStorage<T = unknown> extends Storage<T> {
    /**
     * Subscribe to storage changes from other tabs.
     * Only fires for changes from different browsing contexts.
     *
     * @param listener - Event listener callback
     * @returns Unsubscribe function
     *
     * @example
     * ```typescript
     * const unsubscribe = storage.subscribe((event) => {
     *   if (event.key === 'user' && event.newValue === null) {
     *     // User logged out in another tab
     *     handleLogout();
     *   }
     * });
     *
     * // Later: unsubscribe()
     * ```
     */
    subscribe(listener: StorageEventListener<T>): Unsubscribe;
}
//# sourceMappingURL=storage.d.ts.map