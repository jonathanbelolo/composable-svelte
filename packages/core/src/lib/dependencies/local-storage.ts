/**
 * LocalStorage implementation with type safety and namespacing.
 *
 * Provides injectable localStorage for reducers with JSON serialization,
 * optional schema validation, and cross-tab synchronization.
 *
 * @module
 */

import type { Storage, SyncStorage, StorageConfig, StorageEventListener, Unsubscribe } from './storage.js';
import {
	StorageQuotaExceededError,
	InvalidJSONError,
	SchemaValidationError,
	EnvironmentNotSupportedError
} from './errors.js';
import { isBrowser, isStorageAvailable } from './utils.js';

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
export function createLocalStorage<T = unknown>(
	config: StorageConfig<T> = {}
): SyncStorage<T> {
	// Check environment
	if (!isBrowser()) {
		throw new EnvironmentNotSupportedError('localStorage', 'server-side');
	}

	if (!isStorageAvailable(window.localStorage)) {
		throw new EnvironmentNotSupportedError(
			'localStorage',
			'current browser (may be disabled or in private mode)'
		);
	}

	const { prefix = '', validator, debug = false } = config;
	const listeners = new Set<StorageEventListener<T>>();

	// Internal helper: add prefix to key
	function _prefixKey(key: string): string {
		return prefix + key;
	}

	// Internal helper: remove prefix from key
	function _unprefixKey(key: string): string {
		return prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key;
	}

	// Internal helper: log debug message
	function _log(message: string, ...args: unknown[]): void {
		if (debug) {
			console.log(`[LocalStorage${prefix ? ` ${prefix}` : ''}] ${message}`, ...args);
		}
	}

	// Internal helper: parse JSON with error handling
	function _parseJSON(key: string, raw: string): T | null {
		try {
			const parsed = JSON.parse(raw);

			// Validate if validator provided
			if (validator && !validator(parsed)) {
				_log(`Validation failed for key "${key}"`, parsed);
				return null;
			}

			return parsed as T;
		} catch (error) {
			_log(`Failed to parse JSON for key "${key}"`, error);
			return null;
		}
	}

	// Setup storage event listener for cross-tab sync
	if (typeof window !== 'undefined') {
		window.addEventListener('storage', (event) => {
			// Only process events for our prefix
			if (!event.key || !event.key.startsWith(prefix)) {
				return;
			}

			const key = _unprefixKey(event.key);
			const newValue = event.newValue ? _parseJSON(key, event.newValue) : null;
			const oldValue = event.oldValue ? _parseJSON(key, event.oldValue) : null;

			_log(`Storage event for key "${key}"`, { newValue, oldValue });

			const eventData = {
				key,
				newValue,
				oldValue,
				url: event.url || ''
			};

			listeners.forEach((listener) => {
				try {
					listener(eventData);
				} catch (error) {
					console.error('[LocalStorage] Error in listener:', error);
				}
			});
		});
	}

	return {
		getItem(key: string): T | null {
			const prefixedKey = _prefixKey(key);
			const raw = window.localStorage.getItem(prefixedKey);

			if (raw === null) {
				_log(`Get key "${key}": not found`);
				return null;
			}

			const value = _parseJSON(key, raw);
			_log(`Get key "${key}":`, value);
			return value;
		},

		setItem(key: string, value: T): void {
			const prefixedKey = _prefixKey(key);
			const serialized = JSON.stringify(value);

			try {
				window.localStorage.setItem(prefixedKey, serialized);
				_log(`Set key "${key}":`, value);
			} catch (error) {
				// Check if it's a quota error
				if (
					error instanceof DOMException &&
					(error.name === 'QuotaExceededError' || error.code === 22)
				) {
					throw new StorageQuotaExceededError(key, serialized.length, null);
				}
				throw error;
			}
		},

		removeItem(key: string): void {
			const prefixedKey = _prefixKey(key);
			window.localStorage.removeItem(prefixedKey);
			_log(`Remove key "${key}"`);
		},

		keys(): string[] {
			const allKeys: string[] = [];

			for (let i = 0; i < window.localStorage.length; i++) {
				const key = window.localStorage.key(i);
				if (key && key.startsWith(prefix)) {
					allKeys.push(_unprefixKey(key));
				}
			}

			_log(`Get keys:`, allKeys);
			return allKeys;
		},

		has(key: string): boolean {
			const prefixedKey = _prefixKey(key);
			const exists = window.localStorage.getItem(prefixedKey) !== null;
			_log(`Has key "${key}":`, exists);
			return exists;
		},

		clear(): void {
			// Only clear keys with our prefix
			const keysToRemove = this.keys();
			keysToRemove.forEach((key) => {
				window.localStorage.removeItem(_prefixKey(key));
			});
			_log(`Cleared ${keysToRemove.length} keys`);
		},

		size(): number {
			const count = this.keys().length;
			_log(`Size:`, count);
			return count;
		},

		subscribe(listener: StorageEventListener<T>): Unsubscribe {
			listeners.add(listener);
			_log(`Subscribed listener (total: ${listeners.size})`);

			return () => {
				listeners.delete(listener);
				_log(`Unsubscribed listener (total: ${listeners.size})`);
			};
		}
	};
}

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
export function createSessionStorage<T = unknown>(
	config: StorageConfig<T> = {}
): Storage<T> {
	// Check environment
	if (!isBrowser()) {
		throw new EnvironmentNotSupportedError('sessionStorage', 'server-side');
	}

	if (!isStorageAvailable(window.sessionStorage)) {
		throw new EnvironmentNotSupportedError(
			'sessionStorage',
			'current browser (may be disabled)'
		);
	}

	const { prefix = '', validator, debug = false } = config;

	// Internal helper: add prefix to key
	function _prefixKey(key: string): string {
		return prefix + key;
	}

	// Internal helper: remove prefix from key
	function _unprefixKey(key: string): string {
		return prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key;
	}

	// Internal helper: log debug message
	function _log(message: string, ...args: unknown[]): void {
		if (debug) {
			console.log(`[SessionStorage${prefix ? ` ${prefix}` : ''}] ${message}`, ...args);
		}
	}

	// Internal helper: parse JSON with error handling
	function _parseJSON(key: string, raw: string): T | null {
		try {
			const parsed = JSON.parse(raw);

			// Validate if validator provided
			if (validator && !validator(parsed)) {
				_log(`Validation failed for key "${key}"`, parsed);
				return null;
			}

			return parsed as T;
		} catch (error) {
			_log(`Failed to parse JSON for key "${key}"`, error);
			return null;
		}
	}

	return {
		getItem(key: string): T | null {
			const prefixedKey = _prefixKey(key);
			const raw = window.sessionStorage.getItem(prefixedKey);

			if (raw === null) {
				_log(`Get key "${key}": not found`);
				return null;
			}

			const value = _parseJSON(key, raw);
			_log(`Get key "${key}":`, value);
			return value;
		},

		setItem(key: string, value: T): void {
			const prefixedKey = _prefixKey(key);
			const serialized = JSON.stringify(value);

			try {
				window.sessionStorage.setItem(prefixedKey, serialized);
				_log(`Set key "${key}":`, value);
			} catch (error) {
				// Check if it's a quota error
				if (
					error instanceof DOMException &&
					(error.name === 'QuotaExceededError' || error.code === 22)
				) {
					throw new StorageQuotaExceededError(key, serialized.length, null);
				}
				throw error;
			}
		},

		removeItem(key: string): void {
			const prefixedKey = _prefixKey(key);
			window.sessionStorage.removeItem(prefixedKey);
			_log(`Remove key "${key}"`);
		},

		keys(): string[] {
			const allKeys: string[] = [];

			for (let i = 0; i < window.sessionStorage.length; i++) {
				const key = window.sessionStorage.key(i);
				if (key && key.startsWith(prefix)) {
					allKeys.push(_unprefixKey(key));
				}
			}

			_log(`Get keys:`, allKeys);
			return allKeys;
		},

		has(key: string): boolean {
			const prefixedKey = _prefixKey(key);
			const exists = window.sessionStorage.getItem(prefixedKey) !== null;
			_log(`Has key "${key}":`, exists);
			return exists;
		},

		clear(): void {
			// Only clear keys with our prefix
			const keysToRemove = this.keys();
			keysToRemove.forEach((key) => {
				window.sessionStorage.removeItem(_prefixKey(key));
			});
			_log(`Cleared ${keysToRemove.length} keys`);
		},

		size(): number {
			const count = this.keys().length;
			_log(`Size:`, count);
			return count;
		}
	};
}

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
/**
 * What {@link createMockStorage} adds beyond `SyncStorage`.
 *
 * The `simulate*` naming matches `createMockWebSocket`, which already uses
 * `simulateMessage` / `simulateEvent` / `simulateDisconnect` / `reset` for the
 * same idea: a method that models something the outside world did, as distinct
 * from something this object was asked to do.
 */
