/**
 * Tests for LocalStorage and SessionStorage dependencies
 *
 * These exercise the mocks and the noop adapter. The real adapters against
 * the browser's own storage are in local-storage.real.test.ts (the suite runs
 * in Chromium, not JSDOM — an earlier note here said otherwise).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	createNoopStorage,
	createMockStorage
} from '../../src/lib/dependencies/local-storage.js';

describe('Storage (LocalStorage & SessionStorage)', () => {
	describe('Basic Operations', () => {
		it('should set and get item', () => {
			const storage = createMockStorage<string>();

			storage.setItem('key', 'value');

			expect(storage.getItem('key')).toBe('value');
		});

		it('should return null for non-existent key', () => {
			const storage = createMockStorage<string>();

			expect(storage.getItem('nonexistent')).toBeNull();
		});

		it('should remove item', () => {
			const storage = createMockStorage<string>();

			storage.setItem('key', 'value');
			storage.removeItem('key');

			expect(storage.getItem('key')).toBeNull();
		});

		it('should overwrite existing item', () => {
			const storage = createMockStorage<string>();

			storage.setItem('key', 'first');
			storage.setItem('key', 'second');

			expect(storage.getItem('key')).toBe('second');
		});

		it('should handle multiple items', () => {
			const storage = createMockStorage<string>();

			storage.setItem('a', 'value-a');
			storage.setItem('b', 'value-b');
			storage.setItem('c', 'value-c');

			expect(storage.getItem('a')).toBe('value-a');
			expect(storage.getItem('b')).toBe('value-b');
			expect(storage.getItem('c')).toBe('value-c');
		});
	});

	describe('JSON Serialization', () => {
		it('should serialize objects', () => {
			const storage = createMockStorage<{ name: string; age: number }>();

			storage.setItem('user', { name: 'Alice', age: 30 });

			expect(storage.getItem('user')).toEqual({ name: 'Alice', age: 30 });
		});

		it('should serialize arrays', () => {
			const storage = createMockStorage<string[]>();

			storage.setItem('tags', ['admin', 'moderator']);

			expect(storage.getItem('tags')).toEqual(['admin', 'moderator']);
		});

		it('should serialize nested structures', () => {
			const storage = createMockStorage<{
				user: { profile: { name: string; preferences: string[] } };
			}>();

			const data = {
				user: {
					profile: {
						name: 'Alice',
						preferences: ['dark-mode', 'notifications']
					}
				}
			};

			storage.setItem('session', data);

			expect(storage.getItem('session')).toEqual(data);
		});

		it('should handle primitives', () => {
			const numberStorage = createMockStorage<number>();
			const booleanStorage = createMockStorage<boolean>();
			const stringStorage = createMockStorage<string>();

			numberStorage.setItem('count', 42);
			booleanStorage.setItem('enabled', true);
			stringStorage.setItem('name', 'Alice');

			expect(numberStorage.getItem('count')).toBe(42);
			expect(booleanStorage.getItem('enabled')).toBe(true);
			expect(stringStorage.getItem('name')).toBe('Alice');
		});
	});

	describe('Key Management', () => {
		it('should list all keys', () => {
			const storage = createMockStorage<string>();

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
			const storage = createMockStorage<string>();

			expect(storage.keys()).toEqual([]);
		});

		it('should update keys after removal', () => {
			const storage = createMockStorage<string>();

			storage.setItem('a', '1');
			storage.setItem('b', '2');
			storage.removeItem('a');

			expect(storage.keys()).toEqual(['b']);
		});

		it('should check if key exists', () => {
			const storage = createMockStorage<string>();

			storage.setItem('key', 'value');

			expect(storage.has('key')).toBe(true);
			expect(storage.has('nonexistent')).toBe(false);
		});

		it('should update has() after removal', () => {
			const storage = createMockStorage<string>();

			storage.setItem('key', 'value');
			expect(storage.has('key')).toBe(true);

			storage.removeItem('key');
			expect(storage.has('key')).toBe(false);
		});
	});

	describe('Clear Operation', () => {
		it('should clear all items', () => {
			const storage = createMockStorage<string>();

			storage.setItem('a', '1');
			storage.setItem('b', '2');
			storage.setItem('c', '3');

			storage.clear();

			expect(storage.keys()).toEqual([]);
			expect(storage.size()).toBe(0);
		});

		it('should allow setting items after clear', () => {
			const storage = createMockStorage<string>();

			storage.setItem('old', 'value');
			storage.clear();
			storage.setItem('new', 'value');

			expect(storage.getItem('old')).toBeNull();
			expect(storage.getItem('new')).toBe('value');
		});
	});

	describe('Size Tracking', () => {
		it('should return zero when empty', () => {
			const storage = createMockStorage<string>();

			expect(storage.size()).toBe(0);
		});

		it('should track size correctly', () => {
			const storage = createMockStorage<string>();

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
			const storage = createMockStorage<string>();

			storage.setItem('key', 'first');
			expect(storage.size()).toBe(1);

			storage.setItem('key', 'second');
			expect(storage.size()).toBe(1);
		});
	});

	describe('Prefix Namespacing', () => {
		it('should apply prefix to keys', () => {
			const storage = createMockStorage<string>({ prefix: 'app:' });

			storage.setItem('key', 'value');

			expect(storage.has('key')).toBe(true);
			expect(storage.getItem('key')).toBe('value');
		});

		it('should isolate prefixed storage', () => {
			const authStorage = createMockStorage<string>({ prefix: 'auth:' });
			const prefStorage = createMockStorage<string>({ prefix: 'pref:' });

			authStorage.setItem('token', 'auth-token');
			prefStorage.setItem('token', 'pref-token');

			expect(authStorage.getItem('token')).toBe('auth-token');
			expect(prefStorage.getItem('token')).toBe('pref-token');
		});

		it('should only list keys with prefix', () => {
			const storage = createMockStorage<string>({ prefix: 'app:' });

			storage.setItem('a', '1');
			storage.setItem('b', '2');

			const keys = storage.keys();

			expect(keys).toEqual(['a', 'b']); // User sees unprefixed keys
		});

		it('should only clear keys with prefix', () => {
			const appStorage = createMockStorage<string>({ prefix: 'app:' });
			const authStorage = createMockStorage<string>({ prefix: 'auth:' });

			appStorage.setItem('data', 'value');
			authStorage.setItem('token', 'abc');

			appStorage.clear();

			expect(appStorage.size()).toBe(0);
			expect(authStorage.getItem('token')).toBe('abc');
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty string values', () => {
			const storage = createMockStorage<string>();

			storage.setItem('empty', '');

			expect(storage.getItem('empty')).toBe('');
			expect(storage.has('empty')).toBe(true);
		});

		it('should handle zero values', () => {
			const storage = createMockStorage<number>();

			storage.setItem('zero', 0);

			expect(storage.getItem('zero')).toBe(0);
		});

		it('should handle false values', () => {
			const storage = createMockStorage<boolean>();

			storage.setItem('flag', false);

			expect(storage.getItem('flag')).toBe(false);
		});

		it('should handle null-like values', () => {
			const storage = createMockStorage<null>();

			storage.setItem('nullable', null);

			expect(storage.getItem('nullable')).toBeNull();
		});

		it('should handle special characters in keys', () => {
			const storage = createMockStorage<string>();

			storage.setItem('user-token', 'abc');
			storage.setItem('app_session', '123');
			storage.setItem('data.cache', 'xyz');

			expect(storage.getItem('user-token')).toBe('abc');
			expect(storage.getItem('app_session')).toBe('123');
			expect(storage.getItem('data.cache')).toBe('xyz');
		});

		it('should handle removing non-existent key', () => {
			const storage = createMockStorage<string>();

			expect(() => {
				storage.removeItem('nonexistent');
			}).not.toThrow();
		});

		it('should handle clearing empty storage', () => {
			const storage = createMockStorage<string>();

			expect(() => {
				storage.clear();
			}).not.toThrow();

			expect(storage.size()).toBe(0);
		});

		it('should handle multiple clear operations', () => {
			const storage = createMockStorage<string>();

			storage.setItem('a', '1');
			storage.clear();
			storage.clear();

			expect(storage.size()).toBe(0);
		});
	});

	describe('Complex Data Structures', () => {
		it('should handle deep nesting', () => {
			const storage = createMockStorage<{
				level1: { level2: { level3: { value: string } } };
			}>();

			const data = {
				level1: {
					level2: {
						level3: {
							value: 'deep'
						}
					}
				}
			};

			storage.setItem('nested', data);

			expect(storage.getItem('nested')).toEqual(data);
		});

		it('should handle arrays of objects', () => {
			const storage = createMockStorage<Array<{ id: number; name: string }>>();

			const users = [
				{ id: 1, name: 'Alice' },
				{ id: 2, name: 'Bob' },
				{ id: 3, name: 'Charlie' }
			];

			storage.setItem('users', users);

			expect(storage.getItem('users')).toEqual(users);
		});

		it('should handle mixed types in arrays', () => {
			const storage = createMockStorage<Array<string | number | boolean>>();

			const mixed = ['text', 42, true, 'more text', 0, false];

			storage.setItem('mixed', mixed);

			expect(storage.getItem('mixed')).toEqual(mixed);
		});

		it('should handle Map-like structures as objects', () => {
			const storage = createMockStorage<Record<string, number>>();

			const scores = {
				alice: 100,
				bob: 85,
				charlie: 92
			};

			storage.setItem('scores', scores);

			expect(storage.getItem('scores')).toEqual(scores);
		});
	});

	describe('NoopStorage', () => {
		it('should return null for all gets', () => {
			const storage = createNoopStorage<string>();

			expect(storage.getItem('key')).toBeNull();
		});

		it('should accept all sets without error', () => {
			const storage = createNoopStorage<string>();

			expect(() => {
				storage.setItem('key', 'value');
			}).not.toThrow();
		});

		it('should accept all removes without error', () => {
			const storage = createNoopStorage<string>();

			expect(() => {
				storage.removeItem('key');
			}).not.toThrow();
		});

		it('should return empty keys', () => {
			const storage = createNoopStorage<string>();

			expect(storage.keys()).toEqual([]);
		});

		it('should return false for has()', () => {
			const storage = createNoopStorage<string>();

			expect(storage.has('any-key')).toBe(false);
		});

		it('should return zero size', () => {
			const storage = createNoopStorage<string>();

			expect(storage.size()).toBe(0);
		});

		it('should accept clear without error', () => {
			const storage = createNoopStorage<string>();

			expect(() => {
				storage.clear();
			}).not.toThrow();
		});

		it('should remain no-op after operations', () => {
			const storage = createNoopStorage<string>();

			storage.setItem('a', '1');
			storage.setItem('b', '2');
			storage.removeItem('a');
			storage.clear();

			expect(storage.size()).toBe(0);
			expect(storage.keys()).toEqual([]);
			expect(storage.getItem('a')).toBeNull();
			expect(storage.getItem('b')).toBeNull();
		});
	});

	describe('Type Safety', () => {
		it('should maintain type safety with primitives', () => {
			const numberStorage = createMockStorage<number>();
			const stringStorage = createMockStorage<string>();
			const booleanStorage = createMockStorage<boolean>();

			numberStorage.setItem('count', 42);
			stringStorage.setItem('name', 'Alice');
			booleanStorage.setItem('active', true);

			expect(numberStorage.getItem('count')).toBe(42);
			expect(stringStorage.getItem('name')).toBe('Alice');
			expect(booleanStorage.getItem('active')).toBe(true);
		});

		it('should maintain type safety with complex types', () => {
			interface User {
				id: number;
				name: string;
				roles: string[];
			}

			const storage = createMockStorage<User>();

			const user: User = {
				id: 123,
				name: 'Alice',
				roles: ['admin', 'moderator']
			};

			storage.setItem('user', user);

			const retrieved = storage.getItem('user');
			expect(retrieved).toEqual(user);
		});

		it('should handle union types', () => {
			const storage = createMockStorage<string | number>();

			storage.setItem('text', 'hello');
			storage.setItem('number', 42);

			expect(storage.getItem('text')).toBe('hello');
			expect(storage.getItem('number')).toBe(42);
		});
	});

	describe('Performance Characteristics', () => {
		it('should handle many items efficiently', () => {
			const storage = createMockStorage<number>();

			// Set 1000 items
			for (let i = 0; i < 1000; i++) {
				storage.setItem(`key-${i}`, i);
			}

			expect(storage.size()).toBe(1000);
			expect(storage.getItem('key-500')).toBe(500);
		});

		it('should handle large values', () => {
			const storage = createMockStorage<string>();

			// Large string (1MB)
			const largeValue = 'x'.repeat(1024 * 1024);

			storage.setItem('large', largeValue);

			expect(storage.getItem('large')).toBe(largeValue);
		});

		it('should handle rapid updates', () => {
			const storage = createMockStorage<number>();

			for (let i = 0; i < 100; i++) {
				storage.setItem('counter', i);
			}

			expect(storage.getItem('counter')).toBe(99);
		});
	});
});
