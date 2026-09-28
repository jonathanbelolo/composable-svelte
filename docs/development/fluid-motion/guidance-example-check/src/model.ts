import { Effect, createDestination, type PresentationAction, type PresentationState, type Reducer } from '@composable-svelte/core';
import {
  defineApplication,
  defineViews,
  destinationSlot,
  ManagedIntegrationBuilder,
  type ApplicationStaging
} from '@composable-svelte/core/application';
import CatalogView from './CatalogView.svelte';
import DetailView from './DetailView.svelte';
import { visual } from './visual.js';

export interface Item { readonly id: string; readonly title: string; readonly summary: string; readonly featured: boolean }
export const ITEMS: readonly Item[] = [
  { id: 'pavilion', title: 'Pavilion of Light', summary: 'A pneumatic roof over a public square.', featured: true },
  { id: 'harbour', title: 'Harbour Baths', summary: 'Tidal pools cut into the quay.', featured: false }
];

// Route pages: one destination case per page.
export interface CatalogState { readonly featuredOnly: boolean }
export type CatalogAction = { type: 'toggleFeatured' };
const catalogReducer: Reducer<CatalogState, CatalogAction> = (state, action) =>
  action.type === 'toggleFeatured' ? [{ ...state, featuredOnly: !state.featuredOnly }, Effect.none()] : [state, Effect.none()];

// The notes dialog's lifecycle is store-owned presentation state. The Modal reports completion through its
// callbacks (no timers); a pinned dialog refuses close, and a refused close starts no motion.
export interface DetailState { readonly item: Item; readonly saved: boolean; readonly notes: PresentationState<string>; readonly pinned: boolean }
export type DetailAction =
  | { type: 'toggleSaved' }
  | { type: 'openNotes' }
  | { type: 'closeNotes' }
  | { type: 'togglePinned' }
  | { type: 'notesPresented' }
  | { type: 'notesDismissed' };
const detailReducer: Reducer<DetailState, DetailAction> = (state, action) => {
  const notes = state.notes;
  switch (action.type) {
    case 'toggleSaved': return [{ ...state, saved: !state.saved }, Effect.none()];
    case 'togglePinned': return [{ ...state, pinned: !state.pinned }, Effect.none()];
    case 'openNotes':
      return notes.status === 'idle' || notes.status === 'dismissing'
        ? [{ ...state, notes: { status: 'presenting', content: state.item.summary } }, Effect.none()]
        : [state, Effect.none()];
    case 'closeNotes':
      // Refused while pinned: the status does not change, so no close motion starts.
      return !state.pinned && (notes.status === 'presented' || notes.status === 'presenting')
        ? [{ ...state, notes: { status: 'dismissing', content: notes.content } }, Effect.none()]
        : [state, Effect.none()];
    case 'notesPresented':
      return notes.status === 'presenting' ? [{ ...state, notes: { status: 'presented', content: notes.content } }, Effect.none()] : [state, Effect.none()];
    case 'notesDismissed':
      return notes.status === 'dismissing' ? [{ ...state, notes: { status: 'idle' } }, Effect.none()] : [state, Effect.none()];
  }
};

export const pages = createDestination({ catalog: catalogReducer, detail: detailReducer });
export type PagesState = typeof pages._types.State;
export type PagesAction = typeof pages._types.Action;

export function pageFor(url: string): PagesState {
  const item = ITEMS.find(candidate => url === `/items/${candidate.id}`);
  return item ? pages.initial('detail', { item, saved: false, notes: { status: 'idle' }, pinned: false }) : pages.initial('catalog', { featuredOnly: false });
}

// Root domain: the URL and the page it selects.
export interface AppState { readonly url: string; readonly page: PagesState | null }
export type AppAction =
  | { type: 'navigate'; url: string }
  | { type: 'page'; action: PresentationAction<PagesAction> };
export type AppIntent = { readonly to: '/' | `/items/${string}` };

export const initialAppState = (url: string): AppState => ({ url, page: pageFor(url) });

export const rootReducer: Reducer<AppState, AppAction> = (state, action) => {
  switch (action.type) {
    case 'navigate':
      return [{ ...state, url: action.url, page: pageFor(action.url) }, Effect.none()];
    default:
      return [state, Effect.none()];
  }
};

export const pageSlot = destinationSlot<AppState, AppAction>()('page', pages);

export const composition = new ManagedIntegrationBuilder(rootReducer)
  .with(pageSlot, { replaceOn: action => action.type === 'navigate' })
  .build();

export const viewPlan = defineViews(composition, {
  page: { cases: { catalog: { render: CatalogView }, detail: { render: DetailView } } }
});

export const staging: ApplicationStaging<AppState, AppAction, AppIntent> = {
  // Pure. Runs at admission, before return/unchanged handling (false: request result
  // `rejected`), and again when the commit is inspected (false: outcome `vetoed`).
  policy: state => state.page !== null,
  // The one domain action dispatched when the transaction commits.
  commit: intent => ({ action: { type: 'navigate', url: intent.to }, expectedURL: intent.to }),
  routeSlot: pageSlot
};

export const application = defineApplication(composition, {
  initialState: initialAppState,
  routing: {
    fragment: 'native',
    serialize: state => state.url,
    request: url => ({ action: { type: 'navigate', url }, expectedURL: url }),
    staging,
    // Opt-in; containers are elements marked data-composable-scroll="<key>" (at most 8).
    scroll: { containers: ['catalog-list'] }
  },
  // Optional: representation providers, preparation budget and public diagnostics (§8).
  visual
});
