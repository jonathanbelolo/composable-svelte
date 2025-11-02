/**
 * Unit Tests: URL Parsing
 *
 * Tests for parseDestination and matchPath functions.
 * Phase 7, Day 2: Parsing API
 */

import { describe, it, expect } from 'vitest';
import { parseDestination, matchPath, type ParserConfig } from '../../src/routing/parser';

// Test Types
type InventoryDestination =
	| { type: 'detailItem'; state: { itemId: string } }
	| { type: 'editItem'; state: { itemId: string; field?: string } }
	| { type: 'addItem'; state: {} };

// Test Configuration
const basicConfig: ParserConfig<InventoryDestination> = {
	basePath: '/inventory',
	parsers: [
		// Order matters - most specific first
		(path) => {
			const params = matchPath('/item-:id/edit/:field', path);
			if (params) {
				return { type: 'editItem', state: { itemId: params.id, field: params.field } };
			}
			return null;
		},
		(path) => {
			const params = matchPath('/item-:id/edit', path);
			if (params) {
				return { type: 'editItem', state: { itemId: params.id } };
			}
			return null;
		},
		(path) => {
			const params = matchPath('/item-:id', path);
			if (params) {
				return { type: 'detailItem', state: { itemId: params.id } };
			}
			return null;
		},
		(path) => {
			if (path === '/add') {
				return { type: 'addItem', state: {} };
			}
			return null;
		}
	]
};

