/**
 * Cookie storage implementation with type safety and internal registry.
 *
 * Provides injectable cookie storage for reducers with JSON serialization,
 * 4KB size validation, and reliable removal via internal registry.
 *
 * @module
 */
import { CookieSizeExceededError, EnvironmentNotSupportedError } from './errors.js';
import { isBrowser, getByteSize } from './utils.js';
/**
 * Cookie 4KB size limit (per RFC 6265).
 * Most browsers enforce 4096 bytes per cookie.
 */
const COOKIE_SIZE_LIMIT = 4096;
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
export function createCookieStorage(config = {}) {
    // Check environment
    if (!isBrowser()) {
        throw new EnvironmentNotSupportedError('cookies', 'server-side');
    }
    if (!navigator.cookieEnabled) {
        throw new EnvironmentNotSupportedError('cookies', 'current browser (cookies disabled)');
    }
    const { prefix = '', validator, debug = false, path = '/', domain, secure = false, sameSite = 'Lax', maxAge } = config;
    // Internal registry: tracks cookie options for reliable removal
    const registry = new Map();
    // Internal helper: add prefix to key
    function _prefixKey(key) {
        return prefix + key;
    }
    // Internal helper: remove prefix from key
    function _unprefixKey(key) {
        return prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key;
    }
    // Internal helper: log debug message
    function _log(message, ...args) {
        if (debug) {
            console.log(`[CookieStorage${prefix ? ` ${prefix}` : ''}] ${message}`, ...args);
        }
    }
    // Internal helper: parse JSON with error handling
    function _parseJSON(key, raw) {
        try {
            const parsed = JSON.parse(raw);
            // Validate if validator provided
            if (validator && !validator(parsed)) {
                _log(`Validation failed for key "${key}"`, parsed);
                return null;
            }
            return parsed;
        }
        catch (error) {
            _log(`Failed to parse JSON for key "${key}"`, error);
            return null;
        }
    }
    // Internal helper: build cookie string from options
    function _buildCookieString(name, value, options) {
        const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
        // Path (always present)
        parts.push(`Path=${options.path}`);
        // Domain (optional)
        if (options.domain) {
            parts.push(`Domain=${options.domain}`);
        }
        // Max-Age (optional, takes precedence over expires)
        if (options.maxAge !== undefined) {
            parts.push(`Max-Age=${options.maxAge}`);
        }
        else if (options.expires) {
            parts.push(`Expires=${options.expires.toUTCString()}`);
        }
        // Secure flag
        if (options.secure) {
            parts.push('Secure');
        }
        // SameSite (validate SameSite=None requires Secure)
        if (options.sameSite) {
            if (options.sameSite === 'None' && !options.secure) {
                throw new Error('SameSite=None requires Secure flag');
            }
            parts.push(`SameSite=${options.sameSite}`);
        }
        const cookieString = parts.join('; ');
        // Validate size limit
        const size = getByteSize(cookieString);
        if (size > COOKIE_SIZE_LIMIT) {
            throw new CookieSizeExceededError(name, size);
        }
        return cookieString;
    }
    // Internal helper: parse document.cookie into key-value map
    function _parseCookies() {
        const cookies = new Map();
        if (!document.cookie) {
            return cookies;
        }
        const pairs = document.cookie.split(';');
        for (const pair of pairs) {
            const [name, ...valueParts] = pair.trim().split('=');
            const value = valueParts.join('='); // Handle values with '=' in them
            if (name) {
                cookies.set(decodeURIComponent(name), decodeURIComponent(value));
            }
        }
        return cookies;
    }
    return {
        getItem(key) {
            const prefixedKey = _prefixKey(key);
            const cookies = _parseCookies();
            const raw = cookies.get(prefixedKey);
            if (raw === undefined) {
                _log(`Get key "${key}": not found`);
                return null;
            }
            const value = _parseJSON(key, raw);
            _log(`Get key "${key}":`, value);
            return value;
        },
        setItem(key, value, options = {}) {
            const prefixedKey = _prefixKey(key);
            const serialized = JSON.stringify(value);
            // Merge options with config defaults
            const cookieOptions = {
                path: options.path ?? path,
                domain: options.domain ?? domain ?? '',
                secure: options.secure ?? secure,
                sameSite: options.sameSite ?? sameSite,
                ...(options.maxAge !== undefined || maxAge !== undefined ? { maxAge: options.maxAge ?? maxAge } : {}),
                ...(options.expires !== undefined ? { expires: options.expires } : {})
            };
            // Build and set cookie
            const cookieString = _buildCookieString(prefixedKey, serialized, cookieOptions);
            document.cookie = cookieString;
            // Register for reliable removal
            registry.set(prefixedKey, { options: cookieOptions });
            _log(`Set key "${key}":`, value, 'with options:', cookieOptions);
        },
        removeItem(key) {
            const prefixedKey = _prefixKey(key);
            const entry = registry.get(prefixedKey);
            if (!entry) {
                _log(`Remove key "${key}": not in registry, attempting default removal`);
                // Try default removal (may not work if path/domain differ)
                document.cookie = `${encodeURIComponent(prefixedKey)}=; Path=${path}; Max-Age=0`;
                return;
            }
            // Use registered options for reliable removal
            const parts = [
                `${encodeURIComponent(prefixedKey)}=`,
                `Path=${entry.options.path}`,
                'Max-Age=0'
            ];
            if (entry.options.domain) {
                parts.push(`Domain=${entry.options.domain}`);
            }
            document.cookie = parts.join('; ');
            // Clean up registry
            registry.delete(prefixedKey);
            _log(`Remove key "${key}"`);
        },
        keys() {
            const cookies = _parseCookies();
            const allKeys = [];
            for (const name of cookies.keys()) {
                if (name.startsWith(prefix)) {
                    allKeys.push(_unprefixKey(name));
                }
            }
            _log(`Get keys:`, allKeys);
            return allKeys;
        },
        has(key) {
            const prefixedKey = _prefixKey(key);
            const cookies = _parseCookies();
            const exists = cookies.has(prefixedKey);
            _log(`Has key "${key}":`, exists);
            return exists;
        },
        clear() {
            // Clear only cookies in our registry (we know their paths/domains)
            const keysToRemove = Array.from(registry.keys()).map(_unprefixKey);
            keysToRemove.forEach((key) => {
                this.removeItem(key);
            });
            _log(`Cleared ${keysToRemove.length} cookies`);
        },
        size() {
            const count = this.keys().length;
            _log(`Size:`, count);
            return count;
        }
    };
}
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
export function createMockCookieStorage(config = {}) {
    const { prefix = '', validator, debug = false } = config;
    // In-memory storage
    const store = new Map();
    const registry = new Map();
    // Internal helper: add prefix to key
    function _prefixKey(key) {
        return prefix + key;
    }
    // Internal helper: remove prefix from key
    function _unprefixKey(key) {
        return prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key;
    }
    // Internal helper: log debug message
    function _log(message, ...args) {
        if (debug) {
            console.log(`[MockCookieStorage${prefix ? ` ${prefix}` : ''}] ${message}`, ...args);
        }
    }
    // Internal helper: parse JSON with error handling
    function _parseJSON(key, raw) {
        try {
            const parsed = JSON.parse(raw);
            // Validate if validator provided
            if (validator && !validator(parsed)) {
                _log(`Validation failed for key "${key}"`, parsed);
                return null;
            }
            return parsed;
        }
        catch (error) {
            _log(`Failed to parse JSON for key "${key}"`, error);
            return null;
        }
    }
    return {
        getItem(key) {
            const prefixedKey = _prefixKey(key);
            const raw = store.get(prefixedKey);
            if (raw === undefined) {
                _log(`Get key "${key}": not found`);
                return null;
            }
            const value = _parseJSON(key, raw);
            _log(`Get key "${key}":`, value);
            return value;
        },
        setItem(key, value, options = {}) {
            const prefixedKey = _prefixKey(key);
            const serialized = JSON.stringify(value);
            // Validate size
            const size = getByteSize(serialized);
            if (size > COOKIE_SIZE_LIMIT) {
                throw new CookieSizeExceededError(key, size);
            }
            store.set(prefixedKey, serialized);
            // Register options
            registry.set(prefixedKey, {
                options: {
                    path: options.path ?? '/',
                    domain: options.domain ?? '',
                    ...(options.secure !== undefined ? { secure: options.secure } : {}),
                    ...(options.sameSite !== undefined ? { sameSite: options.sameSite } : {}),
                    ...(options.maxAge !== undefined ? { maxAge: options.maxAge } : {}),
                    ...(options.expires !== undefined ? { expires: options.expires } : {})
                }
            });
            _log(`Set key "${key}":`, value);
        },
        removeItem(key) {
            const prefixedKey = _prefixKey(key);
            store.delete(prefixedKey);
            registry.delete(prefixedKey);
            _log(`Remove key "${key}"`);
        },
        keys() {
            const allKeys = [];
            for (const name of store.keys()) {
                if (name.startsWith(prefix)) {
                    allKeys.push(_unprefixKey(name));
                }
            }
            _log(`Get keys:`, allKeys);
            return allKeys;
        },
        has(key) {
            const prefixedKey = _prefixKey(key);
            const exists = store.has(prefixedKey);
            _log(`Has key "${key}":`, exists);
            return exists;
        },
        clear() {
            const keysToRemove = this.keys();
            keysToRemove.forEach((key) => {
                this.removeItem(key);
            });
            _log(`Cleared ${keysToRemove.length} cookies`);
        },
        size() {
            const count = this.keys().length;
            _log(`Size:`, count);
            return count;
        }
    };
}
