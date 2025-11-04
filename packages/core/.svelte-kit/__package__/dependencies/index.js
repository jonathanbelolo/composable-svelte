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
// Error types
export { DependencyError, StorageQuotaExceededError, InvalidJSONError, SchemaValidationError, CookieSizeExceededError, EnvironmentNotSupportedError } from './errors.js';
// Utilities
export { isBrowser, getStorageQuota, getByteSize, isStorageAvailable } from './utils.js';
export { createSystemClock, createMockClock } from './clock.js';
// LocalStorage & SessionStorage
export { createLocalStorage, createSessionStorage, createNoopStorage } from './local-storage.js';
// Cookie Storage
export { createCookieStorage, createMockCookieStorage } from './cookie-storage.js';
