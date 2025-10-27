/**
 * Tests for integrate() fluent builder API.
 *
 * These tests verify that the integration DSL correctly composes child reducers
 * with automatic PresentationAction handling and effect batching.
 */

import { describe, it, expect } from 'vitest';
import { integrate } from '../../src/navigation/integrate.js';
import type { Reducer } from '../../src/types.js';
import { Effect } from '../../src/effect.js';
import type { PresentationAction } from '../../src/navigation/types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

// Child State & Action (AddItem feature)
interface AddItemState {
	name: string;
	quantity: number;
}

type AddItemAction =
	| { type: 'nameChanged'; value: string }
	| { type: 'quantityChanged'; value: number }
	| { type: 'saveButtonTapped' };

const addItemReducer: Reducer<AddItemState, AddItemAction> = (state, action) => {
	switch (action.type) {
		case 'nameChanged':
			return [{ ...state, name: action.value }, Effect.none()];
		case 'quantityChanged':
			return [{ ...state, quantity: action.value }, Effect.none()];
		case 'saveButtonTapped':
			return [state, Effect.run(async (dispatch) => dispatch({ type: 'saved' as const }))];
		default:
			const _exhaustive: never = action;
			return [state, Effect.none()];
	}
};

// Child State & Action (Alert feature)
interface AlertState {
	message: string;
}

type AlertAction = { type: 'okButtonTapped' };

const alertReducer: Reducer<AlertState, AlertAction> = (state, action) => {
	switch (action.type) {
		case 'okButtonTapped':
			return [state, Effect.run(async (dispatch) => dispatch({ type: 'confirmed' as const }))];
		default:
			const _exhaustive: never = action;
			return [state, Effect.none()];
	}
};

// Parent State & Action
interface ParentState {
	count: number;
	destination: AddItemState | null;
	alert: AlertState | null;
}

type ParentAction =
	| { type: 'increment' }
	| { type: 'addButtonTapped' }
	| { type: 'showAlert' }
	| { type: 'destination'; action: PresentationAction<AddItemAction> }
	| { type: 'alert'; action: PresentationAction<AlertAction> };

const coreReducer: Reducer<ParentState, ParentAction> = (state, action) => {
	switch (action.type) {
		case 'increment':
			return [{ ...state, count: state.count + 1 }, Effect.none()];

		case 'addButtonTapped':
			return [{ ...state, destination: { name: '', quantity: 0 } }, Effect.none()];

		case 'showAlert':
			return [{ ...state, alert: { message: 'Test' } }, Effect.none()];

		default:
			return [state, Effect.none()];
	}
};

// ============================================================================
// Tests
// ============================================================================

