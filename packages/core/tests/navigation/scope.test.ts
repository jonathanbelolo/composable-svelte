/**
 * Tests for scopeTo() fluent API.
 *
 * These tests verify that the scope builder correctly navigates state trees
 * and creates properly-wrapped dispatch functions.
 */

import { describe, it, expect, vi } from 'vitest';
import { scopeTo } from '../../src/navigation/scope.js';
import type { Store } from '../../src/types.js';
import type { PresentationAction } from '../../src/navigation/types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

// Child state and actions
interface AddItemState {
	name: string;
	quantity: number;
}

type AddItemAction =
	| { type: 'nameChanged'; value: string }
	| { type: 'quantityChanged'; value: number };

interface EditItemState {
	id: string;
	name: string;
}

type EditItemAction = { type: 'nameChanged'; value: string };

// Destination union
type DestinationState =
	| { type: 'addItem'; state: AddItemState }
	| { type: 'editItem'; state: EditItemState };

type DestinationAction =
	| { type: 'addItem'; action: PresentationAction<AddItemAction> }
	| { type: 'editItem'; action: PresentationAction<EditItemAction> };

// Parent state and actions
interface ParentState {
	count: number;
	destination: DestinationState | null;
	modal: AddItemState | null;
}

type ParentAction =
	| { type: 'increment' }
	| { type: 'destination'; action: PresentationAction<DestinationAction> }
	| { type: 'modal'; action: PresentationAction<AddItemAction> };

// Create mock store
function createMockStore(state: ParentState): Store<ParentState, ParentAction> {
	const dispatch = vi.fn();
	return {
		state,
		dispatch
	};
}

// ============================================================================
// Tests
// ============================================================================

