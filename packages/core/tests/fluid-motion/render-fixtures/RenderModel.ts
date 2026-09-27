import { defineApplication, defineViews, optionalSlot, ManagedIntegrationBuilder } from '../../../src/lib/application/index.js';
import type { PresentationAction } from '../../../src/lib/navigation/types.js';
import { Effect } from '../../../src/lib/effect.js';
import type { Reducer } from '../../../src/lib/types.js';
import PageView from './PageView.svelte';
import PanelView from './PanelView.svelte';

export interface Panel { n: number }
export type PanelAction = { type: 'inc' };
export interface Page { url: string; count: number; explode: boolean; panel: Panel | null }
export type PageAction = { type: 'arm' } | { type: 'set'; n: number } | { type: 'panel'; action: PresentationAction<PanelAction> };
export interface Root { url: string; page: Page | null }
export type RootAction = { type: 'go'; url: string } | { type: 'page'; action: PresentationAction<PageAction> };
export interface Deps { readonly trace: string[]; readonly events: string[] }
export type Intent = { readonly to: string };

/** Test-controlled render failure injection (not domain state). */
export const failures = { conditional: false, fallback: false, shell: false };
export const viewEvents: string[] = [];

const panel: Reducer<Panel, PanelAction, Deps> = (state, _action, deps) => { deps.trace.push('panel:inc'); return [{ n: state.n + 1 }, Effect.none()]; };
export const panelSlot = optionalSlot<Page, PageAction>()('panel');
const page: Reducer<Page, PageAction, Deps> = (state, action, deps) => {
  deps.trace.push(`page:${action.type}`);
  if (action.type === 'arm') return [{ ...state, explode: true }, Effect.none()];
  if (action.type === 'set') return [{ ...state, count: action.n }, Effect.none()];
  return [state, Effect.none()];
};
export const pageComposition = new ManagedIntegrationBuilder(page).with(panelSlot, panel).build();
export const pageSlot = optionalSlot<Root, RootAction>()('page');
export const pageFor = (url: string): Page | null => url === '/empty' ? null : { url, count: 0, explode: url === '/boom-initial', panel: { n: 0 } };
const root: Reducer<Root, RootAction, Deps> = (state, action, deps) => {
  if (action.type !== 'go') return [state, Effect.none()];
  deps.trace.push(`go:${action.url}`);
  return [{ url: action.url, page: pageFor(action.url) }, Effect.none()];
};
export const composition = new ManagedIntegrationBuilder(root)
  .with(pageSlot, pageComposition, {
    replaceOn: action => action.type === 'go',
    // Managed initialization: attempted once per owner; a render retry must not repeat it.
    onCreate: (state, deps) => Effect.run(async () => { deps.events.push(`init:${state.url}`); })
  })
  .build();
export const plan = defineViews(composition, { page: { render: PageView, children: defineViews(pageComposition, { panel: { render: PanelView } }) } });
export const definition = defineApplication(composition, {
  initialState: (url: string): Root => ({ url, page: pageFor(url) }),
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
