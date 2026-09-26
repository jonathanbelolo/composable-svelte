/**
 * Public-declaration twin of `managed-dependency-extension.types.ts`, resolved
 * through the package exports (the built `dist/*.d.ts` a consumer installs) and
 * emitted as declarations, so every exported composition type stays nameable.
 */
import { Effect, createStore, type Reducer } from '@composable-svelte/core';
import { createTestStore } from '@composable-svelte/core/test';
import { ManagedIntegrationBuilder, defineApplication, keyedSlot, optionalSlot, type ManagedComposition } from '@composable-svelte/core/application';
import type { PresentationAction } from '@composable-svelte/core/navigation';

interface ClockDeps { now(): number }
export interface AppDeps extends ClockDeps { fetchRows(signal?: AbortSignal): Promise<readonly number[]> }
interface RowsOnly { fetchRows(signal?: AbortSignal): Promise<readonly number[]> }

export type Leaf = { at: number };
export type LeafAction = { type: 'stamp' };
export type Panel = { leaf: Leaf | null };
export type PanelAction = { type: 'leaf'; action: PresentationAction<LeafAction> };
export type State = { panel: Panel | null; rows: { id: number; state: Panel }[]; loaded: readonly number[] };
export type Action =
	| { type: 'panel'; action: PresentationAction<PanelAction> }
	| { type: 'rows'; id: number; action: PanelAction }
	| { type: 'load' }
	| { type: 'loaded'; rows: readonly number[] };

const leafSlot = optionalSlot<Panel, PanelAction>()('leaf');
const panelSlot = optionalSlot<State, Action>()('panel');
const rowSlot = keyedSlot<State, Action>()('rows');
const initialState: State = { panel: null, rows: [], loaded: [] };

const leaf: Reducer<Leaf, LeafAction, ClockDeps> = (_state, _action, deps) => [{ at: deps.now() }, Effect.none()];
const panelCore: Reducer<Panel, PanelAction, ClockDeps> = (state) => [state, Effect.none()];
export const panel = new ManagedIntegrationBuilder(panelCore).with(leafSlot, leaf).build();
const appCore: Reducer<State, Action, AppDeps> = (state, action, deps) => {
	if (action.type === 'loaded') return [{ ...state, loaded: action.rows }, Effect.none()];
	if (action.type === 'load')
		return [state, Effect.run<Action>(async (dispatch) => dispatch({ type: 'loaded', rows: await deps.fetchRows() }))];
	return [state, Effect.none()];
};

// Positive: a clock-only child composition under an application that also injects fetchRows.
export const app = new ManagedIntegrationBuilder(appCore).with(panelSlot, panel).forEach(rowSlot, panel).build();
export const typed: ManagedComposition<State, Action, AppDeps> = app;
declare const appDeps: AppDeps;
export const store = createStore({ initialState, reducer: app.reducer, execution: app.execution, dependencies: appDeps });
export const testStore = createTestStore({ initialState, reducer: app.reducer, execution: app.execution, dependencies: appDeps });
export const application = defineApplication(app, {
	initialState: (): State => initialState,
	startup: (state, deps) => {
		const fetchRows: AppDeps['fetchRows'] = deps.fetchRows;
		void fetchRows;
		return state.loaded.length === 0 ? { type: 'load' } : undefined;
	}
});

// Negatives: required dependencies and the reverse direction stay rejected.
// @ts-expect-error fetchRows is required by the parent reducer
export const narrowed: ManagedComposition<State, Action, ClockDeps> = app;
declare const clockOnly: ClockDeps;
// @ts-expect-error a store over the extended composition needs the extended dependencies
createStore({ initialState, reducer: app.reducer, execution: app.execution, dependencies: clockOnly });
const rowsCore: Reducer<State, Action, RowsOnly> = (state) => [state, Effect.none()];
// @ts-expect-error the child composition needs now(), which RowsOnly does not supply
new ManagedIntegrationBuilder(rowsCore).with(panelSlot, panel);
const widePanelCore: Reducer<Panel, PanelAction, AppDeps> = (state) => [state, Effect.none()];
const widePanel = new ManagedIntegrationBuilder(widePanelCore).with(leafSlot, leaf).build();
const clockCore: Reducer<State, Action, ClockDeps> = (state) => [state, Effect.none()];
// @ts-expect-error the child composition needs fetchRows(), which a clock-only parent does not supply
new ManagedIntegrationBuilder(clockCore).with(panelSlot, widePanel);
// @ts-expect-error the keyed child composition needs fetchRows() as well
new ManagedIntegrationBuilder(clockCore).forEach(rowSlot, widePanel);