export interface MockStorage<T = unknown> extends SyncStorage<T> {
	/**
	 * Another browsing context wrote this key.
	 *
	 * Updates the store and then notifies every subscriber. This is the only
	 * path that fires `subscribe`; `setItem` deliberately does not, because no
	 * browser delivers a `storage` event to the tab that caused it.
	 */
	simulateSetItem(key: string, value: T, url?: string): void;

	/** Another browsing context removed this key. */
	simulateRemoveItem(key: string, url?: string): void;

	/**
	 * The backing store: prefixed keys, serialized values.
	 *
	 * For assertions the `Storage` interface cannot make — that a value was
	 * written under the prefix you expected, or serialized the way you expected.
	 */
	readonly data: Readonly<Record<string, string>>;

	/** Empty the store and drop every subscriber. */
	reset(): void;
}

/**
 * An in-memory `SyncStorage`, for tests.
 *
 * The counterpart to `createMockCookieStorage`, which has existed all along —
 * the localStorage/sessionStorage pair simply never got one. `createNoopStorage`
 * discards writes and reads back `null`, which models "storage unavailable"
 * and cannot express a round trip, so callers hand-rolled their own: core's own
 * `local-storage.test.ts` built one and used it 48 times, and `auth` wrote a
 * narrow `{ put, take }` for OAuth rather than widen this surface mid-feature.
 *
 * **Values are stored as JSON strings, not as live objects.** That is what
 * makes it a faithful double rather than a convenient one: a `Date` put in
 * comes back as a string, exactly as it would through real storage. A `Map<string, T>`
 * would hide that, and hiding it is how a test passes and production does not.
 *
 * **`setItem` does not notify subscribers, and that is the contract.**
 * `SyncStorage.subscribe` fires only "for changes from different browsing
 * contexts", and no browser dispatches `storage` to the tab that made the
 * write. Use {@link MockStorage.simulateSetItem} to model another tab — which
 * is the first way `subscribe` has ever been testable at all.
 *
 * @example
 * ```typescript
 * import { createMockStorage } from '@composable-svelte/core';
 *
 * const storage = createMockStorage<{ name: string }>();
 * storage.setItem('user', { name: 'Ada' });
 * const user: { name: string } | null = storage.getItem('user');
 *
 * // Another tab writes; only this fires `subscribe`.
 * const stop = storage.subscribe((event) => console.log(event.key, event.newValue));
 * storage.simulateSetItem('user', { name: 'Grace' });
 * stop();
 * ```
 */
