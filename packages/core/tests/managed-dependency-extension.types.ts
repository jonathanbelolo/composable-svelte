/**
 * A managed composition nests under a parent whose dependencies extend its own.
 * Every dependency a child needs is still required: a parent that lacks one, a
 * child that needs more than its parent supplies, and a store built without the
 * parent's extra services all stay rejected. No any, casts or explicit type
 * arguments: the parent's dependency type is inferred from its reducer.
 */
import { ManagedIntegrationBuilder, keyedSlot, optionalSlot, type ManagedComposition } from '../src/lib/navigation/managed-integration.js';
import { defineApplication } from '../src/lib/application/definition.js';
import { createStore } from '../src/lib/store.svelte.js';
import { createTestStore } from '../src/lib/test/test-store.js';
import { Effect } from '../src/lib/effect.js';
import type { Reducer } from '../src/lib/types.js';
import type { PresentationAction } from '../src/lib/navigation/types.js';

interface ClockDeps { now(): number }
interface AppDeps extends ClockDeps { fetchRows(signal?: AbortSignal): Promise<readonly number[]> }
interface RowsOnly { fetchRows(signal?: AbortSignal): Promise<readonly number[]> }

type Leaf = { at: number };
type LeafAction = { type: 'stamp' };
type Panel = { leaf: Leaf | null };
type PanelAction = { type: 'leaf'; action: PresentationAction<LeafAction> };
type State = { panel: Panel | null; rows: { id: number; state: Panel }[]; loaded: readonly number[] };
type Action =
	| { type: 'panel'; action: PresentationAction<PanelAction> }
	| { type: 'rows'; id: number; action: PanelAction }
	| { type: 'load' }
	| { type: 'loaded'; rows: readonly number[] };

const leafSlot = optionalSlot<Panel, PanelAction>()('leaf');
const panelSlot = optionalSlot<State, Action>()('panel');
const rowSlot = keyedSlot<State, Action>()('rows');
const initialState: State = { panel: null, rows: [], loaded: [] };

// The child composition needs only a clock.
const leaf: Reducer<Leaf, LeafAction, ClockDeps> = (_state, _action, deps) => [{ at: deps.now() }, Effect.none()];
const panelCore: Reducer<Panel, PanelAction, ClockDeps> = (state) => [state, Effect.none()];
const panel = new ManagedIntegrationBuilder(panelCore).with(leafSlot, leaf).build();

// The application also injects its own service.
const appCore: Reducer<State, Action, AppDeps> = (state, action, deps) => {
	if (action.type === 'loaded') return [{ ...state, loaded: action.rows }, Effect.none()];
	if (action.type === 'load')
		return [state, Effect.run<Action>(async (dispatch) => dispatch({ type: 'loaded', rows: await deps.fetchRows() }))];
	return [state, Effect.none()];
};

// Positive: optional and keyed slots accept the narrower child; policies see the parent's dependencies.
export const app = new ManagedIntegrationBuilder(appCore)
	.with(panelSlot, panel, {
		startup: (_panel, deps) => {
			const fetchRows: AppDeps['fetchRows'] = deps.fetchRows;
			void fetchRows;
			return undefined;
		}
	})
	.forEach(rowSlot, panel)
	.build();
export const typed: ManagedComposition<State, Action, AppDeps> = app;
declare const appDeps: AppDeps;
export const store = createStore({ initialState, ...app, dependencies: appDeps });
export const testStore = createTestStore({ initialState, reducer: app.reducer, execution: app.execution, dependencies: appDeps });
export const application = defineApplication(app, {
	initialState: (): State => initialState,
	startup: (state, deps) => {
		const fetchRows: AppDeps['fetchRows'] = deps.fetchRows;
		void fetchRows;
		return state.loaded.length === 0 ? { type: 'load' } : undefined;
	}
});

// Negative: the composed application requires its extra service; it is not a clock-only composition.
// @ts-expect-error fetchRows is required by the parent reducer
export const narrowed: ManagedComposition<State, Action, ClockDeps> = app;
declare const clockOnly: ClockDeps;
// @ts-expect-error a store over the extended composition needs the extended dependencies
createStore({ initialState, reducer: app.reducer, execution: app.execution, dependencies: clockOnly });

// Negative: a parent that lacks a dependency the child needs.
const rowsCore: Reducer<State, Action, RowsOnly> = (state) => [state, Effect.none()];
// @ts-expect-error the child composition needs now(), which RowsOnly does not supply
new ManagedIntegrationBuilder(rowsCore).with(panelSlot, panel);
// @ts-expect-error the keyed child composition needs now() as well
new ManagedIntegrationBuilder(rowsCore).forEach(rowSlot, panel);

// Negative: the reverse direction. A child needing more than its parent supplies.
const widePanelCore: Reducer<Panel, PanelAction, AppDeps> = (state) => [state, Effect.none()];
const widePanel = new ManagedIntegrationBuilder(widePanelCore).with(leafSlot, leaf).build();
const clockCore: Reducer<State, Action, ClockDeps> = (state) => [state, Effect.none()];
// @ts-expect-error the child composition needs fetchRows(), which a clock-only parent does not supply
new ManagedIntegrationBuilder(clockCore).with(panelSlot, widePanel);
// @ts-expect-error the keyed child composition needs fetchRows() as well
new ManagedIntegrationBuilder(clockCore).forEach(rowSlot, widePanel);
