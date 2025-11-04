# Dependencies Module

Injectable dependencies for Composable Svelte reducers, enabling testable, pure functions with access to browser APIs.

## Overview

The dependencies module provides type-safe, mockable dependencies for:

- **Clock**: Controllable time operations for deterministic testing
- **Storage**: LocalStorage, SessionStorage, and Cookies with type safety
- **Error Handling**: Specific error types with contextual information

## Quick Start

### Clock Dependency

```typescript
import { createSystemClock, createMockClock } from '@composable-svelte/core/dependencies';

// Production: use system clock
const clock = createSystemClock();
console.log(clock.now()); // Current timestamp
console.log(clock.date()); // Current Date object
console.log(clock.toISO()); // ISO string

// Testing: use mock clock
const mockClock = createMockClock(0);
mockClock.advance(1000); // Advance by 1 second
console.log(mockClock.now()); // 1000
```

### LocalStorage

```typescript
import { createLocalStorage } from '@composable-svelte/core/dependencies';

// Basic usage
const storage = createLocalStorage<{ theme: string }>();
storage.setItem('preferences', { theme: 'dark' });
console.log(storage.getItem('preferences')); // { theme: 'dark' }

// With namespacing and validation
interface User {
	id: number;
	name: string;
}

const isUser = (v: unknown): v is User => {
	return typeof v === 'object' && v !== null &&
	       'id' in v && typeof v.id === 'number' &&
	       'name' in v && typeof v.name === 'string';
};

const storage = createLocalStorage<User>({
	prefix: 'auth:',
	validator: isUser,
	debug: true
});
```

### SessionStorage

```typescript
import { createSessionStorage } from '@composable-svelte/core/dependencies';

// Session-only storage (cleared on tab close)
const storage = createSessionStorage<FormDraft>({
	prefix: 'form:'
});

storage.setItem('draft', { title: 'My Post', content: '...' });
```

### Cookie Storage

```typescript
import { createCookieStorage } from '@composable-svelte/core/dependencies';

// Secure cookie storage
const cookies = createCookieStorage<string>({
	secure: true,
	sameSite: 'Strict',
	maxAge: 3600 // 1 hour
});

cookies.setItem('sessionToken', 'jwt_token', {
	path: '/app',
	secure: true,
	sameSite: 'Strict'
});
```

## Usage in Reducers

### Basic Example

```typescript
import type { Clock, Storage } from '@composable-svelte/core/dependencies';

interface State {
	lastSaved: number | null;
	draft: string;
}

interface Dependencies {
	clock: Clock;
	storage: Storage<string>;
}

type Action =
	| { type: 'saveDraft'; content: string }
	| { type: 'loadDraft' };

const reducer = (
	state: State,
	action: Action,
	deps: Dependencies
): [State, Effect<Action>] => {
	switch (action.type) {
		case 'saveDraft': {
			// Use dependencies in reducer
			deps.storage.setItem('draft', action.content);
			const timestamp = deps.clock.now();

			return [
				{ ...state, draft: action.content, lastSaved: timestamp },
				Effect.none()
			];
		}

		case 'loadDraft': {
			const draft = deps.storage.getItem('draft') ?? '';
			return [
				{ ...state, draft },
				Effect.none()
			];
		}
	}
};
```

### Testing with Mocks

```typescript
import { createMockClock, createNoopStorage } from '@composable-svelte/core/dependencies';

describe('Reducer', () => {
	it('should save draft with timestamp', () => {
		const mockClock = createMockClock(1000);
		const mockStorage = createMockStorage<string>();

		const deps = {
			clock: mockClock,
			storage: mockStorage
		};

		const [newState, effect] = reducer(
			{ lastSaved: null, draft: '' },
			{ type: 'saveDraft', content: 'Hello' },
			deps
		);

		expect(newState.lastSaved).toBe(1000);
		expect(newState.draft).toBe('Hello');
		expect(mockStorage.getItem('draft')).toBe('Hello');
	});
});
```

## API Reference

### Clock

```typescript
interface Clock {
	now(): number;
	date(): Date;
	toISO(timestamp?: number): string;
	fromISO(iso: string): number | null;
	format(timestamp?: number, locale?: string, options?: Intl.DateTimeFormatOptions): string;
}

// System clock (production)
createSystemClock(): Clock

// Mock clock (testing)
createMockClock(initialTime?: number): MockClock

interface MockClock extends Clock {
	advance(ms: number): void;
	setTime(timestamp: number): void;
}
```

