/**
 * Dependencies module - Injectable dependencies for reducers.
 *
 * Provides type-safe, testable dependencies for:
 * - Time operations (Clock)
 * - Storage (LocalStorage, SessionStorage, Cookies)
 *
 * All dependencies support mocking for deterministic testing.
 *
 * @module
 */
export { DependencyError, StorageQuotaExceededError, InvalidJSONError, SchemaValidationError, CookieSizeExceededError, EnvironmentNotSupportedError } from './errors.js';
export { isBrowser, getStorageQuota, getByteSize, isStorageAvailable } from './utils.js';
export type { Clock, MockClock } from './clock.js';
export { createSystemClock, createMockClock } from './clock.js';
export type { Storage, SyncStorage, StorageConfig, CookieConfig, CookieOptions, CookieStorage, SchemaValidator, StorageEventData, StorageEventListener, Unsubscribe } from './storage.js';
export { createLocalStorage, createSessionStorage, createNoopStorage } from './local-storage.js';
export { createCookieStorage, createMockCookieStorage } from './cookie-storage.js';
//# sourceMappingURL=index.d.ts.map