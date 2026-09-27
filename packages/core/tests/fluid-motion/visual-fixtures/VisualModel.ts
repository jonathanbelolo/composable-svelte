import { defineApplication, defineViews, type StagedRouteRequester } from '../../../src/lib/application/index.js';
import { destinationSlot, ManagedIntegrationBuilder } from '../../../src/lib/navigation/managed-integration.js';
import { createDestination } from '../../../src/lib/navigation/destination.js';
import type { PresentationAction } from '../../../src/lib/navigation/types.js';
import { Effect } from '../../../src/lib/effect.js';
import type { Reducer } from '../../../src/lib/types.js';
import Home from './VisualHome.svelte';
import Detail from './VisualDetail.svelte';
import Card from './VisualCard.svelte';

export interface VisualPage { readonly title: string }
const page: Reducer<VisualPage, { type: 'noop' }, VisualDeps> = state => [state, Effect.none()];
export const pages = createDestination({ home: page, detail: page, card: page });
export interface VisualState { url: string; page: typeof pages._types.State | null }
export type VisualAction = { type: 'go'; url: string } | { type: 'page'; action: PresentationAction<typeof pages._types.Action> };
export interface VisualDeps { readonly trace: string[] }
export type VisualIntent = { readonly to: '/' | '/detail' | '/card' };
/** Test switch for commit-time policy (veto witness). */
export const policy = { allow: true };
const caseFor = (url: string) => url === '/detail' ? 'detail' : url === '/card' ? 'card' : 'home';
const stateFor = (url: string): VisualState => ({ url, page: pages.initial(caseFor(url), { title: url }) });
const root: Reducer<VisualState, VisualAction, VisualDeps> = (state, action, deps) => {
  if (action.type !== 'go') return [state, Effect.none()];
  deps.trace.push(`go:${action.url}`);
  return [stateFor(action.url), Effect.none()];
};
export const pageSlot = destinationSlot<VisualState, VisualAction>()('page', pages);
export const composition = new ManagedIntegrationBuilder(root).with(pageSlot, { replaceOn: action => action.type === 'go' }).build();
export const plan = defineViews(composition, { page: { cases: { home: { render: Home }, detail: { render: Detail }, card: { render: Card } } } });
export const definition = defineApplication(composition, {
  initialState: (url: string) => stateFor(url),
  routing: {
    fragment: 'native', serialize: state => state.url,
    request: url => ({ action: { type: 'go', url }, expectedURL: url }),
    staging: { policy: () => policy.allow, commit: (intent: VisualIntent) => ({ action: { type: 'go', url: intent.to }, expectedURL: intent.to }), routeSlot: pageSlot }
  }
});
export const requesters: { readonly where: string; readonly requester: StagedRouteRequester<VisualIntent> }[] = [];
/** Opt-in large cold participant (rows × 3 elements + root); 0 keeps the fixture unchanged. */
export const big = { rows: 0 };

/** A tiny decorative image (no text) for the `scale` content option. */
export const logoSrc = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="rgb(20,140,90)"/></svg>');
/** Within-page toggles registered by pages (test access). */
export const localToggles: { toggle(plan: import('../../../src/lib/application/motion-public.js').ChoreographyPlan): void; expanded(): boolean }[] = [];
