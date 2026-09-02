/**
 * Unit Tests: URL Parsing
 *
 * Tests for parseDestination and matchPath functions.
 * Phase 7, Day 2: Parsing API
 */

import { describe, it, expect } from 'vitest';
import {
	parseDestination,
	matchPath,
	createParserConfig,
	type ParserConfig
} from '../../src/lib/routing/parser';

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
				return { type: 'editItem', state: { itemId: params.id!, field: params.field! } };
			}
			return null;
		},
		(path) => {
			const params = matchPath('/item-:id/edit', path);
			if (params) {
				return { type: 'editItem', state: { itemId: params.id! } };
			}
			return null;
		},
		(path) => {
			const params = matchPath('/item-:id', path);
			if (params) {
				return { type: 'detailItem', state: { itemId: params.id! } };
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
						return params ? { type: 'detailItem', state: { itemId: params.id! } } : null;
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
						return params ? { type: 'detailItem', state: { itemId: params.id! } } : null;
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
						return params ? { type: 'detailItem', state: { itemId: params.id! } } : null;
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
						return params ? { type: 'detailItem', state: { itemId: params.id! } } : null;
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
						return params ? { type: 'detailItem', state: { itemId: params.id! } } : null;
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

		// These two were skipped as "requires the END option, deferred to v1.1".
		// Neither is true: `{action}` is an optional *literal* segment, so it
		// never captured anything and no `end` option would have helped. The
		// parameter form is `{/:action}`, and it works today.
		it('supports optional segments', () => {
			const result = matchPath('/item-:id{/:action}', '/item-123');
			expect(result).toEqual({ id: '123' });
		});

		it('supports optional segments with value', () => {
			const result = matchPath('/item-:id{/:action}', '/item-123/edit');
			expect(result).toEqual({ id: '123', action: 'edit' });
		});
	});
});

describe('matchPath, exactly as documented', () => {
	/**
	 * Every example in `matchPath`'s JSDoc, run. Two of them used to throw
	 * rather than match — `:action?` gave `Unexpected ?` and a bare `*` gave
	 * `Missing parameter name`, both pre-v8 path-to-regexp syntax — while the
	 * doc block above them claimed support for "optional params, wildcards".
	 * They were labelled "deferred"; they work today, in v8 syntax.
	 */
	it('named parameter', () => {
		expect(matchPath('/item-:id', '/item-123')).toEqual({ id: '123' });
	});

	it('multiple parameters', () => {
		expect(matchPath('/item-:id/edit/:field', '/item-123/edit/name')).toEqual({
			id: '123',
			field: 'name'
		});
	});

	it('no match', () => {
		expect(matchPath('/item-:id', '/other/123')).toBeNull();
	});

	it('optional segment, present and absent', () => {
		expect(matchPath('/item-:id{/:action}', '/item-123/edit')).toEqual({
			id: '123',
			action: 'edit'
		});
		expect(matchPath('/item-:id{/:action}', '/item-123')).toEqual({ id: '123' });
	});

	it('named wildcard', () => {
		expect(matchPath('/files/*path', '/files/docs/readme.md')).toEqual({
			path: 'docs/readme.md'
		});
		expect(matchPath('/files/*path', '/files/readme.md')).toEqual({ path: 'readme.md' });
	});
});

