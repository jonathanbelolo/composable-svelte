/**
 * Tests for Cookie Storage dependency
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockCookieStorage } from '../../src/dependencies/cookie-storage.js';
import { CookieSizeExceededError } from '../../src/dependencies/errors.js';

describe('CookieStorage', () => {
	describe('Basic Operations', () => {
		it('should set and get item', () => {
			const storage = createMockCookieStorage<string>();

			storage.setItem('token', 'abc123');

			expect(storage.getItem('token')).toBe('abc123');
		});

		it('should return null for non-existent key', () => {
			const storage = createMockCookieStorage<string>();

			expect(storage.getItem('nonexistent')).toBeNull();
		});

		it('should remove item', () => {
			const storage = createMockCookieStorage<string>();

			storage.setItem('token', 'abc123');
			storage.removeItem('token');

			expect(storage.getItem('token')).toBeNull();
		});

		it('should overwrite existing item', () => {
			const storage = createMockCookieStorage<string>();

			storage.setItem('token', 'first');
			storage.setItem('token', 'second');

			expect(storage.getItem('token')).toBe('second');
		});

		it('should handle multiple items', () => {
			const storage = createMockCookieStorage<string>();

			storage.setItem('token', 'abc');
			storage.setItem('user', 'alice');
			storage.setItem('role', 'admin');

			expect(storage.getItem('token')).toBe('abc');
			expect(storage.getItem('user')).toBe('alice');
			expect(storage.getItem('role')).toBe('admin');
		});
	});

	describe('JSON Serialization', () => {
		it('should serialize objects', () => {
			const storage = createMockCookieStorage<{ name: string; id: number }>();

			storage.setItem('user', { name: 'Alice', id: 123 });

			expect(storage.getItem('user')).toEqual({ name: 'Alice', id: 123 });
		});

		it('should serialize arrays', () => {
			const storage = createMockCookieStorage<number[]>();

			storage.setItem('scores', [10, 20, 30]);

			expect(storage.getItem('scores')).toEqual([10, 20, 30]);
		});

		it('should serialize nested structures', () => {
			const storage = createMockCookieStorage<{
				user: { name: string; tags: string[] };
			}>();

			const data = {
				user: { name: 'Alice', tags: ['admin', 'moderator'] }
			};

			storage.setItem('session', data);

			expect(storage.getItem('session')).toEqual(data);
		});

		it('should handle special characters in values', () => {
			const storage = createMockCookieStorage<string>();

			storage.setItem('message', 'Hello "World" & <Friends>!');

			expect(storage.getItem('message')).toBe('Hello "World" & <Friends>!');
		});
	});

	describe('Key Management', () => {
		it('should list all keys', () => {
			const storage = createMockCookieStorage<string>();

			storage.setItem('a', '1');
			storage.setItem('b', '2');
			storage.setItem('c', '3');

			const keys = storage.keys();

			expect(keys).toHaveLength(3);
			expect(keys).toContain('a');
			expect(keys).toContain('b');
			expect(keys).toContain('c');
		});

		it('should return empty array when no items', () => {
			const storage = createMockCookieStorage<string>();

			expect(storage.keys()).toEqual([]);
		});

		it('should update keys after removal', () => {
			const storage = createMockCookieStorage<string>();

			storage.setItem('a', '1');
			storage.setItem('b', '2');
			storage.removeItem('a');

			const keys = storage.keys();

			expect(keys).toEqual(['b']);
		});

		it('should check if key exists', () => {
			const storage = createMockCookieStorage<string>();

			storage.setItem('token', 'abc');

			expect(storage.has('token')).toBe(true);
			expect(storage.has('nonexistent')).toBe(false);
		});

		it('should update has() after removal', () => {
			const storage = createMockCookieStorage<string>();

			storage.setItem('token', 'abc');
			expect(storage.has('token')).toBe(true);

			storage.removeItem('token');
			expect(storage.has('token')).toBe(false);
		});
	});

	describe('Clear Operation', () => {
		it('should clear all items', () => {
			const storage = createMockCookieStorage<string>();

			storage.setItem('a', '1');
			storage.setItem('b', '2');
			storage.setItem('c', '3');

			storage.clear();

			expect(storage.keys()).toEqual([]);
			expect(storage.size()).toBe(0);
		});

		it('should allow setting items after clear', () => {
			const storage = createMockCookieStorage<string>();

			storage.setItem('old', 'value');
			storage.clear();
			storage.setItem('new', 'value');

			expect(storage.getItem('old')).toBeNull();
			expect(storage.getItem('new')).toBe('value');
		});
	});

	describe('Size Tracking', () => {
		it('should return zero when empty', () => {
			const storage = createMockCookieStorage<string>();

			expect(storage.size()).toBe(0);
		});

		it('should track size correctly', () => {
			const storage = createMockCookieStorage<string>();

			storage.setItem('a', '1');
			expect(storage.size()).toBe(1);

			storage.setItem('b', '2');
			expect(storage.size()).toBe(2);

			storage.removeItem('a');
			expect(storage.size()).toBe(1);

			storage.clear();
			expect(storage.size()).toBe(0);
		});

		it('should not count duplicates', () => {
			const storage = createMockCookieStorage<string>();

			storage.setItem('token', 'first');
			expect(storage.size()).toBe(1);

			storage.setItem('token', 'second');
			expect(storage.size()).toBe(1);
		});
	});

	describe('Prefix Namespacing', () => {
		it('should apply prefix to keys', () => {
			const storage = createMockCookieStorage<string>({ prefix: 'app:' });

			storage.setItem('token', 'abc');

			expect(storage.has('token')).toBe(true);
			expect(storage.getItem('token')).toBe('abc');
		});

		it('should isolate prefixed storage', () => {
			const authStorage = createMockCookieStorage<string>({ prefix: 'auth:' });
			const prefStorage = createMockCookieStorage<string>({ prefix: 'pref:' });

			authStorage.setItem('token', 'auth-token');
			prefStorage.setItem('token', 'pref-token');

			expect(authStorage.getItem('token')).toBe('auth-token');
			expect(prefStorage.getItem('token')).toBe('pref-token');
		});

		it('should only list keys with prefix', () => {
			const storage = createMockCookieStorage<string>({ prefix: 'app:' });

			storage.setItem('a', '1');
			storage.setItem('b', '2');

			const keys = storage.keys();

			expect(keys).toEqual(['a', 'b']); // User sees unprefixed keys
		});

		it('should only clear keys with prefix', () => {
			const appStorage = createMockCookieStorage<string>({ prefix: 'app:' });
			const authStorage = createMockCookieStorage<string>({ prefix: 'auth:' });

			appStorage.setItem('data', 'value');
			authStorage.setItem('token', 'abc');

			appStorage.clear();

			expect(appStorage.size()).toBe(0);
			expect(authStorage.getItem('token')).toBe('abc');
		});
	});

	describe('Cookie Options', () => {
		it('should accept path option', () => {
			const storage = createMockCookieStorage<string>();

			expect(() => {
				storage.setItem('token', 'abc', { path: '/app' });
			}).not.toThrow();

			expect(storage.getItem('token')).toBe('abc');
		});

		it('should accept domain option', () => {
			const storage = createMockCookieStorage<string>();

			expect(() => {
				storage.setItem('token', 'abc', { domain: '.example.com' });
			}).not.toThrow();

			expect(storage.getItem('token')).toBe('abc');
		});

		it('should accept secure flag', () => {
			const storage = createMockCookieStorage<string>();

			expect(() => {
				storage.setItem('token', 'abc', { secure: true });
			}).not.toThrow();

			expect(storage.getItem('token')).toBe('abc');
		});

		it('should accept sameSite option', () => {
			const storage = createMockCookieStorage<string>();

			expect(() => {
				storage.setItem('token', 'abc', { sameSite: 'Strict' });
			}).not.toThrow();

			expect(storage.getItem('token')).toBe('abc');
		});

		it('should accept maxAge option', () => {
			const storage = createMockCookieStorage<string>();

			expect(() => {
				storage.setItem('token', 'abc', { maxAge: 3600 });
			}).not.toThrow();

			expect(storage.getItem('token')).toBe('abc');
		});

		it('should accept expires option', () => {
			const storage = createMockCookieStorage<string>();
			const expires = new Date(Date.now() + 3600000);

			expect(() => {
				storage.setItem('token', 'abc', { expires });
			}).not.toThrow();

			expect(storage.getItem('token')).toBe('abc');
		});

		it('should combine multiple options', () => {
			const storage = createMockCookieStorage<string>();

			expect(() => {
				storage.setItem('token', 'abc', {
					path: '/app',
					secure: true,
					sameSite: 'Strict',
					maxAge: 3600
				});
			}).not.toThrow();

			expect(storage.getItem('token')).toBe('abc');
		});
	});

	describe('Size Validation', () => {
		it('should throw when cookie exceeds 4KB', () => {
			const storage = createMockCookieStorage<string>();

			// Create string larger than 4KB
			const largeValue = 'x'.repeat(5000);

			expect(() => {
				storage.setItem('large', largeValue);
			}).toThrow(CookieSizeExceededError);
		});

		it('should not throw for cookie under 4KB', () => {
			const storage = createMockCookieStorage<string>();

			// Create string under 4KB
			const value = 'x'.repeat(3000);

			expect(() => {
				storage.setItem('data', value);
			}).not.toThrow();

			expect(storage.getItem('data')).toBe(value);
		});

		it('should validate size on overwrite', () => {
			const storage = createMockCookieStorage<string>();

			storage.setItem('data', 'small');

			const largeValue = 'x'.repeat(5000);

			expect(() => {
				storage.setItem('data', largeValue);
			}).toThrow(CookieSizeExceededError);

			// Original value should remain
			expect(storage.getItem('data')).toBe('small');
		});
	});

	describe('Schema Validation', () => {
		it('should validate values with validator', () => {
			interface User {
				name: string;
				id: number;
			}

			const validator = (value: unknown): value is User => {
				return (
					typeof value === 'object' &&
					value !== null &&
					'name' in value &&
					'id' in value &&
					typeof value.name === 'string' &&
					typeof value.id === 'number'
				);
			};

			const storage = createMockCookieStorage<User>({ validator });

			storage.setItem('user', { name: 'Alice', id: 123 });

			expect(storage.getItem('user')).toEqual({ name: 'Alice', id: 123 });
		});

		it('should return null for invalid schema', () => {
			interface User {
				name: string;
				id: number;
			}

			const validator = (value: unknown): value is User => {
				return (
					typeof value === 'object' &&
					value !== null &&
					'name' in value &&
					'id' in value &&
					typeof value.name === 'string' &&
					typeof value.id === 'number'
				);
			};

			const storage = createMockCookieStorage<User>({ validator });

			// Set invalid data (bypassing type system for test)
			storage.setItem('user', { name: 'Alice' } as User);

			// Validator should fail on get
			expect(storage.getItem('user')).toBeNull();
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty string values', () => {
			const storage = createMockCookieStorage<string>();

			storage.setItem('empty', '');

			expect(storage.getItem('empty')).toBe('');
			expect(storage.has('empty')).toBe(true);
		});

		it('should handle null-like values', () => {
			const storage = createMockCookieStorage<null>();

			storage.setItem('nullable', null);

			expect(storage.getItem('nullable')).toBeNull();
		});

		it('should handle special characters in keys', () => {
			const storage = createMockCookieStorage<string>();

			storage.setItem('user-token', 'abc');
			storage.setItem('app_session', '123');
			storage.setItem('data.cache', 'xyz');

			expect(storage.getItem('user-token')).toBe('abc');
			expect(storage.getItem('app_session')).toBe('123');
			expect(storage.getItem('data.cache')).toBe('xyz');
		});

		it('should handle removing non-existent key', () => {
			const storage = createMockCookieStorage<string>();

			expect(() => {
				storage.removeItem('nonexistent');
			}).not.toThrow();
		});

		it('should handle clearing empty storage', () => {
			const storage = createMockCookieStorage<string>();

			expect(() => {
				storage.clear();
			}).not.toThrow();

			expect(storage.size()).toBe(0);
		});

		it('should handle multiple clear operations', () => {
			const storage = createMockCookieStorage<string>();

			storage.setItem('a', '1');
			storage.clear();
			storage.clear();

			expect(storage.size()).toBe(0);
		});
	});

	describe('Type Safety', () => {
		it('should maintain type safety with primitives', () => {
			const numberStorage = createMockCookieStorage<number>();
			const stringStorage = createMockCookieStorage<string>();
			const booleanStorage = createMockCookieStorage<boolean>();

			numberStorage.setItem('count', 42);
			stringStorage.setItem('name', 'Alice');
			booleanStorage.setItem('active', true);

			expect(numberStorage.getItem('count')).toBe(42);
			expect(stringStorage.getItem('name')).toBe('Alice');
			expect(booleanStorage.getItem('active')).toBe(true);
		});

		it('should maintain type safety with complex types', () => {
			interface Session {
				user: string;
				token: string;
				expires: number;
			}

			const storage = createMockCookieStorage<Session>();

			const session: Session = {
				user: 'alice',
				token: 'abc123',
				expires: Date.now() + 3600000
			};

			storage.setItem('session', session);

			const retrieved = storage.getItem('session');
			expect(retrieved).toEqual(session);
		});
	});
});