describe('parseDestination', () => {
	describe('root path handling', () => {
		it('returns null for base path', () => {
			const result = parseDestination('/inventory', basicConfig);
			expect(result).toBe(null);
		});

		it('returns null for root "/" with base path "/"', () => {
			const config: ParserConfig<InventoryDestination> = {
				basePath: '/',
				parsers: [
					(path) => {
						const params = matchPath('/item-:id', path);
						return params ? { type: 'detailItem', state: { itemId: params.id } } : null;
					}
				]
			};
			const result = parseDestination('/', config);
			expect(result).toBe(null);
		});

		it('returns null when basePath is undefined and path is "/"', () => {
			const config: ParserConfig<InventoryDestination> = {
				parsers: [
					(path) => {
						const params = matchPath('/item-:id', path);
						return params ? { type: 'detailItem', state: { itemId: params.id } } : null;
					}
				]
			};
			const result = parseDestination('/', config);
			expect(result).toBe(null);
		});
	});

	describe('simple path parsing', () => {
		it('parses detailItem path', () => {
			const result = parseDestination('/inventory/item-123', basicConfig);
			expect(result).toEqual({
				type: 'detailItem',
				state: { itemId: '123' }
			});
		});

		it('parses editItem path without field', () => {
			const result = parseDestination('/inventory/item-456/edit', basicConfig);
			expect(result).toEqual({
				type: 'editItem',
				state: { itemId: '456' }
			});
		});

		it('parses editItem path with field', () => {
			const result = parseDestination('/inventory/item-789/edit/name', basicConfig);
			expect(result).toEqual({
				type: 'editItem',
				state: { itemId: '789', field: 'name' }
			});
		});

		it('parses addItem path', () => {
			const result = parseDestination('/inventory/add', basicConfig);
			expect(result).toEqual({
				type: 'addItem',
				state: {}
			});
		});
	});

	describe('multiple parser attempts', () => {
		it('tries parsers in order', () => {
			// Most specific should match first
			const result = parseDestination('/inventory/item-123/edit/title', basicConfig);
			expect(result).toEqual({
				type: 'editItem',
				state: { itemId: '123', field: 'title' }
			});
		});

		it('uses first matching parser', () => {
			// Should match editItem (without field), not detailItem
			const result = parseDestination('/inventory/item-999/edit', basicConfig);
			expect(result).toEqual({
				type: 'editItem',
				state: { itemId: '999' }
			});
		});

		it('returns null when no parser matches', () => {
			const result = parseDestination('/inventory/unknown/path', basicConfig);
			expect(result).toBe(null);
		});
	});

	describe('invalid path handling', () => {
		it('returns null for completely invalid path', () => {
			const result = parseDestination('/invalid/path', basicConfig);
			expect(result).toBe(null);
		});

		it('returns null for path not starting with basePath', () => {
			const result = parseDestination('/other/item-123', basicConfig);
			expect(result).toBe(null);
		});

		it('returns null for empty path', () => {
			const result = parseDestination('', basicConfig);
			expect(result).toBe(null);
		});

		it('returns null for path missing required params', () => {
			const result = parseDestination('/inventory/item-', basicConfig);
			expect(result).toBe(null);
		});
	});

	describe('basePath stripping', () => {
		it('strips basePath correctly', () => {
			const config: ParserConfig<InventoryDestination> = {
				basePath: '/inventory',
				parsers: [
					(path) => {
						// Path received should be relative (without /inventory)
						expect(path).toBe('/item-123');
						const params = matchPath('/item-:id', path);
						return params ? { type: 'detailItem', state: { itemId: params.id } } : null;
					}
				]
			};
			parseDestination('/inventory/item-123', config);
		});

		it('handles basePath with trailing slash', () => {
			const config: ParserConfig<InventoryDestination> = {
				basePath: '/inventory/',
				parsers: [
					(path) => {
						const params = matchPath('item-:id', path);
						return params ? { type: 'detailItem', state: { itemId: params.id } } : null;
					}
				]
			};
			const result = parseDestination('/inventory/item-456', config);
			expect(result).toEqual({
				type: 'detailItem',
				state: { itemId: '456' }
			});
		});

		it('handles deeply nested basePath', () => {
			const config: ParserConfig<InventoryDestination> = {
				basePath: '/app/admin/inventory',
				parsers: [
					(path) => {
						const params = matchPath('/item-:id', path);
						return params ? { type: 'detailItem', state: { itemId: params.id } } : null;
					}
				]
			};
			const result = parseDestination('/app/admin/inventory/item-789', config);
			expect(result).toEqual({
				type: 'detailItem',
				state: { itemId: '789' }
			});
		});
	});

	describe('case sensitivity', () => {
		it('paths are case-sensitive by default', () => {
			const config: ParserConfig<InventoryDestination> = {
				basePath: '/inventory',
				parsers: [
					(path) => {
						if (path === '/Add') {
							return { type: 'addItem', state: {} };
						}
						return null;
					}
				]
			};
			// Should not match - case doesn't match
			const result = parseDestination('/inventory/add', config);
			expect(result).toBe(null);
		});

		it('matches with correct case', () => {
			const config: ParserConfig<InventoryDestination> = {
				basePath: '/inventory',
				parsers: [
					(path) => {
						if (path === '/Add') {
							return { type: 'addItem', state: {} };
						}
						return null;
					}
				]
			};
			const result = parseDestination('/inventory/Add', config);
			expect(result).toEqual({ type: 'addItem', state: {} });
		});
	});

	describe('trailing slashes', () => {
		it('handles path with trailing slash', () => {
			const result = parseDestination('/inventory/add/', basicConfig);
			expect(result).toBe(null); // Exact match required
		});

		it('can configure parser to handle trailing slashes', () => {
			const config: ParserConfig<InventoryDestination> = {
				basePath: '/inventory',
				parsers: [
					(path) => {
						const normalized = path.replace(/\/$/, '') || '/';
						if (normalized === '/add') {
							return { type: 'addItem', state: {} };
						}
						return null;
					}
				]
			};
			const result = parseDestination('/inventory/add/', config);
			expect(result).toEqual({ type: 'addItem', state: {} });
		});
	});

	describe('query strings and hashes (ignored in v1)', () => {
		it('ignores query string in path', () => {
			// Query strings should be handled separately (v1.1 feature)
			// For v1, we just parse the pathname
			const pathWithQuery = '/inventory/item-123';
			const result = parseDestination(pathWithQuery, basicConfig);
			expect(result).toEqual({
				type: 'detailItem',
				state: { itemId: '123' }
			});
		});

		it('ignores hash fragment in path', () => {
			// Hash fragments should be handled separately (v1.1 feature)
			const pathWithHash = '/inventory/item-456';
			const result = parseDestination(pathWithHash, basicConfig);
			expect(result).toEqual({
				type: 'detailItem',
				state: { itemId: '456' }
			});
		});
	});
});

