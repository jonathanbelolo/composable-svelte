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
import { ifLetPresentation } from '../../src/lib/navigation/if-let.js';
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

describe('dismissal cancels the presentation (N8, C6)', () => {
	it('dismiss, then reopen the same case: the first save never lands, the second does', async () => {
		// R1 closed N8 on the case name: a save whose case had changed was
		// dropped, but a reopened addItem received the previous addItem's
		// save. The presentation's group is cancelled on dismiss now.
		const store = makeStore();
		store.dispatch({ type: 'addButtonTapped' });
		store.dispatch({ type: 'destination', action: { type: 'presented', action: { type: 'addItem', action: { type: 'saveButtonTapped' } } } });
		const releaseFirst = releaseSave;

		store.dispatch({ type: 'destination', action: { type: 'dismiss' } });
		store.dispatch({ type: 'addButtonTapped' });
		expect(store.state.destination).toEqual({ type: 'addItem', state: { name: '', saved: false } });

		releaseFirst();
		await tick();
		expect(store.state.destination).toEqual({ type: 'addItem', state: { name: '', saved: false } });

		store.dispatch({ type: 'destination', action: { type: 'presented', action: { type: 'addItem', action: { type: 'saveButtonTapped' } } } });
		releaseSave();
		await tick();
		expect(store.state.destination).toEqual({ type: 'addItem', state: { name: '', saved: true } });
		store.destroy();
	});

	it('the parent nulling the field cancels the same way', async () => {
		type State = AppState & { closed: number };
		type Action = AppAction | { type: 'closeTapped' };
		const closing: Reducer<State, Action> = (state, action) => {
			if (action.type === 'closeTapped') return [{ ...state, destination: null, closed: state.closed + 1 }, Effect.none()];
			const [next, effect] = core(state, action as AppAction, undefined);
			return [{ ...next, closed: state.closed }, effect as ReturnType<Reducer<State, Action>>[1]];
		};
		const store = createStore<State, Action>({
			initialState: { destination: null, modal: { open: false }, observed: [], closed: 0 },
			reducer: integrate(closing).with('destination', Destination.reducer).build(),
			dependencies: {}
		});
		store.dispatch({ type: 'addButtonTapped' });
		store.dispatch({ type: 'destination', action: { type: 'presented', action: { type: 'addItem', action: { type: 'saveButtonTapped' } } } });
		const release = releaseSave;
		store.dispatch({ type: 'closeTapped' });
		store.dispatch({ type: 'addButtonTapped' });

		release();
		await tick();
		expect(store.state.destination).toEqual({ type: 'addItem', state: { name: '', saved: false } });
		store.destroy();
	});

	it('a fixed-id Effect.cancel still works inside a presentation, and two concurrent effects both complete', async () => {
		type Child = { hits: number };
		type ChildAction = { type: 'go' } | { type: 'stop' } | { type: 'hit' };
		let release: () => void = () => {};
		const child: Reducer<Child, ChildAction> = (state, action) => {
			switch (action.type) {
				case 'go':
					return [
						state,
						Effect.batch(
							Effect.cancellable<ChildAction>('work', async (dispatch) => {
								await new Promise<void>((r) => {
									release = r;
								});
								dispatch({ type: 'hit' });
							}),
							Effect.run<ChildAction>(async (dispatch) => dispatch({ type: 'hit' }))
						)
					];
				case 'stop':
					return [state, Effect.cancel('work')];
				case 'hit':
					return [{ hits: state.hits + 1 }, Effect.none()];
			}
		};
		type S = { child: Child | null };
		type A = { type: 'child'; action: PresentationAction<ChildAction> };
		const store = createStore<S, A>({
			initialState: { child: { hits: 0 } },
			reducer: integrate<S, A>().with('child', child).build(),
			dependencies: {}
		});
		store.dispatch({ type: 'child', action: { type: 'presented', action: { type: 'go' } } });
		await tick();
		expect(store.state.child?.hits).toBe(1); // the plain run landed
		store.dispatch({ type: 'child', action: { type: 'presented', action: { type: 'stop' } } });
		release();
		await tick();
		expect(store.state.child?.hits).toBe(1); // the cancellable did not
		store.destroy();
	});

	it('a subscription set up by the child is cleaned up on dismiss', () => {
		const cleanup = vi.fn();
		type Child = { on: boolean };
		type ChildAction = { type: 'listen' };
		const child: Reducer<Child, ChildAction> = (state) => [state, Effect.subscription<ChildAction>('feed', () => cleanup)];
		type S = { child: Child | null };
		type A = { type: 'child'; action: PresentationAction<ChildAction> };
		const store = createStore<S, A>({
			initialState: { child: { on: true } },
			reducer: integrate<S, A>().with('child', child).build(),
			dependencies: {}
		});
		store.dispatch({ type: 'child', action: { type: 'presented', action: { type: 'listen' } } });
		expect(cleanup).not.toHaveBeenCalled();
		store.dispatch({ type: 'child', action: { type: 'dismiss' } });
		expect(cleanup).toHaveBeenCalledTimes(1);
		store.destroy();
	});

	it("a nested presentation's effects sit beneath the outer one: dismissing the outer cancels the inner", async () => {
		type Inner = { n: number };
		type InnerAction = { type: 'go' } | { type: 'done' };
		let release: () => void = () => {};
		const inner: Reducer<Inner, InnerAction> = (state, action) =>
			action.type === 'go'
				? [
						state,
						Effect.run<InnerAction>(async (dispatch) => {
							await new Promise<void>((r) => {
								release = r;
							});
							dispatch({ type: 'done' });
						})
					]
				: [{ n: state.n + 1 }, Effect.none()];
		type Features = { destination: Inner | null };
		type FeaturesAction = { type: 'destination'; action: PresentationAction<InnerAction> };
		const features = integrate<Features, FeaturesAction>().with('destination', inner).build();
		type S = { features: Features | null };
		type A = { type: 'features'; action: PresentationAction<FeaturesAction> } | { type: 'closeFeatures' };
		const root: Reducer<S, A> = (state, action) => (action.type === 'closeFeatures' ? [{ features: null }, Effect.none()] : [state, Effect.none()]);
		const store = createStore<S, A>({
			initialState: { features: { destination: { n: 0 } } },
			reducer: integrate(root).with('features', features).build(),
			dependencies: {}
		});

		store.dispatch({ type: 'features', action: { type: 'presented', action: { type: 'destination', action: { type: 'presented', action: { type: 'go' } } } } });
		store.dispatch({ type: 'closeFeatures' });
		store.dispatch({ type: 'features', action: { type: 'presented', action: { type: 'destination', action: { type: 'presented', action: { type: 'go' } } } } });
		release();
		await tick();
		expect(store.state.features).toBeNull();
		store.destroy();
	});

	it("product-gallery's shape: a direct ifLetPresentation dismiss cancels too", async () => {
		type Child = { saved: boolean };
		type ChildAction = { type: 'save' } | { type: 'saved' };
		let release: () => void = () => {};
		const child: Reducer<Child, ChildAction> = (state, action) =>
			action.type === 'save'
				? [
						state,
						Effect.run<ChildAction>(async (dispatch) => {
							await new Promise<void>((r) => {
								release = r;
							});
							dispatch({ type: 'saved' });
						})
					]
				: [{ saved: true }, Effect.none()];
		type S = { child: Child | null };
		type A = { type: 'open' } | { type: 'child'; action: PresentationAction<ChildAction> };
		const reducer: Reducer<S, A> = (state, action) => {
			if (action.type === 'open') return [{ child: { saved: false } }, Effect.none()];
			return ifLetPresentation<S, A, Child, ChildAction, 'child'>(
				(s) => s.child,
				(s, c) => ({ ...s, child: c }),
				'child',
				(ca) => ({ type: 'child', action: { type: 'presented', action: ca } }),
				child
			)(state, action, undefined);
		};
		const store = createStore<S, A>({ initialState: { child: { saved: false } }, reducer, dependencies: {} });
		store.dispatch({ type: 'child', action: { type: 'presented', action: { type: 'save' } } });
		store.dispatch({ type: 'child', action: { type: 'dismiss' } });
		store.dispatch({ type: 'open' });
		release();
		await tick();
		expect(store.state.child).toEqual({ saved: false });
		store.destroy();
	});
});