### Storage

```typescript
interface Storage<T> {
	getItem(key: string): T | null;
	setItem(key: string, value: T): void;
	removeItem(key: string): void;
	keys(): string[];
	has(key: string): boolean;
	clear(): void;
	size(): number;
}

// LocalStorage (persistent)
createLocalStorage<T>(config?: StorageConfig<T>): SyncStorage<T>

// SessionStorage (tab-only)
createSessionStorage<T>(config?: StorageConfig<T>): Storage<T>

// NoopStorage (SSR-safe)
createNoopStorage<T>(): Storage<T>

interface StorageConfig<T> {
	prefix?: string;
	validator?: SchemaValidator<T>;
	debug?: boolean;
}
```

### Cookie Storage

```typescript
interface CookieStorage<T> extends Storage<T> {
	setItem(key: string, value: T, options?: CookieOptions): void;
}

createCookieStorage<T>(config?: CookieConfig<T>): CookieStorage<T>
createMockCookieStorage<T>(config?: CookieConfig<T>): CookieStorage<T>

interface CookieConfig<T> extends StorageConfig<T> {
	path?: string;
	domain?: string;
	secure?: boolean;
	sameSite?: 'Strict' | 'Lax' | 'None';
	maxAge?: number;
}

interface CookieOptions {
	path?: string;
	domain?: string;
	secure?: boolean;
	sameSite?: 'Strict' | 'Lax' | 'None';
	maxAge?: number;
	expires?: Date;
}
```

### Cross-Tab Synchronization

```typescript
interface SyncStorage<T> extends Storage<T> {
	subscribe(listener: StorageEventListener<T>): Unsubscribe;
}

type StorageEventListener<T> = (event: StorageEventData<T>) => void;

interface StorageEventData<T> {
	key: string;
	newValue: T | null;
	oldValue: T | null;
	url: string;
}

// Usage
const storage = createLocalStorage<User>();

const unsubscribe = storage.subscribe((event) => {
	if (event.key === 'user' && event.newValue === null) {
		// User logged out in another tab
		handleLogout();
	}
});
```

### Error Types

```typescript
class DependencyError extends Error {
	constructor(message: string, code: string);
}

class StorageQuotaExceededError extends DependencyError {
	constructor(key: string, attemptedSize: number, availableSpace: number | null);
}

class InvalidJSONError extends DependencyError {
	constructor(key: string, rawValue: string, parseError: Error);
}

class SchemaValidationError extends DependencyError {
	constructor(key: string, value: unknown, validationErrors: string[]);
}

class CookieSizeExceededError extends DependencyError {
	constructor(key: string, size: number);
}

class EnvironmentNotSupportedError extends DependencyError {
	constructor(feature: string, environment: string);
}
```

### Utilities

```typescript
// Environment detection
isBrowser(): boolean

// Storage quota (browser-only)
getStorageQuota(): Promise<{ usage: number; quota: number } | null>

// Byte size calculation
getByteSize(str: string): number

// Storage availability check
isStorageAvailable(storage: Storage): boolean
```

## Advanced Usage

### Schema Validation

```typescript
interface User {
	id: number;
	name: string;
	roles: string[];
}

const isUser = (value: unknown): value is User => {
	return (
		typeof value === 'object' && value !== null &&
		'id' in value && typeof value.id === 'number' &&
		'name' in value && typeof value.name === 'string' &&
		'roles' in value && Array.isArray(value.roles) &&
		value.roles.every(r => typeof r === 'string')
	);
};

const storage = createLocalStorage<User>({
	validator: isUser
});

// Validator runs on getItem()
const user = storage.getItem('user'); // null if validation fails
```

### Expiration Pattern

```typescript
interface StoredValue<T> {
	value: T;
	expiresAt: number;
}

function setWithExpiry<T>(
	storage: Storage<StoredValue<T>>,
	key: string,
	value: T,
	ttl: number,
	clock: Clock
): void {
	storage.setItem(key, {
		value,
		expiresAt: clock.now() + ttl
	});
}

function getWithExpiry<T>(
	storage: Storage<StoredValue<T>>,
	key: string,
	clock: Clock
): T | null {
	const item = storage.getItem(key);
	if (!item) return null;

	if (clock.now() > item.expiresAt) {
		storage.removeItem(key);
		return null;
	}

	return item.value;
}

// Usage
setWithExpiry(storage, 'session', { token: 'abc' }, 3600000, clock); // 1 hour
const session = getWithExpiry(storage, 'session', clock);
```

