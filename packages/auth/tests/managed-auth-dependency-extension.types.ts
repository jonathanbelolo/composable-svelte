/**
 * An application whose dependencies extend `AuthFeatureDependencies` composes
 * `createAuthFeature().composition` directly and injects its own services.
 * Core is resolved through its public declarations. Every service Auth
 * requires stays required, and so does every service the application adds.
 */
import { createStore, Effect, type Reducer } from '@composable-svelte/core';
import {
	ManagedIntegrationBuilder,
	defineApplication,
	defineViews,
	nestedSlot,
	optionalSlot,
	type ManagedComposition
} from '@composable-svelte/core/application';
import type { PresentationAction } from '@composable-svelte/core/navigation';
import {
	createAuthFeature,
	type AuthFeatureAction,
	type AuthFeatureDependencies,
	type AuthFeatureState
} from '../src/lib/application/index.js';
import { createMockAuthDeps } from '../src/lib/testing/index.js';

interface AppDependencies extends AuthFeatureDependencies {
	fetchActivity(signal?: AbortSignal): Promise<readonly number[]>;
}
interface State {
	auth: AuthFeatureState | null;
	activity: readonly number[];
}
type Action =
	| { type: 'auth'; action: PresentationAction<AuthFeatureAction> }
	| { type: 'activityLoaded'; rows: readonly number[] };

const auth = createAuthFeature();
const authSlot = optionalSlot<State, Action>()('auth');
const initialState: State = { auth: auth.initialState(), activity: [] };

const reducer: Reducer<State, Action, AppDependencies> = (state, action, deps) => {
	if (action.type === 'activityLoaded') return [{ ...state, activity: action.rows }, Effect.none()];
	if (state.auth?.handoff?.kind === 'accepted')
		return [state, Effect.run<Action>(async (dispatch) => dispatch({ type: 'activityLoaded', rows: await deps.fetchActivity() }))];
	return [state, Effect.none()];
};

// Positive: the package composition nests under the extended dependencies, catalog and handles intact.
export const composition = new ManagedIntegrationBuilder(reducer).with(authSlot, auth.composition).build();
export const typed: ManagedComposition<State, Action, AppDependencies> = composition;
export const views = defineViews(composition, { auth: { headless: true } });
export const application = defineApplication(composition, { initialState: (): State => initialState });
const dependencies: AppDependencies = { ...createMockAuthDeps(), fetchActivity: async () => [] };
export const store = createStore({ initialState, reducer: composition.reducer, execution: composition.execution, dependencies });
export const login = composition.bind(store, nestedSlot(authSlot, auth.loginSlot));

// Negative: a service Auth requires cannot be dropped from the parent's dependencies.
type WithoutAccount = Omit<AuthFeatureDependencies, 'fetchAccount'> & { fetchActivity(): Promise<readonly number[]> };
const withoutAccount: Reducer<State, Action, WithoutAccount> = (state) => [state, Effect.none()];
// @ts-expect-error Auth requires fetchAccount
new ManagedIntegrationBuilder(withoutAccount).with(authSlot, auth.composition);

// Negative: the composed application still requires the service it added.
// @ts-expect-error fetchActivity is required by the application reducer
export const authOnlyComposition: ManagedComposition<State, Action, AuthFeatureDependencies> = composition;
declare const authOnly: AuthFeatureDependencies;
// @ts-expect-error a store over the application needs fetchActivity as well
createStore({ initialState, reducer: composition.reducer, execution: composition.execution, dependencies: authOnly });
