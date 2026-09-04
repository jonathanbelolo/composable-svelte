/**
 * The navigation DSL, end to end: `createDestination` → `integrate().with()` →
 * a real store → `scopeTo().case().dispatch()`.
 *
 * Nothing in this directory drove that chain before this file. Each layer was
 * tested against its own idea of the destination action's shape, and the
 * three ideas disagreed: `scopeTo().case()` wrapped the case in one
 * `presented`, `ifLetPresentation` stripped it, and `createDestination`'s
 * reducer expected a second one and read `action.action.action` — so a child
 * reducer received `undefined` (N1). The same reducer returned the child's
 * effect unmapped, so an async child's result never came back to it (N2).
 * `.case().dismiss()` named the case, which `ifLetPresentation` does not
 * recognise, so the field was never cleared. AUDIT-2026-09-03-FINDINGS N1, N2.
 *
 * `TestStore` has no `Store` surface for `scopeTo`, so this uses `createStore`
 * and `vi.waitFor`, as store.test.ts does.
 */

import { describe, it, expect, vi } from 'vitest';
import { createStore } from '../../src/lib/store.svelte.js';
import { Effect } from '../../src/lib/effect.js';
import type { Reducer } from '../../src/lib/types.js';
import { createDestination } from '../../src/lib/navigation/destination.js';
import { integrate } from '../../src/lib/navigation/integrate.js';
import { scopeTo } from '../../src/lib/navigation/scope.js';
import type { PresentationAction } from '../../src/lib/navigation/types.js';

// ---------------------------------------------------------------------------
// Children

interface AddItemState {
	name: string;
	saved: boolean;
}
type AddItemAction = { type: 'nameChanged'; value: string } | { type: 'saveButtonTapped' } | { type: 'saved' };

/** Released by the test, so the save can settle after the case has changed. */
let releaseSave: () => void = () => {};

const addItemReducer: Reducer<AddItemState, AddItemAction> = (state, action) => {
	switch (action.type) {
		case 'nameChanged':
			return [{ ...state, name: action.value }, Effect.none()];
		case 'saveButtonTapped':
			return [
				state,
				Effect.run(async (dispatch) => {
					await new Promise<void>((resolve) => {
						releaseSave = resolve;
					});
					dispatch({ type: 'saved' });
				})
			];
		case 'saved':
			return [{ ...state, saved: true }, Effect.none()];
	}
};

interface EditItemState {
	id: string;
	/** Also handles `saved`, so a misrouted addItem effect would be visible here. */
	savedCount: number;
}
type EditItemAction = { type: 'saved' } | { type: 'nameChanged'; value: string };

const editItemReducer: Reducer<EditItemState, EditItemAction> = (state, action) => {
	switch (action.type) {
		case 'saved':
			return [{ ...state, savedCount: state.savedCount + 1 }, Effect.none()];
		default:
			return [state, Effect.none()];
	}
};

const Destination = createDestination({ addItem: addItemReducer, editItem: editItemReducer });
type DestinationState = typeof Destination._types.State;
type DestinationAction = typeof Destination._types.Action;

// A plain optional child, for the positive control.
interface ModalState {
	open: boolean;
}
type ModalAction = { type: 'toggled' };
const modalReducer: Reducer<ModalState, ModalAction> = (state, action) =>
	action.type === 'toggled' ? [{ open: !state.open }, Effect.none()] : [state, Effect.none()];

// ---------------------------------------------------------------------------
// Parent

interface AppState {
	destination: DestinationState | null;
	modal: ModalState | null;
	/** What the parent saw through `Destination.is(action.action, …)`, per destination action. */
	observed: boolean[];
}

type AppAction =
	| { type: 'addButtonTapped' }
	| { type: 'editButtonTapped' }
	| { type: 'destination'; action: PresentationAction<DestinationAction> }
	| { type: 'modal'; action: PresentationAction<ModalAction> };

const core: Reducer<AppState, AppAction> = (state, action) => {
	switch (action.type) {
		case 'addButtonTapped':
			return [
				{ ...state, destination: Destination.initial('addItem', { name: '', saved: false }) },
				Effect.none()
			];
		case 'editButtonTapped':
			return [
				{ ...state, destination: Destination.initial('editItem', { id: '1', savedCount: 0 }) },
				Effect.none()
			];
		case 'destination':
			return [
				{ ...state, observed: [...state.observed, Destination.is(action.action, 'addItem.nameChanged')] },
				Effect.none()
			];
		default:
			return [state, Effect.none()];
	}
};

const reducer = integrate(core).with('destination', Destination.reducer).with('modal', modalReducer).build();

function makeStore() {
	return createStore<AppState, AppAction>({
		initialState: { destination: null, modal: { open: false }, observed: [] },
		reducer,
		dependencies: {}
	});
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

// ---------------------------------------------------------------------------

describe('the navigation DSL end to end', () => {
	it('a child action dispatched through scopeTo().case() reaches the child reducer', () => {
		const store = makeStore();
		store.dispatch({ type: 'addButtonTapped' });

		const scoped = scopeTo(store).into('destination').case('addItem');
		expect(scoped).not.toBeNull();
		scoped!.dispatch({ type: 'nameChanged', value: 'Milk' });

		expect(store.state.destination).toEqual({ type: 'addItem', state: { name: 'Milk', saved: false } });
	});

	it('.dismiss() clears the field', () => {
		const store = makeStore();
		store.dispatch({ type: 'addButtonTapped' });

		scopeTo(store).into('destination').case('addItem')!.dismiss();

		expect(store.state.destination).toBeNull();
	});

	it("a child effect's dispatch lands back in the child", async () => {
		const store = makeStore();
		store.dispatch({ type: 'addButtonTapped' });

		scopeTo(store).into('destination').case('addItem')!.dispatch({ type: 'saveButtonTapped' });
		releaseSave();

		await vi.waitFor(() => {
			expect(Destination.extract(store.state.destination, 'addItem')?.saved).toBe(true);
		});
	});

	it('an effect whose case is gone when it settles is dropped', async () => {
		const store = makeStore();
		store.dispatch({ type: 'addButtonTapped' });
		scopeTo(store).into('destination').case('addItem')!.dispatch({ type: 'saveButtonTapped' });

		// The case changes while the save is in flight.
		store.dispatch({ type: 'editButtonTapped' });
		releaseSave();
		await tick();

		expect(store.state.destination).toEqual({ type: 'editItem', state: { id: '1', savedCount: 0 } });
	});

	it('the parent observes the child action through Destination.is on action.action', () => {
		const store = makeStore();
		store.dispatch({ type: 'addButtonTapped' });
		const scoped = scopeTo(store).into('destination').case('addItem')!;

		scoped.dispatch({ type: 'nameChanged', value: 'Milk' });
		scoped.dispatch({ type: 'saveButtonTapped' });
		releaseSave();

		expect(store.state.observed).toEqual([true, false]);
	});

	it('positive control: the same path through .optional() with a plain child', () => {
		// Without this, the assertions above could pass against a store that
		// swallowed every scoped dispatch.
		const store = makeStore();

		scopeTo(store).into('modal').optional()!.dispatch({ type: 'toggled' });
		expect(store.state.modal).toEqual({ open: true });

		scopeTo(store).into('modal').optional()!.dismiss();
		expect(store.state.modal).toBeNull();
	});
});
