/**
 * Unit Tests: URL Serialization
 *
 * Tests for serializeDestination and pathSegment functions.
 * Phase 7, Day 1: Serialization API
 */

import { describe, it, expect, vi } from 'vitest';
import { serializeDestination, pathSegment, type SerializerConfig } from '../../src/routing/serializer';

// Test Types
type InventoryDestination =
	| { type: 'detailItem'; state: { itemId: string } }
	| { type: 'editItem'; state: { itemId: string; field?: string } }
	| { type: 'addItem'; state: {} };

// Test Configuration
const basicConfig: SerializerConfig<InventoryDestination> = {
	basePath: '/inventory',
	serializers: {
		detailItem: (state) => `/inventory/item-${state.itemId}`,
		editItem: (state) =>
			state.field
				? `/inventory/item-${state.itemId}/edit/${state.field}`
				: `/inventory/item-${state.itemId}/edit`,
		addItem: () => '/inventory/add'
	}
};

describe('serializeDestination', () => {
	describe('null destination handling', () => {
		it('returns basePath for null destination', () => {
			const result = serializeDestination(null, basicConfig);
			expect(result).toBe('/inventory');
		});

		it('returns "/" when basePath is undefined and destination is null', () => {
			const config: SerializerConfig<InventoryDestination> = {
				serializers: {
					detailItem: (state) => `/item-${state.itemId}`
				}
			};
			const result = serializeDestination(null, config);
			expect(result).toBe('/');
		});

		it('returns "/" when basePath is "/" and destination is null', () => {
			const config: SerializerConfig<InventoryDestination> = {
				basePath: '/',
				serializers: {
					detailItem: (state) => `/item-${state.itemId}`
				}
			};
			const result = serializeDestination(null, config);
			expect(result).toBe('/');
		});
	});

	describe('simple destination serialization', () => {
		it('serializes detailItem destination', () => {
			const destination: InventoryDestination = {
				type: 'detailItem',
				state: { itemId: '123' }
			};
			const result = serializeDestination(destination, basicConfig);
			expect(result).toBe('/inventory/item-123');
		});

		it('serializes editItem destination without field', () => {
			const destination: InventoryDestination = {
				type: 'editItem',
				state: { itemId: '456' }
			};
			const result = serializeDestination(destination, basicConfig);
			expect(result).toBe('/inventory/item-456/edit');
		});

		it('serializes editItem destination with field', () => {
			const destination: InventoryDestination = {
				type: 'editItem',
				state: { itemId: '789', field: 'name' }
			};
			const result = serializeDestination(destination, basicConfig);
			expect(result).toBe('/inventory/item-789/edit/name');
		});

		it('serializes addItem destination', () => {
			const destination: InventoryDestination = {
				type: 'addItem',
				state: {}
			};
			const result = serializeDestination(destination, basicConfig);
			expect(result).toBe('/inventory/add');
		});
	});

	describe('multiple destination types', () => {
		type MultiDestination =
			| { type: 'typeA'; state: { id: string } }
			| { type: 'typeB'; state: { code: number } }
			| { type: 'typeC'; state: { name: string; value: boolean } };

		const multiConfig: SerializerConfig<MultiDestination> = {
			basePath: '/app',
			serializers: {
				typeA: (state) => `/app/a/${state.id}`,
				typeB: (state) => `/app/b/${state.code}`,
				typeC: (state) => `/app/c/${state.name}/${state.value ? 'on' : 'off'}`
			}
		};

		it('serializes typeA correctly', () => {
			const destination: MultiDestination = { type: 'typeA', state: { id: 'abc' } };
			expect(serializeDestination(destination, multiConfig)).toBe('/app/a/abc');
		});

		it('serializes typeB correctly', () => {
			const destination: MultiDestination = { type: 'typeB', state: { code: 42 } };
			expect(serializeDestination(destination, multiConfig)).toBe('/app/b/42');
		});

		it('serializes typeC correctly with boolean logic', () => {
			const destination1: MultiDestination = {
				type: 'typeC',
				state: { name: 'feature', value: true }
			};
			expect(serializeDestination(destination1, multiConfig)).toBe('/app/c/feature/on');

			const destination2: MultiDestination = {
				type: 'typeC',
				state: { name: 'feature', value: false }
			};
			expect(serializeDestination(destination2, multiConfig)).toBe('/app/c/feature/off');
		});
	});

	describe('unknown destination type handling', () => {
		it('warns and returns basePath for unknown type', () => {
			const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			// Cast to bypass type checking to test runtime behavior
			const unknownDestination = {
				type: 'unknownType',
				state: {}
			} as any;

			const result = serializeDestination(unknownDestination, basicConfig);

			expect(consoleSpy).toHaveBeenCalledWith(
				'[Composable Svelte] No serializer found for destination type: "unknownType". Falling back to base path.'
			);
			expect(result).toBe('/inventory');

			consoleSpy.mockRestore();
		});

		it('warns only once per unknown type', () => {
			const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			const unknownDestination = {
				type: 'anotherUnknown',
				state: { foo: 'bar' }
			} as any;

			serializeDestination(unknownDestination, basicConfig);

			expect(consoleSpy).toHaveBeenCalledTimes(1);
			expect(consoleSpy).toHaveBeenCalledWith(
				'[Composable Svelte] No serializer found for destination type: "anotherUnknown". Falling back to base path.'
			);

			consoleSpy.mockRestore();
		});
	});

	describe('basePath variations', () => {
		it('handles empty basePath', () => {
			const config: SerializerConfig<InventoryDestination> = {
				basePath: '',
				serializers: {
					detailItem: (state) => `/item-${state.itemId}`
				}
			};
			const result = serializeDestination(null, config);
			expect(result).toBe('');
		});

		it('handles basePath with trailing slash', () => {
			const config: SerializerConfig<InventoryDestination> = {
				basePath: '/inventory/',
				serializers: {
					detailItem: (state) => `/inventory/item-${state.itemId}`
				}
			};
			const result = serializeDestination(null, config);
			expect(result).toBe('/inventory/');
		});

		it('handles basePath without leading slash', () => {
			const config: SerializerConfig<InventoryDestination> = {
				basePath: 'inventory',
				serializers: {
					detailItem: (state) => `inventory/item-${state.itemId}`
				}
			};
			const result = serializeDestination(null, config);
			expect(result).toBe('inventory');
		});

		it('handles deeply nested basePath', () => {
			const config: SerializerConfig<InventoryDestination> = {
				basePath: '/app/admin/inventory',
				serializers: {
					detailItem: (state) => `/app/admin/inventory/item-${state.itemId}`
				}
			};
			const result = serializeDestination(null, config);
			expect(result).toBe('/app/admin/inventory');
		});
	});

	describe('special characters in paths', () => {
		type SpecialDestination = { type: 'special'; state: { id: string } };

		it('handles IDs with dashes', () => {
			const config: SerializerConfig<SpecialDestination> = {
				basePath: '/items',
				serializers: {
					special: (state) => `/items/${state.id}`
				}
			};
			const destination: SpecialDestination = {
				type: 'special',
				state: { id: 'item-with-dashes' }
			};
			expect(serializeDestination(destination, config)).toBe('/items/item-with-dashes');
		});

		it('handles IDs with underscores', () => {
			const config: SerializerConfig<SpecialDestination> = {
				basePath: '/items',
				serializers: {
					special: (state) => `/items/${state.id}`
				}
			};
			const destination: SpecialDestination = {
				type: 'special',
				state: { id: 'item_with_underscores' }
			};
			expect(serializeDestination(destination, config)).toBe('/items/item_with_underscores');
		});

		it('handles numeric IDs', () => {
			const config: SerializerConfig<SpecialDestination> = {
				basePath: '/items',
				serializers: {
					special: (state) => `/items/${state.id}`
				}
			};
			const destination: SpecialDestination = {
				type: 'special',
				state: { id: '12345' }
			};
			expect(serializeDestination(destination, config)).toBe('/items/12345');
		});

		it('handles UUIDs', () => {
			const config: SerializerConfig<SpecialDestination> = {
				basePath: '/items',
				serializers: {
					special: (state) => `/items/${state.id}`
				}
			};
			const destination: SpecialDestination = {
				type: 'special',
				state: { id: '550e8400-e29b-41d4-a716-446655440000' }
			};
			expect(serializeDestination(destination, config)).toBe(
				'/items/550e8400-e29b-41d4-a716-446655440000'
			);
		});
	});
});

