/**
 * Tests for createDestination() core functionality
 */

import { describe, it, expect } from 'vitest';
import { createDestination } from '../../src/lib/navigation/destination.js';
import type { Reducer } from '../../src/lib/types.js';
import { Effect } from '../../src/lib/effect.js';

// ============================================================================
// Test Fixtures
// ============================================================================

// AddItem feature
interface AddItemState {
	name: string;
	quantity: number;
}

type AddItemAction =
	| { type: 'nameChanged'; value: string }
	| { type: 'quantityChanged'; value: number }
	| { type: 'saveButtonTapped' }
	| { type: 'cancelButtonTapped' };

const addItemReducer: Reducer<AddItemState, AddItemAction> = (state, action) => {
	switch (action.type) {
		case 'nameChanged':
			return [{ ...state, name: action.value }, Effect.none()];
		case 'quantityChanged':
			return [{ ...state, quantity: action.value }, Effect.none()];
		case 'saveButtonTapped':
			return [state, Effect.none()];
		case 'cancelButtonTapped':
			return [state, Effect.none()];
		default:
			return [state, Effect.none()];
	}
};

// EditItem feature
interface EditItemState {
	id: string;
	name: string;
	quantity: number;
}

type EditItemAction =
	| { type: 'nameChanged'; value: string }
	| { type: 'quantityChanged'; value: number }
	| { type: 'saveButtonTapped' }
	| { type: 'deleteButtonTapped' };

const editItemReducer: Reducer<EditItemState, EditItemAction> = (state, action) => {
	switch (action.type) {
		case 'nameChanged':
			return [{ ...state, name: action.value }, Effect.none()];
		case 'quantityChanged':
			return [{ ...state, quantity: action.value }, Effect.none()];
		case 'saveButtonTapped':
			return [state, Effect.none()];
		case 'deleteButtonTapped':
			return [state, Effect.none()];
		default:
			return [state, Effect.none()];
	}
};

// ============================================================================
// Tests
// ============================================================================