export function createMockStorage<T = unknown>(config: StorageConfig<T> = {}): MockStorage<T> {
	const { prefix = '', validator, debug = false } = config;
	const store = new Map<string, string>();
	const listeners = new Set<StorageEventListener<T>>();

	const full = (key: string): string => prefix + key;
	const bare = (key: string): string =>
		prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key;

	const log = (message: string, ...args: unknown[]): void => {
		if (debug) console.log(`[MockStorage${prefix ? ` ${prefix}` : ''}] ${message}`, ...args);
	};

	// Mirrors `_parseJSON` above, validator included — so a stored value the
	// validator rejects reads back as `null` here exactly as it does for real.
	const parse = (key: string, raw: string | undefined): T | null => {
		if (raw === undefined) return null;
		try {
			const parsed: unknown = JSON.parse(raw);
			if (validator && !validator(parsed)) {
				log(`Validation failed for key "${key}"`, parsed);
				return null;
			}
			return parsed as T;
		} catch (error) {
			log(`Failed to parse JSON for key "${key}"`, error);
			return null;
		}
	};

	const notify = (key: string, newValue: T | null, oldValue: T | null, url: string): void => {
		listeners.forEach((listener) => {
			try {
				listener({ key, newValue, oldValue, url });
			} catch (error) {
				// One bad listener must not stop the others, as in the real one.
				console.error('[MockStorage] Error in listener:', error);
			}
		});
	};

	return {
		getItem(key: string): T | null {
			return parse(key, store.get(full(key)));
		},
		setItem(key: string, value: T): void {
			// Deliberately silent: see the note above about browsing contexts.
			store.set(full(key), JSON.stringify(value));
		},
		removeItem(key: string): void {
			store.delete(full(key));
		},
		keys(): string[] {
			return [...store.keys()].filter((k) => k.startsWith(prefix)).map(bare);
		},
		has(key: string): boolean {
			return store.has(full(key));
		},
		clear(): void {
			for (const key of [...store.keys()]) {
				if (key.startsWith(prefix)) store.delete(key);
			}
		},
		size(): number {
			return this.keys().length;
		},
		subscribe(listener: StorageEventListener<T>): Unsubscribe {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		simulateSetItem(key: string, value: T, url = ''): void {
			const oldValue = parse(key, store.get(full(key)));
			store.set(full(key), JSON.stringify(value));
			notify(key, parse(key, store.get(full(key))), oldValue, url);
		},
		simulateRemoveItem(key: string, url = ''): void {
			const oldValue = parse(key, store.get(full(key)));
			store.delete(full(key));
			notify(key, null, oldValue, url);
		},
		get data(): Readonly<Record<string, string>> {
			return Object.fromEntries(store);
		},
		reset(): void {
			store.clear();
			listeners.clear();
		}
	};
}

export function createNoopStorage<T = unknown>(): Storage<T> {
	return {
		getItem(): T | null {
			return null;
		},
		setItem(): void {
			// No-op
		},
		removeItem(): void {
			// No-op
		},
		keys(): string[] {
			return [];
		},
		has(): boolean {
			return false;
		},
		clear(): void {
			// No-op
		},
		size(): number {
			return 0;
		}
	};
}