describe('scopeTo()', () => {
	describe('basic functionality', () => {
		it('creates a ScopeBuilder', () => {
			const store = createMockStore({
				count: 0,
				destination: null,
				modal: null
			});

			const builder = scopeTo(store);
			expect(builder).toBeDefined();
			expect(typeof builder.into).toBe('function');
		});
	});

	describe('into() navigation', () => {
		it('navigates into a field', () => {
			const store = createMockStore({
				count: 0,
				destination: { type: 'addItem', state: { name: 'Test', quantity: 5 } },
				modal: null
			});

			const builder = scopeTo(store).into('destination');
			expect(builder).toBeDefined();
		});

		it('supports chaining multiple into() calls', () => {
			interface NestedState {
				features: {
					inventory: {
						items: string[];
					} | null;
				};
			}

			const nestedStore = {
				state: {
					features: {
						inventory: {
							items: ['a', 'b']
						}
					}
				},
				dispatch: vi.fn()
			} as unknown as Store<NestedState, any>;

			const builder = scopeTo(nestedStore).into('features').into('inventory');
			expect(builder).toBeDefined();
		});

		it('enforces type-safe field access', () => {
			const store = createMockStore({
				count: 0,
				destination: null,
				modal: null
			});

			// These should compile
			scopeTo(store).into('destination');
			scopeTo(store).into('modal');
			scopeTo(store).into('count');

			// This should fail at compile time (uncomment to verify)
			// scopeTo(store).into('invalid');
		});
	});

	describe('case() for discriminated unions', () => {
		it('returns scoped store when case matches', () => {
			const store = createMockStore({
				count: 0,
				destination: { type: 'addItem', state: { name: 'Test', quantity: 5 } },
				modal: null
			});

			const scopedStore = scopeTo(store).into('destination').case('addItem');

			expect(scopedStore).not.toBeNull();
			expect(scopedStore?.state).toEqual({ name: 'Test', quantity: 5 });
		});

		it('returns null when case does not match', () => {
			const store = createMockStore({
				count: 0,
				destination: { type: 'addItem', state: { name: 'Test', quantity: 5 } },
				modal: null
			});

			const scopedStore = scopeTo(store).into('destination').case('editItem');

			expect(scopedStore).toBeNull();
		});

		it('returns null when destination is null', () => {
			const store = createMockStore({
				count: 0,
				destination: null,
				modal: null
			});

			const scopedStore = scopeTo(store).into('destination').case('addItem');

			expect(scopedStore).toBeNull();
		});

		it('creates dispatch function that wraps actions correctly', () => {
			const store = createMockStore({
				count: 0,
				destination: { type: 'addItem', state: { name: 'Test', quantity: 5 } },
				modal: null
			});

			const scopedStore = scopeTo(store).into('destination').case('addItem');

			// Dispatch child action
			scopedStore?.dispatch({ type: 'nameChanged', value: 'New Name' });

			// Verify wrapper layers
			expect(store.dispatch).toHaveBeenCalledWith({
				type: 'destination',
				action: {
					type: 'presented',
					action: {
						type: 'addItem',
						action: { type: 'nameChanged', value: 'New Name' }
					}
				}
			});
		});

		it('creates dismiss function that works correctly', () => {
			const store = createMockStore({
				count: 0,
				destination: { type: 'addItem', state: { name: 'Test', quantity: 5 } },
				modal: null
			});

			const scopedStore = scopeTo(store).into('destination').case('addItem');

			// Call dismiss
			scopedStore?.dismiss();

			// Verify dismiss action - should wrap with case type
			expect(store.dispatch).toHaveBeenCalledWith({
				type: 'destination',
				action: {
					type: 'addItem',
					action: { type: 'dismiss' }
				}
			});
		});
	});

	describe('optional() for non-enum fields', () => {
		it('returns scoped store when value is non-null', () => {
			const store = createMockStore({
				count: 0,
				destination: null,
				modal: { name: 'Test', quantity: 5 }
			});

			const scopedStore = scopeTo(store).into('modal').optional();

			expect(scopedStore).not.toBeNull();
			expect(scopedStore?.state).toEqual({ name: 'Test', quantity: 5 });
		});

		it('returns null when value is null', () => {
			const store = createMockStore({
				count: 0,
				destination: null,
				modal: null
			});

			const scopedStore = scopeTo(store).into('modal').optional();

			expect(scopedStore).toBeNull();
		});

		it('wraps actions without case type', () => {
			const store = createMockStore({
				count: 0,
				destination: null,
				modal: { name: 'Test', quantity: 5 }
			});

			const scopedStore = scopeTo(store).into('modal').optional();

			// Dispatch child action
			scopedStore?.dispatch({ type: 'nameChanged', value: 'Updated' });

			// Verify wrapper (no case type, just presentation + field)
			expect(store.dispatch).toHaveBeenCalledWith({
				type: 'modal',
				action: {
					type: 'presented',
					action: { type: 'nameChanged', value: 'Updated' }
				}
			});
		});

		it('dismiss works for optional fields', () => {
			const store = createMockStore({
				count: 0,
				destination: null,
				modal: { name: 'Test', quantity: 5 }
			});

			const scopedStore = scopeTo(store).into('modal').optional();

			// Call dismiss
			scopedStore?.dismiss();

			// Verify dismiss action
			expect(store.dispatch).toHaveBeenCalledWith({
				type: 'modal',
				action: { type: 'dismiss' }
			});
		});
	});

	describe('nested scoping', () => {
		it('handles deeply nested paths', () => {
			interface DeepState {
				level1: {
					level2: {
						level3: {
							value: string;
						} | null;
					} | null;
				};
			}

			type DeepAction =
				| { type: 'level1'; action: { type: 'presented'; action: any } };

			const deepStore = {
				state: {
					level1: {
						level2: {
							level3: {
								value: 'deep'
							}
						}
					}
				},
				dispatch: vi.fn()
			} as unknown as Store<DeepState, DeepAction>;

			const scopedStore = scopeTo(deepStore)
				.into('level1')
				.into('level2')
				.into('level3')
				.optional();

			expect(scopedStore).not.toBeNull();
			expect(scopedStore?.state.value).toBe('deep');
		});

		it('wraps actions through nested path correctly', () => {
			interface NestedState {
				outer: {
					inner: AddItemState | null;
				};
			}

			type NestedAction =
				| { type: 'outer'; action: { type: 'inner'; action: { type: 'presented'; action: any } } };

			const nestedStore = {
				state: {
					outer: {
						inner: { name: 'Test', quantity: 5 }
					}
				},
				dispatch: vi.fn()
			} as unknown as Store<NestedState, NestedAction>;

			const scopedStore = scopeTo(nestedStore).into('outer').into('inner').optional();

			scopedStore?.dispatch({ type: 'nameChanged', value: 'Updated' });

			// Should wrap through both levels (PresentationAction only at innermost level)
			expect(nestedStore.dispatch).toHaveBeenCalledWith({
				type: 'outer',
				action: {
					type: 'inner',
					action: {
						type: 'presented',
						action: { type: 'nameChanged', value: 'Updated' }
					}
				}
			});
		});

		it('returns null when any level in path is null', () => {
			interface NestedState {
				outer: {
					inner: AddItemState | null;
				} | null;
			}

			const nestedStore = {
				state: {
					outer: null
				},
				dispatch: vi.fn()
			} as unknown as Store<NestedState, any>;

			const scopedStore = scopeTo(nestedStore).into('outer').into('inner').optional();

			expect(scopedStore).toBeNull();
		});
	});

	describe('real-world usage patterns', () => {
		it('works like Product Gallery example', () => {
			// Simulate Product Gallery state structure
			interface ProductState {
				id: string;
				name: string;
			}

			type ProductDestination =
				| { type: 'detail'; state: { productId: string } }
				| { type: 'quickView'; state: { productId: string } }
				| { type: 'share'; state: { productId: string; url: string } }
				| { type: 'addToCart'; state: { productId: string; quantity: number } };

			interface AppState {
				destination: ProductDestination | null;
			}

			type AppAction = { type: 'destination'; action: any };

			const appStore = {
				state: {
					destination: {
						type: 'detail',
						state: { productId: '123' }
					}
				},
				dispatch: vi.fn()
			} as unknown as Store<AppState, AppAction>;

			// Scope to detail destination
			const detailStore = scopeTo(appStore).into('destination').case('detail');
			expect(detailStore).not.toBeNull();
			expect(detailStore?.state.productId).toBe('123');

			// Scope to quickView (not active)
			const quickViewStore = scopeTo(appStore).into('destination').case('quickView');
			expect(quickViewStore).toBeNull();
		});

		it('works with multiple independent destinations', () => {
			interface MultiState {
				modal: AddItemState | null;
				sheet: EditItemState | null;
				drawer: { settings: string } | null;
			}

			const multiStore = {
				state: {
					modal: { name: 'Modal', quantity: 1 },
					sheet: { id: '1', name: 'Sheet' },
					drawer: null
				},
				dispatch: vi.fn()
			} as unknown as Store<MultiState, any>;

			const modalStore = scopeTo(multiStore).into('modal').optional();
			const sheetStore = scopeTo(multiStore).into('sheet').optional();
			const drawerStore = scopeTo(multiStore).into('drawer').optional();

			expect(modalStore).not.toBeNull();
			expect(sheetStore).not.toBeNull();
			expect(drawerStore).toBeNull();
		});
	});

	describe('dismiss() behavior', () => {
		it('wraps dismiss with case type for enum destinations', () => {
			const store = {
				state: {
					destination: { type: 'addItem', state: { name: 'Test' } }
				},
				dispatch: vi.fn()
			} as unknown as Store<ParentState, any>;

			const scopedStore = scopeTo(store).into('destination').case('addItem');

			expect(scopedStore).not.toBeNull();
			scopedStore!.dismiss();

			// Should wrap: { type: 'dismiss' } -> { type: 'addItem', action: dismiss } -> { type: 'destination', action: ... }
			expect(store.dispatch).toHaveBeenCalledWith({
				type: 'destination',
				action: {
					type: 'addItem',
					action: { type: 'dismiss' }
				}
			});
		});

		it('does not wrap dismiss with case type for optional fields', () => {
			const store = {
				state: {
					modal: { name: 'Test' }
				},
				dispatch: vi.fn()
			} as unknown as Store<any, any>;

			const scopedStore = scopeTo(store).into('modal').optional();

			expect(scopedStore).not.toBeNull();
			scopedStore!.dismiss();

			// Should wrap: { type: 'dismiss' } -> { type: 'modal', action: dismiss } (no case type)
			expect(store.dispatch).toHaveBeenCalledWith({
				type: 'modal',
				action: { type: 'dismiss' }
			});
		});

		it('wraps dismiss through nested paths with case type', () => {
			interface NestedState {
				outer: {
					inner: { type: 'caseA'; state: { value: string } } | null;
				} | null;
			}

			const store = {
				state: {
					outer: {
						inner: { type: 'caseA', state: { value: 'test' } }
					}
				},
				dispatch: vi.fn()
			} as unknown as Store<NestedState, any>;

			const scopedStore = scopeTo(store).into('outer').into('inner').case('caseA');

			expect(scopedStore).not.toBeNull();
			scopedStore!.dismiss();

			// Should wrap through all levels
			expect(store.dispatch).toHaveBeenCalledWith({
				type: 'outer',
				action: {
					type: 'inner',
					action: {
						type: 'caseA',
						action: { type: 'dismiss' }
					}
				}
			});
		});
	});
});
