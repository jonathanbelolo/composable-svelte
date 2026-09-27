import { defineApplication, defineViews, type StagedRouteRequester } from '../../../src/lib/application/index.js';
import { defineChoreography } from '../../../src/lib/application/motion-public.js';
import { destinationSlot, ManagedIntegrationBuilder } from '../../../src/lib/navigation/managed-integration.js';
import { createDestination } from '../../../src/lib/navigation/destination.js';
import type { PresentationAction } from '../../../src/lib/navigation/types.js';
import { Effect } from '../../../src/lib/effect.js';
import type { Reducer } from '../../../src/lib/types.js';
import HomePage from './HomePage.svelte';
import DetailPage from './DetailPage.svelte';
import AboutPage from './AboutPage.svelte';

export interface Page { readonly title: string }
const page: Reducer<Page, { type: 'noop' }, SliceDeps> = state => [state, Effect.none()];
export const pages = createDestination({ home: page, detail: page, about: page });
export interface SliceState { url: string; page: typeof pages._types.State | null }
export type SliceAction = { type: 'go'; url: string } | { type: 'page'; action: PresentationAction<typeof pages._types.Action> };
export interface SliceDeps { readonly trace: string[] }
export type Intent = { readonly to: '/' | '/detail' | '/about' | '/blocked' };
const caseFor = (url: string) => url === '/detail' ? 'detail' : url === '/about' ? 'about' : 'home';
export const stateFor = (url: string): SliceState => ({ url, page: pages.initial(caseFor(url), { title: url }) });
const root: Reducer<SliceState, SliceAction, SliceDeps> = (state, action, deps) => {
  if (action.type !== 'go') return [state, Effect.none()];
  deps.trace.push(`go:${action.url}`);
  if (action.url === '/blocked') return [state, Effect.none()];
  return [stateFor(action.url), Effect.none()];
};
export const pageSlot = destinationSlot<SliceState, SliceAction>()('page', pages);
export const composition = new ManagedIntegrationBuilder(root).with(pageSlot, { replaceOn: action => action.type === 'go' }).build();
export const plan = defineViews(composition, { page: { cases: { home: { render: HomePage }, detail: { render: DetailPage }, about: { render: AboutPage } } } });
export const definition = defineApplication(composition, {
  initialState: (url: string) => stateFor(url),
  routing: {
    fragment: 'native',
    serialize: state => state.url,
    request: url => ({ action: { type: 'go', url }, expectedURL: url }),
    staging: {
      policy: () => true,
      commit: (intent: Intent) => ({ action: { type: 'go', url: intent.to }, expectedURL: intent.to }),
      routeSlot: pageSlot
    }
  }
});
export const choreography = defineChoreography({
  cueMs: 300,
  durationMs: 700,
  tracks: [
    { participant: 'hero', side: 'shared', startMs: 0, durationMs: 700, easing: 'ease-in-out', via: { dy: -20 } },
    { participant: 'body', side: 'outgoing', startMs: 0, durationMs: 500, easing: 'linear', opacity: { from: 1, to: 0 } },
    { participant: 'intro', side: 'incoming', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 0, to: 1 } }
  ]
});
/** Requesters captured by pages and shell, in creation order (test access only). */
export const requesters: { readonly where: string; readonly requester: StagedRouteRequester<Intent> }[] = [];