### SSR Pattern

```typescript
import { isBrowser, createLocalStorage, createNoopStorage } from '@composable-svelte/core/dependencies';

function createDependencies() {
	const storage = isBrowser()
		? createLocalStorage<User>({ prefix: 'app:' })
		: createNoopStorage<User>();

	return { storage };
}
```

### Error Handling Pattern

```typescript
import { StorageQuotaExceededError } from '@composable-svelte/core/dependencies';

function saveData(storage: Storage<Data>, data: Data): Effect<Action> {
	try {
		storage.setItem('data', data);
		return Effect.none();
	} catch (error) {
		if (error instanceof StorageQuotaExceededError) {
			// Handle quota exceeded
			return Effect.run(async (dispatch) => {
				const shouldClear = await confirmClearOldData();
				if (shouldClear) {
					storage.clear();
					dispatch({ type: 'retrySave', data });
				}
			});
		}
		throw error;
	}
}
```

## Security

⚠️ **IMPORTANT**: Browser storage is NOT secure storage. See [SECURITY.md](./SECURITY.md) for comprehensive security guidelines.

### Key Security Rules:

1. **NEVER** store passwords, credit cards, API keys, or SSNs
2. **ALWAYS** use `secure: true` for cookies in production
3. **ALWAYS** use `sameSite: 'Strict'` for authentication cookies
4. **ALWAYS** validate retrieved data with schema validators
5. **ALWAYS** set expiration times for sensitive data
6. **ALWAYS** clear storage on logout

### Quick Security Example:

```typescript
// ❌ BAD
const storage = createLocalStorage();
storage.setItem('password', 'secret123'); // NEVER!

// ✅ GOOD
const cookies = createCookieStorage<string>({
	secure: true,
	sameSite: 'Strict',
	maxAge: 3600
});
cookies.setItem('sessionToken', 'jwt_token');

// Clear on logout
function logout() {
	cookies.removeItem('sessionToken');
	storage.clear();
}
```

## Performance

### Storage Quotas

- **LocalStorage**: ~5-10MB per origin
- **SessionStorage**: ~5-10MB per origin
- **Cookies**: 4KB per cookie, ~50 cookies per domain

### Best Practices

1. **Use namespacing** to avoid key collisions
2. **Set expiration** for cached data
3. **Handle quota errors** gracefully
4. **Clear unused data** periodically
5. **Use compression** for large data

```typescript
// Check available quota
const quota = await getStorageQuota();
if (quota && quota.usage > quota.quota * 0.9) {
	console.warn('Storage almost full');
	storage.clear(); // Or implement LRU eviction
}
```

## Examples

See the [examples directory](../../../examples) for complete working examples:

- Basic storage usage
- Authentication with cookies
- Cross-tab synchronization
- SSR-safe patterns
- Error handling

## Troubleshooting

### Storage not available in SSR

```typescript
import { isBrowser, createNoopStorage } from '@composable-svelte/core/dependencies';

const storage = isBrowser()
	? createLocalStorage()
	: createNoopStorage(); // Safe fallback
```

### Quota exceeded errors

```typescript
try {
	storage.setItem('data', largeData);
} catch (error) {
	if (error instanceof StorageQuotaExceededError) {
		storage.clear(); // Clear old data
		storage.setItem('data', largeData); // Retry
	}
}
```

### Cookie not persisting

```typescript
// Ensure secure flag matches protocol
const cookies = createCookieStorage({
	secure: window.location.protocol === 'https:',
	sameSite: 'Lax' // 'Strict' blocks all cross-site
});
```

### Data not syncing across tabs

```typescript
// LocalStorage only - SessionStorage doesn't sync
const storage = createLocalStorage(); // ✅ Supports subscribe()
const session = createSessionStorage(); // ❌ No cross-tab sync

storage.subscribe((event) => {
	// Fires when other tabs change storage
});
```

## License

MIT