describe('integrate()', () => {
	describe('basic functionality', () => {
		it('creates an IntegrationBuilder', () => {
			const builder = integrate(coreReducer);
			expect(builder).toBeDefined();
			expect(typeof builder.with).toBe('function');
			expect(typeof builder.build).toBe('function');
		});

		it('builds a reducer when no children integrated', () => {
			const reducer = integrate(coreReducer).build();

			const initialState: ParentState = {
				count: 0,
				destination: null,
				alert: null
			};

			const [newState, effect] = reducer(initialState, { type: 'increment' }, {});

			expect(newState.count).toBe(1);
			expect(effect._tag).toBe('None');
		});
	});

	describe('single child integration', () => {
		it('integrates a single child reducer', () => {
			const reducer = integrate(coreReducer).with('destination', addItemReducer).build();

			const initialState: ParentState = {
				count: 0,
				destination: { name: 'Test', quantity: 5 },
				alert: null
			};

			const action: ParentAction = {
				type: 'destination',
				action: { type: 'presented', action: { type: 'nameChanged', value: 'New Name' } }
			};

			const [newState, effect] = reducer(initialState, action, {});

			expect(newState.destination?.name).toBe('New Name');
			expect(newState.destination?.quantity).toBe(5);
			expect(effect._tag).toBe('None');
		});

		it('handles core actions', () => {
			const reducer = integrate(coreReducer).with('destination', addItemReducer).build();

			const initialState: ParentState = {
				count: 0,
				destination: null,
				alert: null
			};

			const [newState, effect] = reducer(initialState, { type: 'increment' }, {});

			expect(newState.count).toBe(1);
			expect(effect._tag).toBe('None');
		});

		it('handles dismiss action', () => {
			const reducer = integrate(coreReducer).with('destination', addItemReducer).build();

			const initialState: ParentState = {
				count: 0,
				destination: { name: 'Test', quantity: 5 },
				alert: null
			};

			const action: ParentAction = {
				type: 'destination',
				action: { type: 'dismiss' }
			};

			const [newState, effect] = reducer(initialState, action, {});

			expect(newState.destination).toBeNull();
			expect(effect._tag).toBe('None');
		});

		it('ignores child actions when state is null', () => {
			const reducer = integrate(coreReducer).with('destination', addItemReducer).build();

			const initialState: ParentState = {
				count: 0,
				destination: null,
				alert: null
			};

			const action: ParentAction = {
				type: 'destination',
				action: { type: 'presented', action: { type: 'nameChanged', value: 'Ignored' } }
			};

			const [newState, effect] = reducer(initialState, action, {});

			expect(newState.destination).toBeNull();
			expect(effect._tag).toBe('None');
		});

		it('batches effects from core and child', () => {
			const reducer = integrate(coreReducer).with('destination', addItemReducer).build();

			const initialState: ParentState = {
				count: 0,
				destination: { name: 'Test', quantity: 5 },
				alert: null
			};

			const action: ParentAction = {
				type: 'destination',
				action: { type: 'presented', action: { type: 'saveButtonTapped' } }
			};

			const [newState, effect] = reducer(initialState, action, {});

			// Child reducer produces Run effect, core produces None
			// Effect.batch() optimizes single non-None effects, so we get Run directly
			expect(effect._tag).toBe('Run');
		});
	});

	describe('multiple child integration', () => {
		it('integrates multiple child reducers', () => {
			const reducer = integrate(coreReducer)
				.with('destination', addItemReducer)
				.with('alert', alertReducer)
				.build();

			const initialState: ParentState = {
				count: 0,
				destination: { name: 'Test', quantity: 5 },
				alert: { message: 'Alert' }
			};

			// Test destination child
			const destAction: ParentAction = {
				type: 'destination',
				action: { type: 'presented', action: { type: 'nameChanged', value: 'Updated' } }
			};

			const [state1, effect1] = reducer(initialState, destAction, {});
			expect(state1.destination?.name).toBe('Updated');

			// Test alert child
			const alertAction: ParentAction = {
				type: 'alert',
				action: { type: 'presented', action: { type: 'okButtonTapped' } }
			};

			const [state2, effect2] = reducer(state1, alertAction, {});
			expect(state2.alert?.message).toBe('Alert');
			// Alert produces Run effect, optimized by Effect.batch()
			expect(effect2._tag).toBe('Run');
		});

		it('processes children in order', () => {
			// Reducers that set flags to track execution order
			let executionOrder: string[] = [];

			const child1Reducer: Reducer<AddItemState, AddItemAction> = (state, action) => {
				executionOrder.push('child1');
				return addItemReducer(state, action);
			};

			const child2Reducer: Reducer<AlertState, AlertAction> = (state, action) => {
				executionOrder.push('child2');
				return alertReducer(state, action);
			};

			const trackedCoreReducer: Reducer<ParentState, ParentAction> = (state, action) => {
				executionOrder.push('core');
				return coreReducer(state, action);
			};

			const reducer = integrate(trackedCoreReducer)
				.with('destination', child1Reducer)
				.with('alert', child2Reducer)
				.build();

			const initialState: ParentState = {
				count: 0,
				destination: { name: 'Test', quantity: 5 },
				alert: { message: 'Alert' }
			};

			executionOrder = [];

			const action: ParentAction = {
				type: 'destination',
				action: { type: 'presented', action: { type: 'nameChanged', value: 'New' } }
			};

			reducer(initialState, action, {});

			// Core should run first, then child1, child2 skipped (wrong action type)
			expect(executionOrder).toEqual(['core', 'child1']);
		});
	});

	describe('method chaining', () => {
		it('supports fluent chaining', () => {
			const reducer = integrate(coreReducer)
				.with('destination', addItemReducer)
				.with('alert', alertReducer)
				.build();

			expect(typeof reducer).toBe('function');
		});

		it('returns this from with()', () => {
			const builder = integrate(coreReducer);
			const result = builder.with('destination', addItemReducer);
			expect(result).toBe(builder);
		});
	});

	describe('type safety', () => {
		it('enforces field key type', () => {
			const reducer = integrate(coreReducer)
				// @ts-expect-error - 'invalid' is not a key of ParentState
				.with('invalid', addItemReducer)
				.build();

			// Test still valid at runtime (TypeScript error is compile-time only)
			expect(typeof reducer).toBe('function');
		});

		it('accepts correct field keys', () => {
			// Should compile without errors
			const reducer1 = integrate(coreReducer).with('destination', addItemReducer).build();

			const reducer2 = integrate(coreReducer).with('alert', alertReducer).build();

			expect(typeof reducer1).toBe('function');
			expect(typeof reducer2).toBe('function');
		});
	});

	describe('integration with createDestination', () => {
		it('works with destination reducers', () => {
			// Simulate a destination reducer (would come from createDestination)
			type DestinationState =
				| { type: 'addItem'; state: AddItemState }
				| { type: 'alert'; state: AlertState };

			type DestinationAction =
				| { type: 'addItem'; action: PresentationAction<AddItemAction> }
				| { type: 'alert'; action: PresentationAction<AlertAction> };

			const destinationReducer: Reducer<DestinationState, DestinationAction> = (
				state,
				action
			) => {
				if (action.type === state.type) {
					// Route to correct child (simplified)
					return [state, Effect.none()];
				}
				return [state, Effect.none()];
			};

			interface AppState {
				items: string[];
				destination: DestinationState | null;
			}

			type AppAction =
				| { type: 'addItem'; item: string }
				| { type: 'destination'; action: PresentationAction<DestinationAction> };

			const appCoreReducer: Reducer<AppState, AppAction> = (state, action) => {
				switch (action.type) {
					case 'addItem':
						return [{ ...state, items: [...state.items, action.item] }, Effect.none()];
					default:
						return [state, Effect.none()];
				}
			};

			const reducer = integrate(appCoreReducer).with('destination', destinationReducer).build();

			const initialState: AppState = {
				items: [],
				destination: { type: 'addItem', state: { name: '', quantity: 0 } }
			};

			const [newState, effect] = reducer(initialState, { type: 'addItem', item: 'Test' }, {});

			expect(newState.items).toEqual(['Test']);
			expect(effect._tag).toBe('None');
		});
	});

	describe('error handling', () => {
		it('throws when registering same field twice', () => {
			const coreReducer: Reducer<InventoryState, any> = (state) => [state, Effect.none()];
			const childReducer: Reducer<AddItemState, any> = (state) => [state, Effect.none()];

			expect(() => {
				integrate(coreReducer)
					.with('destination', childReducer)
					.with('destination', childReducer) // ❌ Duplicate!
					.build();
			}).toThrow(/Field 'destination' has already been integrated/);
		});

		it('throws when childReducer is not a function', () => {
			const coreReducer: Reducer<InventoryState, any> = (state) => [state, Effect.none()];

			expect(() => {
				integrate(coreReducer)
					.with('destination', null as any)
					.build();
			}).toThrow(/childReducer for field 'destination' must be a function/);
		});

		it('throws when childReducer is undefined', () => {
			const coreReducer: Reducer<InventoryState, any> = (state) => [state, Effect.none()];

			expect(() => {
				integrate(coreReducer)
					.with('destination', undefined as any)
					.build();
			}).toThrow(/childReducer for field 'destination' must be a function/);
		});

		it('allows multiple different fields', () => {
			interface MultiState {
				destination: AddItemState | null;
				alert: { message: string } | null;
				sheet: { id: string } | null;
			}

			const coreReducer: Reducer<MultiState, any> = (state) => [state, Effect.none()];
			const childReducer: Reducer<any, any> = (state) => [state, Effect.none()];

			// Should not throw - different fields
			expect(() => {
				integrate(coreReducer)
					.with('destination', childReducer)
					.with('alert', childReducer)
					.with('sheet', childReducer)
					.build();
			}).not.toThrow();
		});
	});
});
