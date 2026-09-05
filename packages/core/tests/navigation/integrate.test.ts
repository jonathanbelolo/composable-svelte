/**
 * Tests for integrate() fluent builder API.
 *
 * These tests verify that the integration DSL correctly composes child reducers
 * with automatic PresentationAction handling and effect batching.
 */

import { describe, it, expect } from 'vitest';
import { integrate } from '../../src/lib/navigation/integrate.js';
import { createDestination } from '../../src/lib/navigation/destination.js';
import type { Reducer } from '../../src/lib/types.js';
import { Effect } from '../../src/lib/effect.js';
import type { PresentationAction } from '../../src/lib/navigation/types.js';

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
	| { type: 'saveButtonTapped' }
	// The save effect dispatches this, so it belongs in the union. Without it
	// the reducer emitted an action outside its own action type and the
	// exhaustiveness check below was checking a union that did not describe
	// what the reducer actually produces.
	| { type: 'saved' };

const addItemReducer: Reducer<AddItemState, AddItemAction> = (state, action) => {
	switch (action.type) {
		case 'nameChanged':
			return [{ ...state, name: action.value }, Effect.none()];
		case 'quantityChanged':
			return [{ ...state, quantity: action.value }, Effect.none()];
		case 'saveButtonTapped':
			return [state, Effect.run(async (dispatch) => dispatch({ type: 'saved' as const }))];
		case 'saved':
			return [state, Effect.none()];
		default:
			const _exhaustive: never = action;
			return [state, Effect.none()];
	}
};

// Child State & Action (Alert feature)
interface AlertState {
	message: string;
}

type AlertAction = { type: 'okButtonTapped' } | { type: 'confirmed' };