describe('pathSegment', () => {
	describe('basic concatenation', () => {
		it('concatenates base and segment with slash', () => {
			const result = pathSegment('/inventory', 'item-123');
			expect(result).toBe('/inventory/item-123');
		});

		it('concatenates with segment already having leading slash', () => {
			const result = pathSegment('/inventory', '/item-123');
			expect(result).toBe('/inventory/item-123');
		});

		it('strips trailing slash from base', () => {
			const result = pathSegment('/inventory/', 'item-123');
			expect(result).toBe('/inventory/item-123');
		});

		it('handles both trailing slash in base and leading slash in segment', () => {
			const result = pathSegment('/inventory/', '/item-123');
			expect(result).toBe('/inventory/item-123');
		});
	});

	describe('root base path handling', () => {
		it('handles root "/" as base', () => {
			const result = pathSegment('/', 'items');
			expect(result).toBe('/items');
		});

		it('handles root "/" with segment having leading slash', () => {
			const result = pathSegment('/', '/items');
			expect(result).toBe('/items');
		});
	});

	describe('empty and edge cases', () => {
		it('handles empty segment', () => {
			const result = pathSegment('/inventory', '');
			expect(result).toBe('/inventory/');
		});

		it('handles empty base', () => {
			const result = pathSegment('', 'items');
			expect(result).toBe('/items');
		});

		it('handles empty base with leading slash segment', () => {
			const result = pathSegment('', '/items');
			expect(result).toBe('/items');
		});
	});

	describe('multi-segment paths', () => {
		it('concatenates multiple segments sequentially', () => {
			const step1 = pathSegment('/inventory', 'item-123');
			const step2 = pathSegment(step1, 'edit');
			expect(step2).toBe('/inventory/item-123/edit');
		});

		it('builds deeply nested paths', () => {
			let path = '/app';
			path = pathSegment(path, 'admin');
			path = pathSegment(path, 'inventory');
			path = pathSegment(path, 'item-123');
			path = pathSegment(path, 'edit');
			expect(path).toBe('/app/admin/inventory/item-123/edit');
		});
	});

	describe('base path variations', () => {
		it('handles base without leading slash', () => {
			const result = pathSegment('inventory', 'item-123');
			expect(result).toBe('inventory/item-123');
		});

		it('handles base with multiple trailing slashes', () => {
			const result = pathSegment('/inventory///', 'item-123');
			expect(result).toBe('/inventory///item-123'); // Only strips one trailing slash via regex
		});
	});

	describe('segment variations', () => {
		it('handles segment with special characters', () => {
			const result = pathSegment('/inventory', 'item-with-dashes');
			expect(result).toBe('/inventory/item-with-dashes');
		});

		it('handles segment with underscores', () => {
			const result = pathSegment('/inventory', 'item_with_underscores');
			expect(result).toBe('/inventory/item_with_underscores');
		});

		it('handles segment with numbers', () => {
			const result = pathSegment('/inventory', '12345');
			expect(result).toBe('/inventory/12345');
		});

		it('handles segment with UUID', () => {
			const result = pathSegment('/inventory', '550e8400-e29b-41d4-a716-446655440000');
			expect(result).toBe('/inventory/550e8400-e29b-41d4-a716-446655440000');
		});
	});
});
