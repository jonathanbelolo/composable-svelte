import { Effect, type PresentationAction, type Reducer } from '@composable-svelte/core';
import { ManagedIntegrationBuilder, optionalSlot } from '@composable-svelte/core/application';
import { createAuthFeature, type AuthFeatureAction, type AuthFeatureDependencies, type AuthFeatureState } from '@composable-svelte/auth/application';
interface S { auth: AuthFeatureState | null }
type A = { type: 'auth'; action: PresentationAction<AuthFeatureAction> };
interface ExtendedDeps extends AuthFeatureDependencies { fetchActivity(signal?: AbortSignal): Promise<number[]> }
const auth = createAuthFeature();
const slot = optionalSlot<S, A>()('auth');
const reducer: Reducer<S, A, ExtendedDeps> = (s) => [s, Effect.none()];
export const composition = new ManagedIntegrationBuilder<S, A, ExtendedDeps>(reducer).with(slot, auth.composition).build();
