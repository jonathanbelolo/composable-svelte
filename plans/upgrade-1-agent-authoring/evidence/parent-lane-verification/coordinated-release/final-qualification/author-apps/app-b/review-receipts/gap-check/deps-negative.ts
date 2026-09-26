import { Effect, type PresentationAction, type Reducer } from '@composable-svelte/core';
import { ManagedIntegrationBuilder, optionalSlot } from '@composable-svelte/core/application';
import { createTestStore } from '@composable-svelte/core/test';
import { createAuthFeature, type AuthFeatureAction, type AuthFeatureDependencies, type AuthFeatureState } from '@composable-svelte/auth/application';
import { createMockAuthDeps } from '@composable-svelte/auth/testing';
interface S { auth: AuthFeatureState | null }
type A = { type: 'auth'; action: PresentationAction<AuthFeatureAction> };
const auth = createAuthFeature();
const slot = optionalSlot<S, A>()('auth');
// N1: parent that lacks Auth's services must be rejected at .with
interface TooSmall { fetchActivity(signal?: AbortSignal): Promise<number[]> }
const small: Reducer<S, A, TooSmall> = (s) => [s, Effect.none()];
// @ts-expect-error parent lacks AuthFeatureDependencies
new ManagedIntegrationBuilder<S, A, TooSmall>(small).with(slot, auth.composition);
// N2: a store over the composed parent must require the extra service
interface Extended extends AuthFeatureDependencies { fetchActivity(signal?: AbortSignal): Promise<number[]> }
const ext: Reducer<S, A, Extended> = (s) => [s, Effect.none()];
const composition = new ManagedIntegrationBuilder<S, A, Extended>(ext).with(slot, auth.composition).build();
createTestStore({
  initialState: { auth: null },
  reducer: composition.reducer,
  execution: composition.execution,
  // @ts-expect-error missing fetchActivity
  dependencies: createMockAuthDeps()
});
