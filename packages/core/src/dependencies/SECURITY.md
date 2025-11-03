# Security and Best Practices for Storage Dependencies

This document outlines security considerations and best practices when using the storage dependencies (localStorage, sessionStorage, cookies) in Composable Svelte.

## Table of Contents

1. [Security Overview](#security-overview)
2. [What NOT to Store](#what-not-to-store)
3. [Storage-Specific Security](#storage-specific-security)
4. [Best Practices](#best-practices)
5. [Error Handling](#error-handling)
6. [Cross-Tab Synchronization](#cross-tab-synchronization)

---

## Security Overview

### Key Security Principle

**Browser storage is NOT secure storage.** All client-side storage mechanisms (localStorage, sessionStorage, cookies) are vulnerable to XSS (Cross-Site Scripting) attacks. Any JavaScript code running on your page can access this data.

### Attack Vectors

1. **XSS (Cross-Site Scripting)**: Malicious scripts injected into your page can read all storage
2. **MITM (Man-in-the-Middle)**: Unencrypted cookies can be intercepted over HTTP
3. **Browser Extensions**: Extensions have access to page storage
4. **Shared Computers**: Physical access to the browser exposes stored data

---

## What NOT to Store

### ❌ NEVER Store These in Browser Storage:

```typescript
// ❌ BAD: Storing sensitive credentials
const storage = createLocalStorage<{ password: string }>();
storage.setItem('auth', { password: 'secret123' }); // NEVER DO THIS

// ❌ BAD: Storing financial information
const storage = createLocalStorage<{ cardNumber: string; cvv: string }>();
storage.setItem('payment', { cardNumber: '1234-5678-9012-3456', cvv: '123' });

// ❌ BAD: Storing PII without encryption
const storage = createLocalStorage<{ ssn: string; dob: string }>();
storage.setItem('user', { ssn: '123-45-6789', dob: '1990-01-01' });

// ❌ BAD: Storing API keys or secrets
const storage = createLocalStorage<{ apiKey: string }>();
storage.setItem('config', { apiKey: 'sk_live_...' });
```

### ✅ Safe to Store:

```typescript
// ✅ GOOD: User preferences
const storage = createLocalStorage<{ theme: 'light' | 'dark'; language: string }>();
storage.setItem('preferences', { theme: 'dark', language: 'en' });

// ✅ GOOD: Non-sensitive session data
const storage = createLocalStorage<{ lastVisited: string; pageSize: number }>();
storage.setItem('session', { lastVisited: '/dashboard', pageSize: 20 });

// ✅ GOOD: Short-lived authentication tokens (with proper security)
const cookies = createCookieStorage<string>({
	secure: true,        // HTTPS only
	sameSite: 'Strict',  // CSRF protection
	maxAge: 3600         // 1 hour expiry
});
cookies.setItem('sessionToken', 'jwt_token_here');
```

---

## Storage-Specific Security

### LocalStorage Security

**Characteristics:**
- Persists indefinitely until explicitly cleared
- Accessible to all scripts on the same origin
- Not sent with HTTP requests
- Vulnerable to XSS

**Security Measures:**

```typescript
// Use namespacing to isolate data
const authStorage = createLocalStorage<TokenData>({
	prefix: 'auth:',  // Prevents key collisions
	validator: isValidToken  // Runtime validation
});

// Set expiration manually
interface StoredData<T> {
	value: T;
	expiresAt: number;
}

function setWithExpiry<T>(storage: Storage<StoredData<T>>, key: string, value: T, ttl: number) {
	storage.setItem(key, {
		value,
		expiresAt: Date.now() + ttl
	});
}

function getWithExpiry<T>(storage: Storage<StoredData<T>>, key: string): T | null {
	const item = storage.getItem(key);
	if (!item) return null;

	if (Date.now() > item.expiresAt) {
		storage.removeItem(key);
		return null;
	}

	return item.value;
}
```

### SessionStorage Security

**Characteristics:**
- Cleared when tab/window closes
- Not shared between tabs
- Slightly safer than localStorage (shorter lifetime)

**Security Measures:**

```typescript
// Use for sensitive temporary data
const sessionStorage = createSessionStorage<FormDraft>({
	prefix: 'form:',
	validator: isValidFormDraft
});

// Clear on navigation
window.addEventListener('beforeunload', () => {
	sessionStorage.clear();
});
```

### Cookie Security

**Characteristics:**
- Sent with every HTTP request to the domain
- Can be configured with security flags
- Subject to CSRF attacks if not properly configured

**Critical Security Flags:**

```typescript
const cookies = createCookieStorage<string>({
	// 1. HTTPS Only
	secure: true,  // ⚠️ REQUIRED in production

	// 2. CSRF Protection
	sameSite: 'Strict',  // or 'Lax' for cross-site navigation

	// 3. Path Restriction
	path: '/app',  // Limit cookie scope

	// 4. Domain Restriction
	domain: '.example.com',  // Be specific

	// 5. Expiration
	maxAge: 3600  // Auto-expire after 1 hour
});

// Set authentication cookie
cookies.setItem('session', 'jwt_token', {
	secure: true,
	sameSite: 'Strict',
	maxAge: 3600
});
```

**Cookie Security Rules:**

1. **Always use `secure: true` in production** (requires HTTPS)
2. **Use `sameSite: 'Strict'`** for authentication cookies
3. **Use `sameSite: 'Lax'`** for tracking cookies that need cross-site navigation
4. **NEVER use `sameSite: 'None'`** without `secure: true` (library enforces this)
5. **Set shortest possible `maxAge`**
6. **Use specific `path` to limit exposure**

**SameSite Comparison:**

| Value    | Protection | Use Case                           |
|----------|------------|------------------------------------|
| `Strict` | Highest    | Authentication tokens, sessions    |
| `Lax`    | Medium     | Tracking, analytics (allows GET)   |
| `None`   | Lowest     | Third-party embeds (requires HTTPS)|

---

## Best Practices

### 1. Use Namespacing

```typescript
// Isolate different concerns
const authStorage = createLocalStorage<AuthData>({ prefix: 'auth:' });
const prefStorage = createLocalStorage<Preferences>({ prefix: 'pref:' });
const cacheStorage = createLocalStorage<CacheData>({ prefix: 'cache:' });
```

### 2. Implement Schema Validation

```typescript
interface User {
	id: number;
	name: string;
	roles: string[];
}

const isUser = (value: unknown): value is User => {
	return (
		typeof value === 'object' &&
		value !== null &&
		'id' in value && typeof value.id === 'number' &&
		'name' in value && typeof value.name === 'string' &&
		'roles' in value && Array.isArray(value.roles)
	);
};

const storage = createLocalStorage<User>({
	validator: isUser  // Protects against corrupted data
});
```

### 3. Handle Quota Errors

```typescript
import { StorageQuotaExceededError } from '@composable-svelte/core/dependencies';

try {
	storage.setItem('largeData', hugeObject);
} catch (error) {
	if (error instanceof StorageQuotaExceededError) {
		// Clear old data or notify user
		console.error(`Storage full: ${error.attemptedSize} bytes`);
		storage.clear();  // Or implement LRU eviction
	}
}
```

### 4. Use Expiration Patterns

```typescript
// Utility wrapper for automatic expiration
class ExpiringStorage<T> {
	constructor(private storage: Storage<{ value: T; exp: number }>) {}

	set(key: string, value: T, ttlMs: number): void {
		this.storage.setItem(key, {
			value,
			exp: Date.now() + ttlMs
		});
	}

	get(key: string): T | null {
		const item = this.storage.getItem(key);
		if (!item) return null;

		if (Date.now() > item.exp) {
			this.storage.removeItem(key);
			return null;
		}

		return item.value;
	}
}
```

### 5. Clear Storage on Logout

```typescript
function logout(deps: Dependencies) {
	// Clear all authentication data
	deps.authStorage.clear();
	deps.sessionStorage.clear();
	deps.cookies.removeItem('sessionToken');

	// Optionally clear all storage
	localStorage.clear();
	sessionStorage.clear();
}
```

### 6. Validate Retrieved Data

```typescript
// Always validate data from storage
const user = storage.getItem('user');

if (user && isValidUser(user)) {
	// Safe to use
	console.log(user.name);
} else {
	// Handle invalid/corrupted data
	storage.removeItem('user');
	redirectToLogin();
}
```

### 7. Use Debug Mode During Development

```typescript
const storage = createLocalStorage<User>({
	prefix: 'app:',
	debug: true  // Logs all operations to console
});

// Console output:
// [LocalStorage app:] Set key "user": { name: "Alice", id: 123 }
// [LocalStorage app:] Get key "user": { name: "Alice", id: 123 }
```

---

## Error Handling

### Handle All Error Types

```typescript
import {
	StorageQuotaExceededError,
	InvalidJSONError,
	SchemaValidationError,
	CookieSizeExceededError,
	EnvironmentNotSupportedError
} from '@composable-svelte/core/dependencies';

try {
	storage.setItem('key', value);
} catch (error) {
	if (error instanceof StorageQuotaExceededError) {
		// Handle quota exceeded
		notifyUser('Storage full. Please clear some data.');
	} else if (error instanceof CookieSizeExceededError) {
		// Handle cookie size limit
		console.error(`Cookie too large: ${error.size} bytes`);
	} else if (error instanceof EnvironmentNotSupportedError) {
		// Handle SSR or disabled storage
		useFallbackStorage();
	}
}
```

### SSR Safety

```typescript
import { isBrowser, createNoopStorage } from '@composable-svelte/core/dependencies';

// Safe for SSR
const storage = isBrowser()
	? createLocalStorage<User>()
	: createNoopStorage<User>();
```

---

## Cross-Tab Synchronization

### Subscribe to Storage Changes

```typescript
const storage = createLocalStorage<User>();

// Listen for changes from other tabs
const unsubscribe = storage.subscribe((event) => {
	console.log(`Key "${event.key}" changed in another tab`);
	console.log('Old value:', event.oldValue);
	console.log('New value:', event.newValue);
	console.log('Changed by:', event.url);

	// React to changes
	if (event.key === 'user' && event.newValue === null) {
		// User logged out in another tab
		handleLogout();
	}
});

// Clean up
onDestroy(() => {
	unsubscribe();
});
```

### Synchronization Patterns

```typescript
// Pattern 1: Logout synchronization
storage.subscribe((event) => {
	if (event.key === 'sessionToken' && event.newValue === null) {
		// Another tab logged out
		window.location.href = '/login';
	}
});

// Pattern 2: Preference synchronization
storage.subscribe((event) => {
	if (event.key === 'theme') {
		// Another tab changed theme
		applyTheme(event.newValue);
	}
});

// Pattern 3: Cache invalidation
storage.subscribe((event) => {
	if (event.key?.startsWith('cache:')) {
		// Cache updated in another tab
		refreshUI();
	}
});
```

---

## Encryption (Optional)

For sensitive data that **must** be stored client-side, use encryption:

```typescript
import { webcrypto } from 'crypto'; // Node.js, or use Web Crypto API

async function encrypt(data: string, key: CryptoKey): Promise<string> {
	const encoder = new TextEncoder();
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		key,
		encoder.encode(data)
	);

	// Combine IV + encrypted data
	const combined = new Uint8Array(iv.length + encrypted.byteLength);
	combined.set(iv);
	combined.set(new Uint8Array(encrypted), iv.length);

	return btoa(String.fromCharCode(...combined));
}

async function decrypt(encrypted: string, key: CryptoKey): Promise<string> {
	const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
	const iv = combined.slice(0, 12);
	const data = combined.slice(12);

	const decrypted = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv },
		key,
		data
	);

	return new TextDecoder().decode(decrypted);
}

// Usage with storage
class EncryptedStorage<T> {
	constructor(
		private storage: Storage<string>,
		private key: CryptoKey
	) {}

	async set(key: string, value: T): Promise<void> {
		const json = JSON.stringify(value);
		const encrypted = await encrypt(json, this.key);
		this.storage.setItem(key, encrypted);
	}

	async get(key: string): Promise<T | null> {
		const encrypted = this.storage.getItem(key);
		if (!encrypted) return null;

		try {
			const json = await decrypt(encrypted, this.key);
			return JSON.parse(json) as T;
		} catch {
			return null;
		}
	}
}
```

**Note:** Client-side encryption only protects against passive attacks. XSS can still steal the encryption key from memory.

---

## Summary Checklist

### Before Storing Data:

- [ ] Is this data sensitive? (If yes, reconsider storing it)
- [ ] Do I need localStorage (persistent) or sessionStorage (tab-only)?
- [ ] Should I use cookies (need to send with HTTP requests)?
- [ ] Have I set proper security flags? (secure, sameSite)
- [ ] Have I set an expiration time?
- [ ] Have I implemented schema validation?
- [ ] Have I added proper error handling?
- [ ] Am I using namespacing to prevent collisions?
- [ ] Is my code SSR-safe?

### For Production:

- [ ] All cookies use `secure: true`
- [ ] Authentication cookies use `sameSite: 'Strict'`
- [ ] All storage is cleared on logout
- [ ] Schema validation is enabled
- [ ] Error handling covers all error types
- [ ] Debug mode is disabled (`debug: false`)
- [ ] Cross-tab synchronization is implemented (if needed)

---

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [MDN: Web Storage API Security](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API#security_concerns)
- [MDN: Using HTTP Cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies)
- [SameSite Cookie Specification](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-09#section-5.4.7)