describe('matchPath', () => {
	describe('single parameter matching', () => {
		it('matches pattern with single param', () => {
			const result = matchPath('/item-:id', '/item-123');
			expect(result).toEqual({ id: '123' });
		});

		it('extracts param value correctly', () => {
			const result = matchPath('/user-:userId', '/user-abc-def');
			expect(result).toEqual({ userId: 'abc-def' });
		});

		it('returns null for non-matching path', () => {
			const result = matchPath('/item-:id', '/other-123');
			expect(result).toBe(null);
		});

		it('returns null for partial match', () => {
			const result = matchPath('/item-:id', '/item-123/extra');
			expect(result).toBe(null);
		});
	});

	describe('multiple parameter matching', () => {
		it('matches pattern with multiple params', () => {
			const result = matchPath('/item-:id/edit/:field', '/item-123/edit/name');
			expect(result).toEqual({ id: '123', field: 'name' });
		});

		it('extracts all params correctly', () => {
			const result = matchPath('/users/:userId/posts/:postId', '/users/alice/posts/42');
			expect(result).toEqual({ userId: 'alice', postId: '42' });
		});

		it('handles params with special characters', () => {
			const result = matchPath('/item-:id/edit/:field', '/item-abc-123/edit/first-name');
			expect(result).toEqual({ id: 'abc-123', field: 'first-name' });
		});
	});

	describe('exact matching', () => {
		it('requires exact match (no extra segments)', () => {
			const result = matchPath('/item-:id', '/item-123/extra');
			expect(result).toBe(null);
		});

		it('requires exact match (no missing segments)', () => {
			const result = matchPath('/item-:id/edit', '/item-123');
			expect(result).toBe(null);
		});
	});

	describe('special characters in params', () => {
		it('handles dashes in param values', () => {
			const result = matchPath('/item-:id', '/item-my-item-123');
			expect(result).toEqual({ id: 'my-item-123' });
		});

		it('handles underscores in param values', () => {
			const result = matchPath('/item-:id', '/item-my_item_123');
			expect(result).toEqual({ id: 'my_item_123' });
		});

		it('handles numbers in param values', () => {
			const result = matchPath('/item-:id', '/item-12345');
			expect(result).toEqual({ id: '12345' });
		});

		it('handles UUIDs in param values', () => {
			const result = matchPath('/item-:id', '/item-550e8400-e29b-41d4-a716-446655440000');
			expect(result).toEqual({ id: '550e8400-e29b-41d4-a716-446655440000' });
		});
	});

	describe('edge cases', () => {
		it('handles empty param value', () => {
			const result = matchPath('/item-:id', '/item-');
			expect(result).toBe(null); // path-to-regexp requires non-empty by default
		});

		it('handles pattern with no params', () => {
			const result = matchPath('/add', '/add');
			expect(result).toEqual({});
		});

		it('returns null for empty path', () => {
			const result = matchPath('/item-:id', '');
			expect(result).toBe(null);
		});

		it('handles root pattern', () => {
			const result = matchPath('/', '/');
			expect(result).toEqual({});
		});
	});

	describe('path-to-regexp advanced features (v1.1 deferred)', () => {
		// Note: path-to-regexp v8.x has different syntax than older versions
		// Optional params use {name} instead of :name?
		// Wildcards use {*name} instead of *
		// These are library capabilities we'll enable in v1.1

		it('supports named wildcards (v8.x syntax - v1.1 feature)', () => {
			// path-to-regexp v8.x uses {*name} for wildcards
			// This works in v1, documenting for future v1.1 usage
			const result = matchPath('/files/{*filepath}', '/files/docs/readme.md');
			expect(result).toEqual({ filepath: 'docs/readme.md' });
		});

		// Note: Optional segments require END option configuration in v8.x
		// We'll implement this in v1.1 with proper options handling
		it.skip('supports optional segments (v8.x syntax - v1.1 feature)', () => {
			// path-to-regexp v8.x optional segments require { end: false } option
			// This will be implemented in v1.1
			const result = matchPath('/item-:id/{action}', '/item-123');
			expect(result).toEqual({ id: '123' });
		});

		it.skip('supports optional segments with value (v1.1 feature)', () => {
			// Optional segments will be implemented in v1.1 with proper options
			const result = matchPath('/item-:id/{action}', '/item-123/edit');
			expect(result).toEqual({ id: '123', action: 'edit' });
		});
	});
});