const alertReducer: Reducer<AlertState, AlertAction> = (state, action) => {
	switch (action.type) {
		case 'okButtonTapped':
			return [state, Effect.run(async (dispatch) => dispatch({ type: 'confirmed' as const }))];
		case 'confirmed':
			return [state, Effect.none()];
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
			// The presentation's effects are cancelled with it (N8, C6).
			expect(effect).toEqual({ _tag: 'CancelGroup', group: 'destination' });
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

			// A wrapper reducer must forward its dependencies; dropping them left
			// the wrapped reducer receiving `undefined` for `deps`.
			const child1Reducer: Reducer<AddItemState, AddItemAction> = (state, action, deps) => {
				executionOrder.push('child1');
				return addItemReducer(state, action, deps);
			};

			const child2Reducer: Reducer<AlertState, AlertAction> = (state, action, deps) => {
				executionOrder.push('child2');
				return alertReducer(state, action, deps);
			};

			const trackedCoreReducer: Reducer<ParentState, ParentAction> = (state, action, deps) => {
				executionOrder.push('core');
				return coreReducer(state, action, deps);
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

			// The child first, then core; child2 is skipped (wrong action type).
			// Core ran first once, and so observed the child's state from before
			// the action (N14).
			expect(executionOrder).toEqual(['child1', 'core']);
		});

		it("core observes the child's reduced state", () => {
			interface S {
				destination: AddItemState | null;
				lastName: string;
			}
			type A = { type: 'destination'; action: PresentationAction<AddItemAction> };
			const core: Reducer<S, A> = (state, action) =>
				action.type === 'destination'
					? [{ ...state, lastName: state.destination?.name ?? '' }, Effect.none()]
					: [state, Effect.none()];
			const reducer = integrate(core).with('destination', addItemReducer).build();

			const [after] = reducer(
				{ destination: { name: 'Test', quantity: 0 }, lastName: '' },
				{ type: 'destination', action: { type: 'presented', action: { type: 'nameChanged', value: 'New' } } },
				{}
			);

			// Core-first would have copied 'Test'.
			expect(after.lastName).toBe('New');
		});

		it("the child's effect survives core clearing the field on the same action", () => {
			interface S {
				destination: AddItemState | null;
			}
			type A = { type: 'destination'; action: PresentationAction<AddItemAction> };
			const core: Reducer<S, A> = (state, action) =>
				action.type === 'destination' &&
				action.action.type === 'presented' &&
				action.action.action.type === 'saveButtonTapped'
					? [{ ...state, destination: null }, Effect.none()]
					: [state, Effect.none()];
			const reducer = integrate(core).with('destination', addItemReducer).build();

			const [after, effect] = reducer(
				{ destination: { name: 'Test', quantity: 0 } },
				{ type: 'destination', action: { type: 'presented', action: { type: 'saveButtonTapped' } } },
				{}
			);

			// Core still clears the field, and the child still produced its save
			// effect; core-first handed ifLetPresentation a null and the child
			// never ran. The presentation's cancel follows it (N8, C6): an effect
			// the dismissing action itself registered is cancelled with the rest,
			// so a parent that dismisses on save performs the save itself.
			expect(after.destination).toBeNull();
			if (effect._tag !== 'Batch') throw new Error('expected the child effect and the cancel');
			expect(effect.effects.map((e) => e._tag)).toEqual(['Run', 'CancelGroup']);
			expect(effect.effects[1]).toEqual({ _tag: 'CancelGroup', group: 'destination' });
		});
	});

	describe('.forEach() ordering', () => {
		interface Item {
			id: string;
			state: AddItemState;
		}
		interface S {
			items: Item[];
			lastName: string;
		}
		type A = { type: 'items'; id: string; action: AddItemAction } | { type: 'noop' };
		const initial: S = { items: [{ id: 'a', state: { name: 'Test', quantity: 0 } }], lastName: '' };

		it("core observes the element's reduced state", () => {
			const core: Reducer<S, A> = (state, action) =>
				action.type === 'items'
					? [{ ...state, lastName: state.items[0]?.state.name ?? '' }, Effect.none()]
					: [state, Effect.none()];
			const reducer = integrate(core)
				.forEach('items', (s) => s.items, (s, items) => ({ ...s, items }), addItemReducer)
				.build();

			const [after] = reducer(initial, { type: 'items', id: 'a', action: { type: 'nameChanged', value: 'New' } }, {});

			expect(after.lastName).toBe('New');
		});

		it("the element's effect survives core removing it on the same action", () => {
			const core: Reducer<S, A> = (state, action) =>
				action.type === 'items' && action.action.type === 'saveButtonTapped'
					? [{ ...state, items: [] }, Effect.none()]
					: [state, Effect.none()];
			const reducer = integrate(core)
				.forEach('items', (s) => s.items, (s, items) => ({ ...s, items }), addItemReducer)
				.build();

			const [after, effect] = reducer(initial, { type: 'items', id: 'a', action: { type: 'saveButtonTapped' } }, {});

			expect(after.items).toEqual([]);
			// The element's effect, then its group's cancel (N8, C6).
			if (effect._tag !== 'Batch') throw new Error('expected the element effect and the cancel');
			expect(effect.effects.map((e) => e._tag)).toEqual(['Run', 'CancelGroup']);
			expect(effect.effects[1]).toEqual({ _tag: 'CancelGroup', group: 'items/a' });
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
		// Against the real createDestination. The earlier form of this test
		// declared a stub "destination reducer" that returned its state for
		// every action and never dispatched a destination action, so it could
		// not see that the two layers disagreed on the shape (AUDIT N1, N2).
		const Destination = createDestination({ addItem: addItemReducer, alert: alertReducer });
		type DestinationState = typeof Destination._types.State;
		type DestinationAction = typeof Destination._types.Action;

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

		const reducer = integrate(appCoreReducer).with('destination', Destination.reducer).build();
		const initialState: AppState = {
			items: [],
			destination: Destination.initial('addItem', { name: '', quantity: 0 })
		};

		it('leaves the destination alone for a core action', () => {
			const [newState, effect] = reducer(initialState, { type: 'addItem', item: 'Test' }, {});

			expect(newState.items).toEqual(['Test']);
			expect(newState.destination).toBe(initialState.destination);
			expect(effect._tag).toBe('None');
		});

		it('routes a presented case action to the child reducer', () => {
			const [newState] = reducer(
				initialState,
				{
					type: 'destination',
					action: { type: 'presented', action: { type: 'addItem', action: { type: 'nameChanged', value: 'Milk' } } }
				},
				{}
			);

			expect(Destination.extract(newState.destination, 'addItem')).toEqual({ name: 'Milk', quantity: 0 });
		});

		it("wraps the child's effect back into the field, the presented wrapper and the case", async () => {
			const [, effect] = reducer(
				initialState,
				{
					type: 'destination',
					action: { type: 'presented', action: { type: 'addItem', action: { type: 'saveButtonTapped' } } }
				},
				{}
			);
			expect(effect._tag).toBe('Run');

			const dispatched: unknown[] = [];
			await (effect as { execute: (d: (a: unknown) => void) => Promise<void> }).execute((a) => dispatched.push(a));

			expect(dispatched).toEqual([
				{
					type: 'destination',
					action: { type: 'presented', action: { type: 'addItem', action: { type: 'saved' } } }
				}
			]);
		});
	});

	describe('error handling', () => {
		it('throws when registering same field twice', () => {
			const coreReducer: Reducer<ParentState, any> = (state) => [state, Effect.none()];
			const childReducer: Reducer<AddItemState, any> = (state) => [state, Effect.none()];

			expect(() => {
				integrate(coreReducer)
					.with('destination', childReducer)
					.with('destination', childReducer) // ❌ Duplicate!
					.build();
			}).toThrow(/Field 'destination' has already been integrated/);
		});

		it('throws when childReducer is not a function', () => {
			const coreReducer: Reducer<ParentState, any> = (state) => [state, Effect.none()];

			expect(() => {
				integrate(coreReducer)
					.with('destination', null as any)
					.build();
			}).toThrow(/childReducer for field 'destination' must be a function/);
		});

		it('throws when childReducer is undefined', () => {
			const coreReducer: Reducer<ParentState, any> = (state) => [state, Effect.none()];

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

	describe('cancellation on dismissal (N8, C6)', () => {
		// A child's effects belong to the presentation's group, named after
		// the field. A dismiss cancels it in ifLetPresentation; the core
		// reducer nulling the field or changing its case cancels it here, the
		// cancel appended last so an effect the same action registered goes
		// with the rest. A same-case replacement is not a dismissal.
		const groupsOf = (effect: unknown) => (effect as { groups?: readonly string[] }).groups;
		type Core = Reducer<ParentState, ParentAction | { type: 'closeTapped' } | { type: 'reopen' }>;
		const closing: Core = (state, action) => {
			switch (action.type) {
				case 'closeTapped':
					return [{ ...state, destination: null }, Effect.run(async () => {})];
				case 'reopen':
					return [{ ...state, destination: { name: 'again', quantity: 1 } }, Effect.none()];
				default:
					return coreReducer(state, action as ParentAction, {});
			}
		};
		const reducer = integrate<ParentState, ParentAction | { type: 'closeTapped' } | { type: 'reopen' }>(closing)
			.with('destination', addItemReducer)
			.build();
		const presented: ParentState = { count: 0, destination: { name: 'Test', quantity: 5 }, alert: null };

		it("a child's effect belongs to the field's group", () => {
			const [, effect] = reducer(
				presented,
				{ type: 'destination', action: { type: 'presented', action: { type: 'saveButtonTapped' } } },
				{}
			);
			expect(effect._tag).toBe('Run');
			expect(groupsOf(effect)).toEqual(['destination']);
		});

		it('the core reducer nulling the field cancels the group, after its own effect', () => {
			const [state, effect] = reducer(presented, { type: 'closeTapped' }, {});
			expect(state.destination).toBeNull();
			expect(effect._tag).toBe('Batch');
			if (effect._tag !== 'Batch') throw new Error('unreachable');
			expect(effect.effects.map((e) => e._tag)).toEqual(['Run', 'CancelGroup']);
			expect(effect.effects.at(-1)).toEqual({ _tag: 'CancelGroup', group: 'destination' });
		});

		it('a same-case replacement by the core reducer is not a dismissal', () => {
			const [state, effect] = reducer(presented, { type: 'reopen' }, {});
			expect(state.destination).toEqual({ name: 'again', quantity: 1 });
			expect(effect._tag).toBe('None');
		});

		it('opening from null cancels nothing', () => {
			const [, effect] = reducer({ ...presented, destination: null }, { type: 'addButtonTapped' }, {});
			expect(effect._tag).toBe('None');
		});

		it('a case change by the core reducer cancels the field, and the effect carries the case beneath the field', () => {
			const Destination = createDestination({ addItem: addItemReducer, alert: alertReducer });
			type State = { destination: typeof Destination._types.State | null };
			type Action =
				| { type: 'showAlert' }
				| { type: 'destination'; action: PresentationAction<typeof Destination._types.Action> };
			const core: Reducer<State, Action> = (state, action) =>
				action.type === 'showAlert'
					? [{ destination: Destination.initial('alert', { message: 'hi' }) }, Effect.none()]
					: [state, Effect.none()];
			const r = integrate(core).with('destination', Destination.reducer).build();
			const open: State = { destination: Destination.initial('addItem', { name: 'x', quantity: 1 }) };

			const [, saving] = r(
				open,
				{ type: 'destination', action: { type: 'presented', action: { type: 'addItem', action: { type: 'saveButtonTapped' } } } },
				{}
			);
			expect(groupsOf(saving)).toEqual(['destination/addItem', 'destination']);

			const [changed, effect] = r(open, { type: 'showAlert' }, {});
			expect(changed.destination?.type).toBe('alert');
			expect(effect).toEqual({ _tag: 'CancelGroup', group: 'destination' });
		});

		it('.forEach(): an element the core reducer removes has its group cancelled, last', () => {
			type ItemsState = { items: Array<{ id: string; state: AddItemState }> };
			type ItemsAction = { type: 'items'; id: string; action: AddItemAction } | { type: 'remove'; id: string };
			const r = integrate<ItemsState, ItemsAction>()
				.forEach('items', (s) => s.items, (s, items) => ({ ...s, items }), addItemReducer)
				.reduce((state, action) =>
					action.type === 'remove'
						? [{ items: state.items.filter((item) => item.id !== action.id) }, Effect.run(async () => {})]
						: [state, Effect.none()]
				)
				.build();
			const two: ItemsState = { items: [{ id: 'a', state: { name: '', quantity: 0 } }, { id: 'b', state: { name: '', quantity: 0 } }] };

			const [, saving] = r(two, { type: 'items', id: 'b', action: { type: 'saveButtonTapped' } }, {});
			expect(groupsOf(saving)).toEqual(['items/b']);

			const [after, effect] = r(two, { type: 'remove', id: 'b' }, {});
			expect(after.items.map((i) => i.id)).toEqual(['a']);
			if (effect._tag !== 'Batch') throw new Error('expected a batch');
			expect(effect.effects.map((e) => e._tag)).toEqual(['Run', 'CancelGroup']);
			expect(effect.effects[1]).toEqual({ _tag: 'CancelGroup', group: 'items/b' });
		});
	});
});