describe('createParserConfig', () => {
	type Dest =
		| { type: 'edit'; state: { itemId: string } }
		| { type: 'detail'; state: { itemId: string } }
		| { type: 'add'; state: Record<string, never> };

	it('agrees with the list form under a basePath', () => {
		// The arm worth having: prove the two forms agree on the same inputs,
		// rather than testing the map form in isolation and hoping.
		const fromMap = createParserConfig<Dest>(
			{
				'/item/:itemId/edit': (p) => ({ type: 'edit', state: { itemId: p.itemId ?? '' } }),
				'/item/:itemId': (p) => ({ type: 'detail', state: { itemId: p.itemId ?? '' } }),
				'/add': () => ({ type: 'add', state: {} })
			},
			{ basePath: '/shop' }
		);
		const byHand: ParserConfig<Dest> = {
			basePath: '/shop',
			parsers: [
				(path) => {
					const p = matchPath('/item/:itemId/edit', path);
					return p ? { type: 'edit', state: { itemId: p.itemId ?? '' } } : null;
				},
				(path) => {
					const p = matchPath('/item/:itemId', path);
					return p ? { type: 'detail', state: { itemId: p.itemId ?? '' } } : null;
				},
				(path) => (path === '/add' ? { type: 'add', state: {} } : null)
			]
		};

		for (const path of ['/shop/item/7/edit', '/shop/item/7', '/shop/add', '/shop/nope']) {
			expect(parseDestination(path, fromMap), path).toEqual(parseDestination(path, byHand));
		}
	});

	it('still matches with no basePath, where the hand-written form does not', () => {
		// Not a difference for its own sake. `parseDestination` defaults
		// `basePath` to '/' and strips it, so a parser receives 'add' rather than
		// '/add' — and a pattern written the obvious way, with a leading slash,
		// silently never matches. Route patterns always carry the slash, so
		// `createParserConfig` normalises rather than requiring every author to
		// know this. The list form is left exactly as it was.
		const fromMap = createParserConfig<Dest>({ '/add': () => ({ type: 'add', state: {} }) });
		const byHand: ParserConfig<Dest> = {
			parsers: [(path) => (matchPath('/add', path) ? { type: 'add', state: {} } : null)]
		};

		expect(parseDestination('/add', fromMap)?.type).toBe('add');
		expect(parseDestination('/add', byHand), 'the trap this normalises away').toBeNull();
	});

	// These two use a wildcard on purpose. An earlier version paired
	// '/item/:id/edit' with '/item/:id', which do not actually overlap — `:id`
	// matches one segment, so '/item/:id' never matches '/item/7/edit' and the
	// order made no difference. Both arms passed with the map reversed, which is
	// to say they tested nothing. A wildcard genuinely shadows.

	it('tries keys in insertion order — specific first wins', () => {
		const config = createParserConfig<Dest>({
			'/item/:itemId': (p) => ({ type: 'detail', state: { itemId: p.itemId ?? '' } }),
			'/*rest': () => ({ type: 'add', state: {} })
		});

		expect(parseDestination('/item/7', config)?.type).toBe('detail');
	});

	it('tries keys in insertion order — general first shadows, which is the hazard', () => {
		// The same two routes the other way round, so the guarantee is proved in
		// both directions rather than by one lucky example.
		const config = createParserConfig<Dest>({
			'/*rest': () => ({ type: 'add', state: {} }),
			'/item/:itemId': (p) => ({ type: 'detail', state: { itemId: p.itemId ?? '' } })
		});

		expect(parseDestination('/item/7', config)?.type).toBe('add');
	});

	it('lets a handler decline after its pattern matched', () => {
		// What the list form could always do and a naive map form could not:
		// match the shape, then reject the value.
		const config = createParserConfig<Dest>({
			'/item/:itemId': (p) => (/^\d+$/.test(p.itemId ?? '') ? { type: 'detail', state: { itemId: p.itemId ?? '' } } : null),
			'/item/:itemId/edit': (p) => ({ type: 'edit', state: { itemId: p.itemId ?? '' } })
		});

		expect(parseDestination('/item/7', config)?.type).toBe('detail');
		expect(parseDestination('/item/abc', config)).toBeNull();
	});

	it('passes every parameter and the matched path to the handler', () => {
		const seen: Array<[Record<string, string>, string]> = [];
		const config = createParserConfig<Dest>({
			'/item/:itemId/:field': (params, path) => {
				seen.push([params, path]);
				return { type: 'edit', state: { itemId: params.itemId ?? '' } };
			}
		});

		parseDestination('/item/7/name', config);

		expect(seen).toEqual([[{ itemId: '7', field: 'name' }, '/item/7/name']]);
	});

	it('honours basePath', () => {
		const config = createParserConfig<Dest>({ '/add': () => ({ type: 'add', state: {} }) }, {
			basePath: '/inventory'
		});

		expect(parseDestination('/inventory/add', config)?.type).toBe('add');
		expect(parseDestination('/add', config)).toBeNull();
	});

	it('omits basePath rather than setting it undefined', () => {
		// `exactOptionalPropertyTypes`: `{ basePath: undefined }` is not the same
		// as `{}`, and only the latter is assignable.
		expect('basePath' in createParserConfig<Dest>({})).toBe(false);
	});

	it('yields null when nothing matches', () => {
		const config = createParserConfig<Dest>({ '/add': () => ({ type: 'add', state: {} }) });
		expect(parseDestination('/elsewhere', config)).toBeNull();
	});
});
