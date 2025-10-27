/**
 * Tests for createDestination() core functionality
 */

import { describe, it, expect } from 'vitest';
import { createDestination } from '../../src/navigation/destination.js';
import type { Reducer } from '../../src/types.js';
import { Effect } from '../../src/effect.js';

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
});
