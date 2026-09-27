import { Effect, createDestination, type PresentationAction, type Reducer } from '@composable-svelte/core';
import { defineApplication, defineViews, destinationSlot, ManagedIntegrationBuilder, type ApplicationStaging } from '@composable-svelte/core/application';
import { defineChoreography, fluidMotion, type FluidMotionOptions } from '@composable-svelte/core/application/motion';
import HomeView from './HomeView.svelte';
import NextView from './NextView.svelte';

export type HomeState = { readonly v: 0 };
export type NextState = { readonly v: 0 };
export type NoAction = { type: 'noop' };
const same = <S,>(): Reducer<S, NoAction> => state => [state, Effect.none()];
export const pages = createDestination({ home: same<HomeState>(), next: same<NextState>() });
type PagesState = typeof pages._types.State;
type PagesAction = typeof pages._types.Action;
const pageFor = (url: string): PagesState => (url === '/next' ? pages.initial('next', { v: 0 }) : pages.initial('home', { v: 0 }));

export interface AppState { readonly url: string; readonly page: PagesState | null }
export type AppAction = { type: 'navigate'; url: string } | { type: 'page'; action: PresentationAction<PagesAction> };
export type AppIntent = { readonly to: '/' | '/next' };
const root: Reducer<AppState, AppAction> = (state, action) =>
  action.type === 'navigate' ? [{ url: action.url, page: pageFor(action.url) }, Effect.none()] : [state, Effect.none()];

export const pageSlot = destinationSlot<AppState, AppAction>()('page', pages);
export const composition = new ManagedIntegrationBuilder(root).with(pageSlot, { replaceOn: action => action.type === 'navigate' }).build();
export const viewPlan = defineViews(composition, { page: { cases: { home: { render: HomeView }, next: { render: NextView } } } });
const staging: ApplicationStaging<AppState, AppAction, AppIntent> = {
  policy: state => state.page !== null,
  commit: intent => ({ action: { type: 'navigate', url: intent.to }, expectedURL: intent.to }),
  routeSlot: pageSlot
};

export function makeApplication(visual: FluidMotionOptions) {
  return defineApplication(composition, {
    initialState: (url: string): AppState => ({ url, page: pageFor(url) }),
    routing: { fragment: 'native', serialize: state => state.url, request: url => ({ action: { type: 'navigate', url }, expectedURL: url }), staging },
    visual: fluidMotion(visual)
  });
}
export type TestApplication = ReturnType<typeof makeApplication>;
// The application the pages bind their staged requests to (set by the test before mounting).
export const current: { application: TestApplication | undefined } = { application: undefined };

// Outgoing participants hold at full opacity for a while after the cue, then fade.
const HOLD = { startMs: 1500, durationMs: 200, easing: 'linear' as const, opacity: { from: 1, to: 0 } };
export const leave = defineChoreography({
  cueMs: 100,
  durationMs: 1700,
  tracks: ['badge', 'animated', 'slot', 'light', 'serial', 'div', 'pairA', 'pairB', 'serialNested', 'serialAdopted', 'serialChild', 'opaque', 'lightDeclared', 'wbr', 'intText', 'fracText'].map(participant => ({ participant, side: 'outgoing' as const, ...HOLD }))
});