describe('createDestination', () => {
	describe('basic functionality', () => {
		it('creates destination with reducer and helpers', () => {
			const Destination = createDestination({
				addItem: addItemReducer,
				editItem: editItemReducer
			});

			expect(Destination.reducer).toBeTypeOf('function');
			expect(Destination.initial).toBeTypeOf('function');
			expect(Destination.extract).toBeTypeOf('function');
			expect(Destination._types).toBeDefined();
		});
	});

	describe('initial()', () => {
		it('creates initial state for addItem case', () => {
			const Destination = createDestination({
				addItem: addItemReducer,
				editItem: editItemReducer
			});

			const state = Destination.initial('addItem', { name: 'Test', quantity: 5 });

			expect(state).toEqual({
				type: 'addItem',
				state: { name: 'Test', quantity: 5 }
			});
		});

		it('creates initial state for editItem case', () => {
			const Destination = createDestination({
				addItem: addItemReducer,
				editItem: editItemReducer
			});

			const state = Destination.initial('editItem', {
				id: '123',
				name: 'Test',
				quantity: 5
			});

			expect(state).toEqual({
				type: 'editItem',
				state: { id: '123', name: 'Test', quantity: 5 }
			});
		});
	});

	describe('extract()', () => {
		it('extracts child state for matching case', () => {
			const Destination = createDestination({
				addItem: addItemReducer,
				editItem: editItemReducer
			});

			const state = Destination.initial('addItem', { name: 'Test', quantity: 5 });
			const extracted = Destination.extract(state, 'addItem');

			expect(extracted).toEqual({ name: 'Test', quantity: 5 });
		});

		it('returns null for non-matching case', () => {
			const Destination = createDestination({
				addItem: addItemReducer,
				editItem: editItemReducer
			});

			const state = Destination.initial('addItem', { name: 'Test', quantity: 5 });
			const extracted = Destination.extract(state, 'editItem');

			expect(extracted).toBeNull();
		});

		it('returns null for null state', () => {
			const Destination = createDestination({
				addItem: addItemReducer,
				editItem: editItemReducer
			});

			const extracted = Destination.extract(null, 'addItem');

			expect(extracted).toBeNull();
		});
	});

	describe('reducer', () => {
		it('routes action to correct child reducer', () => {
			const Destination = createDestination({
				addItem: addItemReducer,
				editItem: editItemReducer
			});

			const initialState = Destination.initial('addItem', { name: '', quantity: 0 });
			const action = {
				type: 'addItem' as const,
				action: { type: 'presented' as const, action: { type: 'nameChanged' as const, value: 'New Name' } }
			};

			const [newState, effect] = Destination.reducer(initialState, action, {});

			expect(newState).toEqual({
				type: 'addItem',
				state: { name: 'New Name', quantity: 0 }
			});
			expect(effect._tag).toBe('None');
		});

		it('returns state unchanged when action is for different case', () => {
			const Destination = createDestination({
				addItem: addItemReducer,
				editItem: editItemReducer
			});

			const initialState = Destination.initial('addItem', { name: 'Test', quantity: 5 });
			const action = {
				type: 'editItem' as const,
				action: { type: 'presented' as const, action: { type: 'nameChanged' as const, value: 'New Name' } }
			};

			const [newState, effect] = Destination.reducer(initialState, action, {});

			// State unchanged (action is for editItem, but state is addItem)
			expect(newState).toEqual(initialState);
			expect(effect._tag).toBe('None');
		});

		it('handles dismiss action', () => {
			const Destination = createDestination({
				addItem: addItemReducer,
				editItem: editItemReducer
			});

			const initialState = Destination.initial('addItem', { name: 'Test', quantity: 5 });
			const action = {
				type: 'addItem' as const,
				action: { type: 'dismiss' as const }
			};

			const [newState, effect] = Destination.reducer(initialState, action, {});

			// State unchanged (parent should observe dismiss and clear destination)
			expect(newState).toEqual(initialState);
			expect(effect._tag).toBe('None');
		});

		it('handles multiple action types for same case', () => {
			const Destination = createDestination({
				addItem: addItemReducer,
				editItem: editItemReducer
			});

			let state = Destination.initial('addItem', { name: '', quantity: 0 });

			// First action: change name
			const nameAction = {
				type: 'addItem' as const,
				action: { type: 'presented' as const, action: { type: 'nameChanged' as const, value: 'Item 1' } }
			};
			[state] = Destination.reducer(state, nameAction, {});

			// Second action: change quantity
			const quantityAction = {
				type: 'addItem' as const,
				action: { type: 'presented' as const, action: { type: 'quantityChanged' as const, value: 10 } }
			};
			[state] = Destination.reducer(state, quantityAction, {});

			expect(state).toEqual({
				type: 'addItem',
				state: { name: 'Item 1', quantity: 10 }
			});
		});

		it('works with different case types', () => {
			const Destination = createDestination({
				addItem: addItemReducer,
				editItem: editItemReducer
			});

			// Test addItem case
			const addState = Destination.initial('addItem', { name: 'Add', quantity: 1 });
			const addAction = {
				type: 'addItem' as const,
				action: { type: 'presented' as const, action: { type: 'nameChanged' as const, value: 'Updated Add' } }
			};
			const [newAddState] = Destination.reducer(addState, addAction, {});
			expect(Destination.extract(newAddState, 'addItem')?.name).toBe('Updated Add');

			// Test editItem case
			const editState = Destination.initial('editItem', { id: '1', name: 'Edit', quantity: 2 });
			const editAction = {
				type: 'editItem' as const,
				action: { type: 'presented' as const, action: { type: 'nameChanged' as const, value: 'Updated Edit' } }
			};
			const [newEditState] = Destination.reducer(editState, editAction, {});
			expect(Destination.extract(newEditState, 'editItem')?.name).toBe('Updated Edit');
		});

		it('returns state unchanged for unknown case type', () => {
			const Destination = createDestination({
				addItem: addItemReducer,
				editItem: editItemReducer
			});

			const initialState = Destination.initial('addItem', { name: 'Test', quantity: 5 });
			const action = {
				type: 'unknownCase' as any,
				action: { type: 'presented' as const, action: { type: 'someAction' as const } }
			};

			const [newState, effect] = Destination.reducer(initialState, action, {});

			// State unchanged (unknown case type)
			expect(newState).toEqual(initialState);
			expect(effect._tag).toBe('None');
		});
	});

	describe('effect handling', () => {
		it('passes through effects from child reducer', () => {
			// Create reducer with effect
			const reducerWithEffect: Reducer<AddItemState, AddItemAction> = (state, action) => {
				if (action.type === 'saveButtonTapped') {
					return [
						state,
						Effect.run(async (dispatch) => {
							// Simulate async save
							dispatch({ type: 'cancelButtonTapped' });
						})
					];
				}
				return [state, Effect.none()];
			};

			const Destination = createDestination({
				addItem: reducerWithEffect
			});

			const initialState = Destination.initial('addItem', { name: 'Test', quantity: 5 });
			const action = {
				type: 'addItem' as const,
				action: { type: 'presented' as const, action: { type: 'saveButtonTapped' as const } }
			};

			const [newState, effect] = Destination.reducer(initialState, action, {});

			expect(effect._tag).toBe('Run');
		});
	});

	describe('type inference', () => {
		it('infers state type from reducer map', () => {
			const Destination = createDestination({
				addItem: addItemReducer,
				editItem: editItemReducer
			});

			// Type test: verify State type is correctly inferred
			type State = typeof Destination._types.State;
			const state: State = Destination.initial('addItem', { name: 'Test', quantity: 5 });

			expect(state.type).toBe('addItem');
		});

		it('infers action type from reducer map', () => {
			const Destination = createDestination({
				addItem: addItemReducer,
				editItem: editItemReducer
			});

			// Type test: verify Action type is correctly inferred
			type Action = typeof Destination._types.Action;
			const action: Action = {
				type: 'addItem',
				action: { type: 'presented', action: { type: 'nameChanged', value: 'Test' } }
			};

			expect(action.type).toBe('addItem');
			expect(action.action.type).toBe('presented');
		});
	});

	describe('matcher APIs', () => {
		const Destination = createDestination({
			addItem: addItemReducer,
			editItem: editItemReducer
		});

		describe('is()', () => {
			it('matches full path', () => {
				const action = {
					type: 'addItem',
					action: { type: 'presented' as const, action: { type: 'saveButtonTapped' as const } }
				};

				expect(Destination.is(action, 'addItem.saveButtonTapped')).toBe(true);
				expect(Destination.is(action, 'addItem.cancelButtonTapped')).toBe(false);
				expect(Destination.is(action, 'editItem.saveButtonTapped')).toBe(false);
			});

			it('matches prefix (case type only)', () => {
				const action = {
					type: 'addItem',
					action: { type: 'presented' as const, action: { type: 'saveButtonTapped' as const } }
				};

				expect(Destination.is(action, 'addItem')).toBe(true);
				expect(Destination.is(action, 'editItem')).toBe(false);
			});

			it('returns false for dismiss actions', () => {
				const action = {
					type: 'addItem',
					action: { type: 'dismiss' as const }
				};

				expect(Destination.is(action, 'addItem.saveButtonTapped')).toBe(false);
				expect(Destination.is(action, 'addItem')).toBe(true); // Prefix still matches
			});

			it('returns false for malformed actions', () => {
				expect(Destination.is(null, 'addItem.saveButtonTapped')).toBe(false);
				expect(Destination.is(undefined, 'addItem.saveButtonTapped')).toBe(false);
				expect(Destination.is('string', 'addItem.saveButtonTapped')).toBe(false);
				expect(Destination.is({}, 'addItem.saveButtonTapped')).toBe(false);
				expect(Destination.is({ type: 'addItem' }, 'addItem.saveButtonTapped')).toBe(false);
			});

			it('handles different action types', () => {
				const nameAction = {
					type: 'addItem',
					action: { type: 'presented' as const, action: { type: 'nameChanged' as const, value: 'Test' } }
				};

				const saveAction = {
					type: 'addItem',
					action: { type: 'presented' as const, action: { type: 'saveButtonTapped' as const } }
				};

				expect(Destination.is(nameAction, 'addItem.nameChanged')).toBe(true);
				expect(Destination.is(nameAction, 'addItem.saveButtonTapped')).toBe(false);
				expect(Destination.is(saveAction, 'addItem.saveButtonTapped')).toBe(true);
				expect(Destination.is(saveAction, 'addItem.nameChanged')).toBe(false);
			});
		});

		describe('matchCase()', () => {
			it('returns child state when action matches and state exists', () => {
				const state = Destination.initial('addItem', { name: 'Test', quantity: 5 });
				const action = {
					type: 'addItem',
					action: { type: 'presented' as const, action: { type: 'saveButtonTapped' as const } }
				};

				const result = Destination.matchCase(action, state, 'addItem.saveButtonTapped');

				expect(result).toEqual({ name: 'Test', quantity: 5 });
			});

			it('returns null when action does not match', () => {
				const state = Destination.initial('addItem', { name: 'Test', quantity: 5 });
				const action = {
					type: 'addItem',
					action: { type: 'presented' as const, action: { type: 'cancelButtonTapped' as const } }
				};

				const result = Destination.matchCase(action, state, 'addItem.saveButtonTapped');

				expect(result).toBeNull();
			});

			it('returns null when state is for different case', () => {
				const state = Destination.initial('addItem', { name: 'Test', quantity: 5 });
				const action = {
					type: 'editItem',
					action: { type: 'presented' as const, action: { type: 'saveButtonTapped' as const } }
				};

				const result = Destination.matchCase(action, state, 'editItem.saveButtonTapped');

				expect(result).toBeNull();
			});

			it('returns null when state is null', () => {
				const action = {
					type: 'addItem',
					action: { type: 'presented' as const, action: { type: 'saveButtonTapped' as const } }
				};

				const result = Destination.matchCase(action, null, 'addItem.saveButtonTapped');

				expect(result).toBeNull();
			});

			it('works with prefix matching', () => {
				const state = Destination.initial('addItem', { name: 'Test', quantity: 5 });
				const action = {
					type: 'addItem',
					action: { type: 'presented' as const, action: { type: 'saveButtonTapped' as const } }
				};

				const result = Destination.matchCase(action, state, 'addItem');

				expect(result).toEqual({ name: 'Test', quantity: 5 });
			});
		});

		describe('match()', () => {
			it('routes to correct handler', () => {
				const state = Destination.initial('addItem', { name: 'Test', quantity: 5 });
				const action = {
					type: 'addItem',
					action: { type: 'presented' as const, action: { type: 'saveButtonTapped' as const } }
				};

				const result = Destination.match(action, state, {
					'addItem.saveButtonTapped': (addState) => ({ type: 'add' as const, item: addState }),
					'addItem.cancelButtonTapped': (addState) => ({ type: 'cancel' as const }),
					'editItem.saveButtonTapped': (editState) => ({ type: 'edit' as const, item: editState })
				});

				expect(result.matched).toBe(true);
				if (result.matched) {
					expect(result.value).toEqual({ type: 'add', item: { name: 'Test', quantity: 5 } });
				}
			});

			it('returns first matching handler', () => {
				const state = Destination.initial('addItem', { name: 'Test', quantity: 5 });
				const action = {
					type: 'addItem',
					action: { type: 'presented' as const, action: { type: 'saveButtonTapped' as const } }
				};

				const result = Destination.match(action, state, {
					'addItem': () => 'prefix-match',
					'addItem.saveButtonTapped': () => 'full-match'
				});

				expect(result.matched).toBe(true);
				if (result.matched) {
					expect(result.value).toBe('prefix-match'); // First handler wins
				}
			});

			it('returns unmatched when no handlers match', () => {
				const state = Destination.initial('addItem', { name: 'Test', quantity: 5 });
				const action = {
					type: 'addItem',
					action: { type: 'presented' as const, action: { type: 'saveButtonTapped' as const } }
				};

				const result = Destination.match(action, state, {
					'addItem.cancelButtonTapped': () => 'cancel',
					'editItem.saveButtonTapped': () => 'edit'
				});

				expect(result.matched).toBe(false);
			});

			it('works with multiple cases', () => {
				const addState = Destination.initial('addItem', { name: 'Add', quantity: 1 });
				const editState = Destination.initial('editItem', { id: '1', name: 'Edit', quantity: 2 });

				const addAction = {
					type: 'addItem',
					action: { type: 'presented' as const, action: { type: 'saveButtonTapped' as const } }
				};

				const editAction = {
					type: 'editItem',
					action: { type: 'presented' as const, action: { type: 'deleteButtonTapped' as const } }
				};

				const handlers = {
					'addItem.saveButtonTapped': (s: any) => ({ type: 'add' as const, name: s.name }),
					'editItem.saveButtonTapped': (s: any) => ({ type: 'edit' as const, name: s.name }),
					'editItem.deleteButtonTapped': (s: any) => ({ type: 'delete' as const, id: s.id })
				};

				const addResult = Destination.match(addAction, addState, handlers);
				expect(addResult.matched).toBe(true);
				if (addResult.matched) {
					expect(addResult.value).toEqual({ type: 'add', name: 'Add' });
				}

				const editResult = Destination.match(editAction, editState, handlers);
				expect(editResult.matched).toBe(true);
				if (editResult.matched) {
					expect(editResult.value).toEqual({ type: 'delete', id: '1' });
				}
			});
		});
	});
});
