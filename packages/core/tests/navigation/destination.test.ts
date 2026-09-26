/**
 * Tests for createDestination() core functionality
 */

import { describe, it, expect, vi } from 'vitest';
import { createDestination } from '../../src/lib/navigation/destination.js';
import {
	destinationCases,
	isDestinationReducer
} from '../../src/lib/navigation/destination-metadata.js';
import * as navigationExports from '../../src/lib/navigation/index.js';
import * as applicationExports from '../../src/lib/application/index.js';
import * as rootExports from '../../src/lib/index.js';
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
				action: { type: 'nameChanged' as const, value: 'New Name' }
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
				action: { type: 'nameChanged' as const, value: 'New Name' }
			};

			const [newState, effect] = Destination.reducer(initialState, action, {});

			// State unchanged (action is for editItem, but state is addItem)
			expect(newState).toEqual(initialState);
			expect(effect._tag).toBe('None');
		});

		it('refuses a case named after the PresentationAction wrapper', () => {
			// The matchers look through `presented` and refuse `dismiss`; a case by
			// either name would make every match ambiguous. Dismiss itself never
			// reaches this reducer — ifLetPresentation nulls the field.
			expect(() => createDestination({ presented: addItemReducer })).toThrow(/cannot be a case name/);
			expect(() => createDestination({ dismiss: addItemReducer })).toThrow(/cannot be a case name/);
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
				action: { type: 'nameChanged' as const, value: 'Item 1' }
			};
			[state] = Destination.reducer(state, nameAction, {});

			// Second action: change quantity
			const quantityAction = {
				type: 'addItem' as const,
				action: { type: 'quantityChanged' as const, value: 10 }
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
				action: { type: 'nameChanged' as const, value: 'Updated Add' }
			};
			const [newAddState] = Destination.reducer(addState, addAction, {});
			expect(Destination.extract(newAddState, 'addItem')?.name).toBe('Updated Add');

			// Test editItem case
			const editState = Destination.initial('editItem', { id: '1', name: 'Edit', quantity: 2 });
			const editAction = {
				type: 'editItem' as const,
				action: { type: 'nameChanged' as const, value: 'Updated Edit' }
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
			// Deliberately outside `DestinationAction` — an unknown case type is the
			// subject here, so the cast is the test, not a workaround for it.
			const action = {
				type: 'unknownCase',
				action: { type: 'someAction' as const }
			} as unknown as typeof Destination._types.Action;

			const [newState, effect] = Destination.reducer(initialState, action, {});

			// State unchanged (unknown case type)
			expect(newState).toEqual(initialState);
			expect(effect._tag).toBe('None');
		});
	});

	describe('effect handling', () => {
		it('maps the child effect back into the case, so its dispatch reaches the child', async () => {
			// `_tag === 'Run'` was the whole assertion here once, and `Effect.map` of
			// a Run is a Run, so it held with and without the mapping. Executing the
			// effect is what tells them apart (AUDIT-2026-09-03-FINDINGS N2).
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
				action: { type: 'saveButtonTapped' as const }
			};

			const [, effect] = Destination.reducer(initialState, action, {});
			expect(effect._tag).toBe('Run');
			// Under the case's group (C6): the field's group is added one level up.
			expect((effect as { groups?: readonly string[] }).groups).toEqual(['addItem']);

			const dispatched: unknown[] = [];
			await (effect as { execute: (d: (a: unknown) => void) => Promise<void> }).execute((a) => dispatched.push(a));

			// Carries the case, so the layer above routes it back here.
			expect(dispatched).toEqual([{ type: 'addItem', action: { type: 'cancelButtonTapped' } }]);
			const [after, afterEffect] = Destination.reducer(
				initialState,
				dispatched[0] as typeof Destination._types.Action,
				{}
			);
			expect(after).toEqual(initialState);
			expect(afterEffect._tag).toBe('None');
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
				action: { type: 'nameChanged', value: 'Test' }
			};

			expect(action.type).toBe('addItem');
			expect(action.action.type).toBe('nameChanged');
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
					action: { type: 'saveButtonTapped' as const }
				};

				expect(Destination.is(action, 'addItem.saveButtonTapped')).toBe(true);
				expect(Destination.is(action, 'addItem.cancelButtonTapped')).toBe(false);
				expect(Destination.is(action, 'editItem.saveButtonTapped')).toBe(false);
			});

			it('matches prefix (case type only)', () => {
				const action = {
					type: 'addItem',
					action: { type: 'saveButtonTapped' as const }
				};

				expect(Destination.is(action, 'addItem')).toBe(true);
				expect(Destination.is(action, 'editItem')).toBe(false);
			});

			it('returns false for a dismiss, which names no case', () => {
				// A dismiss is the field's PresentationAction, not a case action; the
				// earlier form let a prefix path match it.
				expect(Destination.is({ type: 'dismiss' }, 'addItem')).toBe(false);
				expect(Destination.is({ type: 'destination', action: { type: 'dismiss' } }, 'addItem')).toBe(false);
				expect(Destination.is({ type: 'dismiss' }, 'addItem.saveButtonTapped')).toBe(false);
			});

			it('looks through the presented wrapper and the parent field', () => {
				const caseAction = { type: 'addItem', action: { type: 'saveButtonTapped' as const } };
				const presented = { type: 'presented' as const, action: caseAction };
				const parent = { type: 'destination', action: presented };

				for (const shape of [caseAction, presented, parent]) {
					expect(Destination.is(shape, 'addItem.saveButtonTapped')).toBe(true);
					expect(Destination.is(shape, 'addItem')).toBe(true);
					expect(Destination.is(shape, 'editItem.saveButtonTapped')).toBe(false);
				}
			});

			it('does not look through a child action that happens to be named presented', () => {
				// The lookthrough is bounded: one field, one wrapper, one case.
				const nested = {
					type: 'presented',
					action: { type: 'presented', action: { type: 'addItem', action: { type: 'saveButtonTapped' } } }
				};
				expect(Destination.is(nested, 'addItem.saveButtonTapped')).toBe(false);
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
					action: { type: 'nameChanged' as const, value: 'Test' }
				};

				const saveAction = {
					type: 'addItem',
					action: { type: 'saveButtonTapped' as const }
				};

				expect(Destination.is(nameAction, 'addItem.nameChanged')).toBe(true);
				expect(Destination.is(nameAction, 'addItem.saveButtonTapped')).toBe(false);
				expect(Destination.is(saveAction, 'addItem.saveButtonTapped')).toBe(true);
				expect(Destination.is(saveAction, 'addItem.nameChanged')).toBe(false);
			});
		});

		describe('is() decides by the wrapper shape, not by a name (R1-REVIEW 1.9)', () => {
			it('a dismiss under a field named like a case names no case', () => {
				expect(Destination.is({ type: 'addItem', action: { type: 'dismiss' } }, 'addItem')).toBe(false);
				expect(Destination.is({ type: 'addItem', action: { type: 'dismiss' } }, 'addItem.saveButtonTapped')).toBe(false);
			});

			it('a presented wrapper under a field named like a case is looked through', () => {
				const shape = { type: 'addItem', action: { type: 'presented', action: { type: 'editItem', action: { type: 'saveButtonTapped' } } } };
				expect(Destination.is(shape, 'editItem.saveButtonTapped')).toBe(true);
				expect(Destination.is(shape, 'addItem')).toBe(false);
			});

			it('a parent-level action that merely shares a case name, carrying no child action, matches no path', () => {
				expect(Destination.is({ type: 'addItem', value: 1 }, 'addItem')).toBe(false);
			});

			it('an inherited property is not a case', () => {
				expect(Destination.is({ type: 'hasOwnProperty', action: { type: 'x' } }, 'hasOwnProperty')).toBe(false);
				expect(Destination.is({ type: 'constructor', action: { type: 'x' } }, 'constructor')).toBe(false);
			});
		});

		describe('matchCase()', () => {
			it('returns child state when action matches and state exists', () => {
				const state = Destination.initial('addItem', { name: 'Test', quantity: 5 });
				const action = {
					type: 'addItem',
					action: { type: 'saveButtonTapped' as const }
				};

				const result = Destination.matchCase(action, state, 'addItem.saveButtonTapped');

				expect(result).toEqual({ name: 'Test', quantity: 5 });
			});

			it('returns null when action does not match', () => {
				const state = Destination.initial('addItem', { name: 'Test', quantity: 5 });
				const action = {
					type: 'addItem',
					action: { type: 'cancelButtonTapped' as const }
				};

				const result = Destination.matchCase(action, state, 'addItem.saveButtonTapped');

				expect(result).toBeNull();
			});

			it('returns null when state is for different case', () => {
				const state = Destination.initial('addItem', { name: 'Test', quantity: 5 });
				const action = {
					type: 'editItem',
					action: { type: 'saveButtonTapped' as const }
				};

				const result = Destination.matchCase(action, state, 'editItem.saveButtonTapped');

				expect(result).toBeNull();
			});

			it('returns null when state is null', () => {
				const action = {
					type: 'addItem',
					action: { type: 'saveButtonTapped' as const }
				};

				const result = Destination.matchCase(action, null, 'addItem.saveButtonTapped');

				expect(result).toBeNull();
			});

			it('works with prefix matching', () => {
				const state = Destination.initial('addItem', { name: 'Test', quantity: 5 });
				const action = {
					type: 'addItem',
					action: { type: 'saveButtonTapped' as const }
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
					action: { type: 'saveButtonTapped' as const }
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
					action: { type: 'saveButtonTapped' as const }
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
					action: { type: 'saveButtonTapped' as const }
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
					action: { type: 'saveButtonTapped' as const }
				};

				const editAction = {
					type: 'editItem',
					action: { type: 'deleteButtonTapped' as const }
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

	describe('C1 destination metadata and construction snapshot', () => {
		it('preserves genuine result metadata identity, frozen keys/routes, null prototype, key order, and generated reducer membership', () => {
			const map = {
				'10': editItemReducer,
				'2': addItemReducer,
				addItem: addItemReducer,
				editItem: editItemReducer
			};
			const Destination = createDestination(map);
			const metadata = destinationCases(Destination);

			expect(metadata).toBeDefined();
			expect(metadata.reducer).toBe(Destination.reducer);
			expect(Object.isFrozen(metadata)).toBe(true);
			expect(Object.isFrozen(metadata.keys)).toBe(true);
			expect(Object.isFrozen(metadata.routes)).toBe(true);
			expect(Object.getPrototypeOf(metadata.routes)).toBeNull();

			// Key order matches Object.keys order (integer-like first ascending, then insertion)
			expect(metadata.keys).toEqual(Object.keys(map));
			expect(metadata.keys).toEqual(['2', '10', 'addItem', 'editItem']);

			expect(metadata.routes['2']).toBe(addItemReducer);
			expect(metadata.routes['10']).toBe(editItemReducer);
			expect(metadata.routes.addItem).toBe(addItemReducer);
			expect(metadata.routes.editItem).toBe(editItemReducer);

			// Result object itself remains unfrozen
			expect(Object.isFrozen(Destination)).toBe(false);

			// Reducer membership
			expect(isDestinationReducer(Destination.reducer)).toBe(true);
			expect(isDestinationReducer(addItemReducer)).toBe(false);
			expect(isDestinationReducer(() => [{ count: 0 }, Effect.none()])).toBe(false);
			expect(isDestinationReducer(null)).toBe(false);
			expect(isDestinationReducer({})).toBe(false);
		});

		it('rejects fake, spread, proxy, Object.create, bare reducer, and primitive values from destinationCases', () => {
			const Destination = createDestination({
				addItem: addItemReducer,
				editItem: editItemReducer
			});

			const expectedError = 'Expected a destination created by createDestination';

			// Spread copy
			const spread = { ...Destination };
			expect(() => destinationCases(spread)).toThrow(TypeError);
			expect(() => destinationCases(spread)).toThrow(expectedError);

			// Object.create
			const created = Object.create(Destination);
			expect(() => destinationCases(created)).toThrow(TypeError);
			expect(() => destinationCases(created)).toThrow(expectedError);

			// Proxy around genuine destination
			const proxy = new Proxy(Destination, {});
			expect(() => destinationCases(proxy)).toThrow(TypeError);
			expect(() => destinationCases(proxy)).toThrow(expectedError);

			// Hand-built fake carrying genuine reducer and all members
			const fake = {
				reducer: Destination.reducer,
				initial: Destination.initial,
				extract: Destination.extract,
				is: Destination.is,
				matchCase: Destination.matchCase,
				match: Destination.match,
				_types: null as any
			};
			expect(() => destinationCases(fake)).toThrow(TypeError);
			expect(() => destinationCases(fake)).toThrow(expectedError);

			// Bare reducer
			expect(() => destinationCases(Destination.reducer)).toThrow(TypeError);
			expect(() => destinationCases(Destination.reducer)).toThrow(expectedError);

			// Primitives and null/undefined
			expect(() => destinationCases(null)).toThrow(TypeError);
			expect(() => destinationCases(null)).toThrow(expectedError);
			expect(() => destinationCases(undefined)).toThrow(TypeError);
			expect(() => destinationCases(undefined)).toThrow(expectedError);
			expect(() => destinationCases('destination')).toThrow(TypeError);
			expect(() => destinationCases('destination')).toThrow(expectedError);
			expect(() => destinationCases(123)).toThrow(TypeError);
			expect(() => destinationCases(123)).toThrow(expectedError);
			expect(() => destinationCases(true)).toThrow(TypeError);
			expect(() => destinationCases(true)).toThrow(expectedError);
			expect(() => destinationCases(Symbol('destination'))).toThrow(TypeError);
			expect(() => destinationCases(Symbol('destination'))).toThrow(expectedError);
			expect(() => destinationCases({})).toThrow(TypeError);
			expect(() => destinationCases({})).toThrow(expectedError);
		});

		it('ensures post-construction mutation of caller map is inert for routing and matchers while caller map stays unfrozen', () => {
			const map: Record<string, Reducer<any, any, any>> = {
				addItem: addItemReducer,
				editItem: editItemReducer
			};
			const Destination = createDestination(map);
			const metadata = destinationCases(Destination);
			const snapshotKeys = metadata.keys;
			const snapshotRoutes = metadata.routes;

			// Caller map remains unfrozen
			expect(Object.isFrozen(map)).toBe(false);

			const dummyReducer: Reducer<any, any, any> = vi.fn((state: any) => [
				{ ...state, swapped: true },
				Effect.none()
			] as const);

			// Mutate caller map: add, delete, swap
			map.extraItem = dummyReducer;
			delete map.addItem;
			map.editItem = dummyReducer;

			// 1. Deleted key still routes correctly using snapshot
			const addInitial = Destination.initial('addItem' as any, { name: 'Test', quantity: 1 } as any);
			const addAction = {
				type: 'addItem',
				action: { type: 'nameChanged', value: 'Updated' }
			};
			const [nextAddState] = Destination.reducer(addInitial, addAction as any, {});
			expect(Destination.extract(nextAddState, 'addItem' as any)?.name).toBe('Updated');

			// 2. Swapped key routes to original reducer, not swapped dummy
			const editInitial = Destination.initial('editItem' as any, { id: '1', name: 'Original', quantity: 2 } as any);
			const editAction = {
				type: 'editItem',
				action: { type: 'nameChanged', value: 'Edited' }
			};
			const [nextEditState] = Destination.reducer(editInitial, editAction as any, {});
			expect(Destination.extract(nextEditState, 'editItem' as any)?.name).toBe('Edited');
			expect((nextEditState as any).state.swapped).toBeUndefined();

			// 3. Added key is unrouted even when state matches the added case.
			// The spy makes this discriminate a live-map implementation.
			const extraInitial = { type: 'extraItem', state: { value: 1 } } as any;
			const [unroutedState, effect] = Destination.reducer(
				extraInitial,
				{ type: 'extraItem', action: { type: 'any' } } as any,
				{}
			);
			expect(unroutedState).toBe(extraInitial);
			expect(effect._tag).toBe('None');
			expect(dummyReducer).not.toHaveBeenCalled();

			// 4. Metadata is the same immutable construction snapshot after mutations.
			const afterMutation = destinationCases(Destination);
			expect(afterMutation).toBe(metadata);
			expect(afterMutation.keys).toBe(snapshotKeys);
			expect(afterMutation.keys).toEqual(['addItem', 'editItem']);
			expect(afterMutation.routes).toBe(snapshotRoutes);
			expect(afterMutation.routes.addItem).toBe(addItemReducer);
			expect(afterMutation.routes.editItem).toBe(editItemReducer);
			expect(Object.hasOwn(afterMutation.routes, 'extraItem')).toBe(false);

			// 5. Matcher APIs are inert to mutations
			expect(Destination.is({ type: 'addItem', action: { type: 'nameChanged' } }, 'addItem')).toBe(true);
			expect(Destination.is({ type: 'extraItem', action: { type: 'nameChanged' } }, 'extraItem')).toBe(false);

			const matchResult = Destination.matchCase(
				{ type: 'addItem', action: { type: 'nameChanged' } },
				addInitial,
				'addItem'
			);
			expect(matchResult).toEqual({ name: 'Test', quantity: 1 });

			const matchExtraResult = Destination.matchCase(
				{ type: 'extraItem', action: { type: 'nameChanged' } },
				addInitial,
				'extraItem'
			);
			expect(matchExtraResult).toBeNull();
		});

		it('accepts a pre-frozen caller map', () => {
			const map = Object.freeze({
				addItem: addItemReducer,
				editItem: editItemReducer
			});
			const Destination = createDestination(map);
			expect(Destination).toBeDefined();

			const metadata = destinationCases(Destination);
			expect(metadata.keys).toEqual(['addItem', 'editItem']);
			expect(metadata.routes.addItem).toBe(addItemReducer);
			expect(metadata.routes.editItem).toBe(editItemReducer);
		});

		it('rejects non-function own entries at construction naming the offending case', () => {
			expect(() =>
				createDestination({
					addItem: addItemReducer,
					invalidCase: 42 as any
				})
			).toThrow(TypeError);

			expect(() =>
				createDestination({
					addItem: addItemReducer,
					invalidCase: 42 as any
				})
			).toThrow(/invalidCase/);

			expect(() =>
				createDestination({
					nullCase: null as any
				})
			).toThrow(/nullCase/);

			expect(() =>
				createDestination({
					objectCase: {} as any
				})
			).toThrow(/objectCase/);
		});

		it('ignores inherited non-reserved keys and fails closed on action/state named toString without calling Object.prototype.toString', () => {
			// Inherited non-reserved keys are ignored
			const inheritedProto = {
				inheritedKey: addItemReducer
			};
			const ownMap = Object.create(inheritedProto);
			ownMap.addItem = addItemReducer;

			const Destination = createDestination(ownMap);
			const metadata = destinationCases(Destination);
			expect(metadata.keys).toEqual(['addItem']);
			expect(metadata.routes.inheritedKey).toBeUndefined();
			expect(Destination.is({ type: 'inheritedKey', action: { type: 'any' } }, 'inheritedKey')).toBe(false);

			// State/action with type 'toString' against a destination without 'toString' case
			const toStringSpy = vi.spyOn(Object.prototype, 'toString');
			try {
				const state = { type: 'toString', state: { value: 123 } } as any;
				const action = { type: 'toString', action: { type: 'action' } } as any;

				const [outState, outEffect] = Destination.reducer(state, action, {});
				expect(outState).toBe(state);
				expect(outEffect._tag).toBe('None');
				expect(toStringSpy).not.toHaveBeenCalled();
			} finally {
				toStringSpy.mockRestore();
			}
		});

		it('ensures unsafe reassignment of Destination.reducer does not change metadata.reducer', () => {
			const Destination = createDestination({
				addItem: addItemReducer,
				editItem: editItemReducer
			});

			const originalReducer = Destination.reducer;
			const meta1 = destinationCases(Destination);
			expect(meta1.reducer).toBe(originalReducer);

			// Unsafe reassignment
			const replacementReducer: Reducer<any, any, any> = (s) => [s, Effect.none()];
			(Destination as any).reducer = replacementReducer;

			expect(Destination.reducer).toBe(replacementReducer);
			const meta2 = destinationCases(Destination);
			expect(meta2.reducer).toBe(originalReducer);
			expect(meta2.reducer).not.toBe(replacementReducer);
		});

		it('does not expose destination metadata through runtime barrels', () => {
			for (const mod of [navigationExports, applicationExports, rootExports]) {
				expect('registerDestinationCases' in mod).toBe(false);
				expect('destinationCases' in mod).toBe(false);
				expect('isDestinationReducer' in mod).toBe(false);
			}
		});
	});
});
