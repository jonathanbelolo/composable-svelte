/**
 * Type Tests: Routing Types
 *
 * Tests to ensure TypeScript types work correctly at compile time.
 * Phase 7, Day 3: Types & Documentation
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
	RouteConfig,
	RouteMatcher,
	PathParams,
	DestinationType,
	DestinationState,
	Serializer,
	Parser,
	DestinationToActionMapper
} from '../../src/lib/routing/types';

// Test Destination Types
type TestDestination =
	| { type: 'detailItem'; state: { itemId: string } }
	| { type: 'editItem'; state: { itemId: string; field: string } }
	| { type: 'addItem'; state: {} };

// Test Action Types
type TestAction =
	| { type: 'itemSelected'; itemId: string }
	| { type: 'editItemTapped'; itemId: string; field: string }
	| { type: 'addItemTapped' }
	| { type: 'closeDestination' };

describe('Routing Types', () => {
	describe('PathParams', () => {
		it('accepts string key-value pairs', () => {
			const params: PathParams = { id: '123', action: 'edit' };
			expect(params.id).toBe('123');
			expect(params.action).toBe('edit');
		});

		it('type checks correctly', () => {
			const params: PathParams = { id: '123' };
			expectTypeOf(params).toEqualTypeOf<Record<string, string>>();
		});
	});

	describe('DestinationType', () => {
		it('extracts type union', () => {
			type Types = DestinationType<TestDestination>;
			expectTypeOf<Types>().toEqualTypeOf<'detailItem' | 'editItem' | 'addItem'>();
		});
	});

	describe('DestinationState', () => {
		it('extracts correct state for detailItem', () => {
			type DetailState = DestinationState<TestDestination, 'detailItem'>;
			expectTypeOf<DetailState>().toEqualTypeOf<{ itemId: string }>();
		});

		it('extracts correct state for editItem', () => {
			type EditState = DestinationState<TestDestination, 'editItem'>;
			expectTypeOf<EditState>().toEqualTypeOf<{ itemId: string; field: string }>();
		});

		it('extracts correct state for addItem', () => {
			type AddState = DestinationState<TestDestination, 'addItem'>;
			expectTypeOf<AddState>().toEqualTypeOf<{}>();
		});
	});

	describe('Serializer', () => {
		it('has correct function signature', () => {
			const detailSerializer: Serializer<TestDestination, 'detailItem'> = (state) => {
				expectTypeOf(state).toEqualTypeOf<{ itemId: string }>();
				return `/item-${state.itemId}`;
			};

			const result = detailSerializer({ itemId: '123' });
			expect(result).toBe('/item-123');
		});

		it('type checks state correctly for editItem', () => {
			const editSerializer: Serializer<TestDestination, 'editItem'> = (state) => {
				expectTypeOf(state).toEqualTypeOf<{ itemId: string; field: string }>();
				return `/item-${state.itemId}/edit/${state.field}`;
			};

			const result = editSerializer({ itemId: '456', field: 'name' });
			expect(result).toBe('/item-456/edit/name');
		});
	});

	describe('Parser', () => {
		it('has correct function signature', () => {
			const parser: Parser<TestDestination> = (path) => {
				expectTypeOf(path).toEqualTypeOf<string>();
				if (path === '/add') {
					return { type: 'addItem', state: {} };
				}
				return null;
			};

			const result = parser('/add');
			expect(result).toEqual({ type: 'addItem', state: {} });
		});

		it('returns nullable destination', () => {
			const parser: Parser<TestDestination> = (path) => {
				return null;
			};

			const result = parser('/unknown');
			expectTypeOf(result).toEqualTypeOf<TestDestination | null>();
			expect(result).toBe(null);
		});
	});

	describe('DestinationToActionMapper', () => {
		it('has correct function signature', () => {
			const mapper: DestinationToActionMapper<TestDestination, TestAction> = (dest) => {
				if (!dest) {
					return { type: 'closeDestination' };
				}

				switch (dest.type) {
					case 'detailItem':
						return { type: 'itemSelected', itemId: dest.state.itemId };
					case 'editItem':
						return {
							type: 'editItemTapped',
							itemId: dest.state.itemId,
							field: dest.state.field
						};
					case 'addItem':
						return { type: 'addItemTapped' };
				}
			};

			const action1 = mapper(null);
			expect(action1).toEqual({ type: 'closeDestination' });

			const action2 = mapper({ type: 'detailItem', state: { itemId: '123' } });
			expect(action2).toEqual({ type: 'itemSelected', itemId: '123' });
		});

		it('returns nullable action', () => {
			const mapper: DestinationToActionMapper<TestDestination, TestAction> = (dest) => {
				return null;
			};

			const result = mapper(null);
			expectTypeOf(result).toEqualTypeOf<TestAction | null>();
			expect(result).toBe(null);
		});
	});

	describe('RouteMatcher', () => {
		it('has correct function signature', () => {
			const matcher: RouteMatcher = (path) => {
				if (path === '/item-123') {
					return { id: '123' };
				}
				return null;
			};

			const result = matcher('/item-123');
			expect(result).toEqual({ id: '123' });
		});
	});

	describe('RouteConfig', () => {
		it('composes all config types correctly', () => {
			const config: RouteConfig<TestDestination, TestAction> = {
				basePath: '/inventory',

				serializers: {
					detailItem: (state) => `/inventory/item-${state.itemId}`,
					editItem: (state) => `/inventory/item-${state.itemId}/edit/${state.field}`,
					addItem: () => '/inventory/add'
				},

				parsers: [
					(path) => {
						if (path === '/add') {
							return { type: 'addItem', state: {} };
						}
						return null;
					}
				],

				destinationToAction: (dest) => {
					if (!dest) return { type: 'closeDestination' };
					switch (dest.type) {
						case 'detailItem':
							return { type: 'itemSelected', itemId: dest.state.itemId };
						case 'editItem':
							return {
								type: 'editItemTapped',
								itemId: dest.state.itemId,
								field: dest.state.field
							};
						case 'addItem':
							return { type: 'addItemTapped' };
					}
				}
			};

			// Verify config structure
			expect(config.basePath).toBe('/inventory');
			expect(config.serializers.detailItem({ itemId: '123' })).toBe('/inventory/item-123');
			expect(config.parsers.length).toBe(1);
			expect(config.destinationToAction(null)).toEqual({ type: 'closeDestination' });
		});

		it('allows optional basePath', () => {
			const config: RouteConfig<TestDestination, TestAction> = {
				serializers: {
					detailItem: (state) => `/item-${state.itemId}`
				},
				parsers: [],
				destinationToAction: () => null
			};

			expect(config.basePath).toBeUndefined();
		});

		it('enforces serializer state types', () => {
			const config: RouteConfig<TestDestination, TestAction> = {
				serializers: {
					detailItem: (state) => {
						// state is correctly typed as { itemId: string }
						expectTypeOf(state).toEqualTypeOf<{ itemId: string }>();
						return `/item-${state.itemId}`;
					},
					editItem: (state) => {
						// state is correctly typed as { itemId: string; field: string }
						expectTypeOf(state).toEqualTypeOf<{ itemId: string; field: string }>();
						return `/item-${state.itemId}/edit/${state.field}`;
					}
				},
				parsers: [],
				destinationToAction: () => null
			};

			expect(config.serializers.detailItem({ itemId: '123' })).toBe('/item-123');
		});
	});
});
