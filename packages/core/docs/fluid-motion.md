# Fluid Layout Motion & Staged Routing

Staged routing lets a routed application animate a whole layout across a route change. The framework measures the current page, plays a declared choreography on a motion plane, commits the route's domain action at a cue point, and finishes the motion against the new page. Applications do not own history writers, timers, element clones or coordinators.

> **Introduced in `@composable-svelte/core` 0.14.0.** The first-party providers mentioned here are introduced in `@composable-svelte/graphics` 0.4.0 (`graphicsVisualProvider`) and `@composable-svelte/media` 0.6.0 (`mediaVisualProvider`). Earlier versions (core 0.13.x, graphics 0.3.x, media 0.5.x) do not include these APIs. They follow the 0.x line, where a minor release may still change them (see [Versioning](https://github.com/jonathanbelolo/composable-svelte/blob/codex/fluid-layout-motion/README.md#versioning)).

Everything below is compiled, run with TestStore and server rendering, and played in Chromium by [`guidance-example-check`](https://github.com/jonathanbelolo/composable-svelte/tree/codex/fluid-layout-motion/docs/development/fluid-motion/guidance-example-check) against the package exports. Participants are styled like any other markup: grid, flex, gradients, positioning, pseudo-elements, SVG, canvas and video are represented as they are painted (§8). Do not restyle a page to make it animate.

Use something else when:

- **Overlay lifecycles** (modal, sheet, drawer) → `PresentationState` and the navigation components.
- **Declared property motion on one element or group** → compiled recipes (`useMotion`, `useMotionGroup`), see [application-motion.md](./application-motion.md).
- **Ordinary route changes that need no choreography** → plain routing, see [application-routing.md](./application-routing.md).

## 1. Lifecycle

1. **Request.** A component calls `route.request(intent, { motion })`. The result of the request is recorded as a *request result*.
2. **Admission.** `staging.policy` runs. If it passes and staging is available, a *transaction* is admitted, and any earlier pending transaction is `superseded`.
3. **Preparation and playback.** The Host represents participants on the motion plane (§8) and plays the plan. Before the cue, no domain action has run and the route and its state are unchanged.
4. **Commit at `cueMs`.** `policy` runs again, then the one `commit` action is dispatched through the reducer. History is written and the new route renders. If no cue arrives, the transaction commits at an absolute deadline. The transaction's one *transaction outcome* is recorded when this commit turn settles; a transaction that ends without committing records its outcome at that point instead.
5. **Visual settlement.** Tracks continue against the measured destination until the visual run settles. Timeline tracks end within `durationMs`. Render-anchored tracks (the incoming default) are timed from the destination render, and a shared surface with `crossfade`, `reflow` or `scale` content runs a short, bounded destination crossfade after its measured geometry arrives. Both can finish after `durationMs`. This is visual only: the outcome is already recorded, and nothing further reaches the domain or history.

The plan is visual data only. It has no authority over business state, history or focus.

## 2. Declaring staging

Pages, views, routing, staging, scroll and the optional visual configuration (`visual`, §8) are declared once (`model.ts`); the page components are shown in §3:

```typescript
import { Effect, createDestination, type PresentationAction, type Reducer } from '@composable-svelte/core';
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

export interface DetailState { readonly item: Item; readonly saved: boolean }
export type DetailAction = { type: 'toggleSaved' };
const detailReducer: Reducer<DetailState, DetailAction> = (state, action) =>
  action.type === 'toggleSaved' ? [{ ...state, saved: !state.saved }, Effect.none()] : [state, Effect.none()];

export const pages = createDestination({ catalog: catalogReducer, detail: detailReducer });
export type PagesState = typeof pages._types.State;
export type PagesAction = typeof pages._types.Action;

export function pageFor(url: string): PagesState {
  const item = ITEMS.find(candidate => url === `/items/${candidate.id}`);
  return item ? pages.initial('detail', { item, saved: false }) : pages.initial('catalog', { featuredOnly: false });
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
```

| Staging field | Meaning |
|---|---|
| `policy(state, { intent, expectedURL, currentURL, routeKey })` | Pure boolean. It runs at admission, **before** return/unchanged handling: `false` gives request result `rejected`. It runs again when the commit is inspected: `false` gives outcome `vetoed`. A throw or non-boolean gives `failed` (`admission` / `commitPolicy`). |
| `commit(intent)` | Maps the intent to one domain action and its canonical `expectedURL`. |
| `routeSlot` | The root destination slot that the managed route outlet renders. |
| `routeKey(state)` | Optional route equivalence. Defaults to the fragment-projected canonical URL. |
| `onUnavailable` | `'immediate'` (default) or `'drop'`. Can be overridden per request (see §6). |
| `budgets` | Optional `{ preparationMs, cueSlackMs }`, defaulting to `600` and `250`. The absolute commit deadline is `preparationMs + cueMs + cueSlackMs`. |

A policy that refuses the current URL also refuses `return: true` requests. Leave "already here" to the framework: it reports `unchanged`, or `returned` when a transition is pending (§6).

## 3. Views, participants and requests

`useStagedRoute`, `useParticipant` and `useLayoutChoreography` are called during component initialization.

`useStagedRoute(application)` binds its requests to the calling page's owner. If the page retires while a request is pending, the transaction ends `cancelled/ownerRetired`. A request made from an already-retired owner has request result `stale/ownerRetired`. In shell markup outside the route outlet, the owner is the root (`route.source === 'root'`). A retained callback never gains root lifetime by omission.

```svelte
<script lang="ts">
  import { useStagedRoute, type PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import { Presence, useLayoutChoreography, useParticipant } from '@composable-svelte/core/application/motion';
  import { application, ITEMS, type CatalogAction, type CatalogState } from './model.js';
  import { filterCatalog, openDetail } from './motion.js';
  import CatalogItem from './CatalogItem.svelte';

  let { store }: PresentationFeatureViewProps<CatalogState, CatalogAction, {}> = $props();

  // Bound to this page's owner: unmounting it cancels its pending request (`ownerRetired`).
  const route = useStagedRoute(application);
  const participant = useParticipant();
  const layout = useLayoutChoreography();

  const featuredOnly = $derived(store.state?.featuredOnly ?? false);
  const shown = (item: (typeof ITEMS)[number]) => !featuredOnly || item.featured;

  function open(id: string) {
    route.request({ to: `/items/${id}` }, { motion: openDetail(id) });
  }
  function toggleFeatured() {
    // Items that this commit removes leave through their <Presence> boundary.
    const leaving = featuredOnly ? [] : ITEMS.filter(item => !item.featured).map(item => item.id);
    layout.transition(filterCatalog(leaving), () => store.dispatch({ type: 'toggleFeatured' }));
  }
</script>

<main>
  <!-- An inline SVG can itself be a participant. -->
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" use:participant={{ key: 'catalog-mark' }}>
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" />
  </svg>
  <h1>Catalog</h1>
  <button type="button" onclick={toggleFeatured}>{featuredOnly ? 'Show all' : 'Featured only'}</button>
  <ul class="catalog" data-composable-scroll="catalog-list" use:participant={{ key: 'catalog-list' }}>
    {#each ITEMS as item (item.id)}
      <Presence when={shown(item)}>
        <CatalogItem {item} onopen={open} />
      </Presence>
    {/each}
  </ul>
</main>
```

```svelte
<script lang="ts">
  import { useParticipant } from '@composable-svelte/core/application/motion';
  import Pulse from './Pulse.svelte';
  import type { Item } from './model.js';

  let { item, onopen }: { item: Item; onopen: (id: string) => void } = $props();

  // Called inside CatalogView's <Presence>, so this participant belongs to that boundary.
  const participant = useParticipant();
</script>

<li use:participant={{ key: `item-${item.id}` }}>
  <Pulse />
  <button type="button" onclick={() => onopen(item.id)}>{item.title}</button>
</li>
```

```svelte
<script lang="ts">
  import { useStagedRoute, type PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import { useParticipant } from '@composable-svelte/core/application/motion';
  import { application, type DetailAction, type DetailState } from './model.js';
  import { closeDetail } from './motion.js';

  let { store }: PresentationFeatureViewProps<DetailState, DetailAction, {}> = $props();

  const route = useStagedRoute(application);
  const participant = useParticipant();

  function back(id: string) {
    route.request({ to: '/' }, { motion: closeDetail(id) });
  }
</script>

{#if store.state}
  {@const { item, saved } = store.state}
  <main>
    <button type="button" use:participant={{ key: 'back', role: 'control' }} onclick={() => back(item.id)}>Back to catalog</button>
    <h1 data-route-focus use:participant={{ key: `item-${item.id}` }}>{item.title}</h1>
    <!-- Text only: focusable content may slide but never fades below its stable opacity. -->
    <article use:participant={{ key: 'detail-body' }}>
      <p>{item.summary}</p>
    </article>
    <button type="button" onclick={() => store.dispatch({ type: 'toggleSaved' })}>{saved ? 'Saved' : 'Save'}</button>
  </main>
{/if}
```

A participant is any HTML or SVG element, including an inline `<svg>` (`catalog-mark` above). Each item is a `CatalogItem` inside a `<Presence>` boundary, so the "Featured only" filter can hand items off as it removes them (§10). `<Pulse>` is a small canvas component whose representation provider is shown in §8. Participants are matched by `key` within their route instance, or within the shell:

- A **shared** track needs exactly one source match, and a destination with the same key on the new page.
- An **outgoing** or **incoming** track animates one side only.
- A track whose source is missing or ambiguous is skipped, and the skip is diagnosed.

The "back" button above is an ordinary request with its own plan. See §6 for what `return: true` means.

## 4. Choreography plans

```typescript
import { defineChoreography } from '@composable-svelte/core/application/motion';

// Catalog card → detail heading. The route commits at cueMs; tracks continue after it.
export const openDetail = (id: string) =>
  defineChoreography({
    cueMs: 200,
    durationMs: 520,
    tracks: [
      {
        participant: `item-${id}`,
        side: 'shared',
        startMs: 0,
        durationMs: 520,
        easing: 'ease-in-out',
        radius: { from: 12, to: 0 },
        path: [{ atMs: 200, pose: { relativeTo: 'source', dy: -24 } }]
      },
      { participant: 'catalog-list', side: 'outgoing', startMs: 0, durationMs: 180, easing: 'ease-in', opacity: { from: 1, to: 0 } },
      { participant: 'catalog-mark', side: 'outgoing', startMs: 0, durationMs: 180, easing: 'ease-in', opacity: { from: 1, to: 0 } },
      // The real incoming body slides up 24px while it fades in (timed from the destination render).
      {
        participant: 'detail-body',
        side: 'incoming',
        startMs: 0,
        durationMs: 300,
        easing: 'ease-out',
        opacity: { from: 0, to: 1 },
        slide: { dx: 0, dy: 24 }
      }
    ]
  });

// Detail heading → catalog card: an ordinary forward request with its own plan.
export const closeDetail = (id: string) =>
  defineChoreography({
    cueMs: 160,
    durationMs: 420,
    tracks: [
      { participant: `item-${id}`, side: 'shared', startMs: 0, durationMs: 420, easing: 'ease-in-out', radius: { from: 0, to: 12 } },
      { participant: 'detail-body', side: 'outgoing', startMs: 0, durationMs: 140, easing: 'ease-in', opacity: { from: 1, to: 0 } },
      { participant: 'catalog-list', side: 'incoming', startMs: 0, durationMs: 260, easing: 'ease-out', opacity: { from: 0, to: 1 } }
    ]
  });

// Within-page: the list surface resizes while its content crossfades; removed items fade out.
export const filterCatalog = (leaving: readonly string[]) =>
  defineChoreography({
    cueMs: 0,
    durationMs: 300,
    tracks: [
      { participant: 'catalog-list', side: 'shared', startMs: 0, durationMs: 300, easing: 'ease-out' },
      ...leaving.map(id => ({ participant: `item-${id}`, side: 'outgoing' as const, startMs: 0, durationMs: 200, easing: 'ease-in' as const, opacity: { from: 1, to: 0 } }))
    ]
  });
```

`defineChoreography` validates and freezes a plan:

- **Plan**
  - A plan needs at least one track.
  - `preparationBudgetMs` (optional, finite, 16–5000): this plan's preparation budget (§8). It overrides the application's `visual` default.
  - `0 ≤ cueMs ≤ durationMs`.
  - Timeline tracks end within `durationMs`.
  - Incoming tracks default to `anchor: 'render'` (timed from the destination render); outgoing tracks are timeline-relative.
- **All tracks**
  - `participant` and `side` (`'shared' | 'outgoing' | 'incoming'`).
  - `startMs` and `durationMs`.
  - `easing`: one of `'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out'`. Other easing strings throw.
  - `anchor`.
  - `paint`: control paint policy, `{ kind: 'holdThenFade' }`. It is the only qualified policy (`QUALIFIED_PAINT_POLICIES`); others fall back with a plan diagnostic.
- **Outgoing/incoming tracks**: `opacity: { from, to }`, each value in `[0, 1]`.
- **Incoming tracks only**: `slide: { dx?, dy? }`, in px (finite, within ±4096). The real incoming element starts offset and moves to its layout position with the track's timing and anchor, alongside its opacity. The movement is written through a choreography lease on the CSS `translate` property, which is released at settlement. If another owner holds `translate`, the element does not move and a `slideSkipped` diagnostic is reported. A slide on any other side throws.
- **Shared tracks only**
  - `path`: ordered waypoints `{ atMs, pose, radius?, clip? }` inside the track. A pose is `{ relativeTo: 'source', dx?, dy?, dw?, dh? }` or viewport fractions `{ relativeTo: 'viewport', x, y, width, height }`. The final endpoint is always the measured destination.
  - `radius: { from, to }`: a number, or four `Corners`.
  - `clip: { from, to }`: `Inset` `[top, right, bottom, left]`.
  - `content`: see §8.
  - `driver`: the name returned by `defineVisualDriver`. An unknown name falls back to the planned motion with a diagnostic.

**Reduced motion is framework-owned.** Do not build empty or zero-length plans:

- Under `(prefers-reduced-motion: reduce)`, a staged request commits on the next turn without choreography.
- A preference change during playback settles the run.
- `useLayoutChoreography` simply runs its commit.

## 5. Host integration

```svelte
<script lang="ts">
  import { ApplicationHost, ApplicationRoot, FeatureOutlet, FeatureViews } from '@composable-svelte/core/application';
  import { MotionPlane } from '@composable-svelte/core/application/motion';
  import { application, viewPlan } from './model.js';

  // Injected by the entry point: the request URL on the server, the location in the browser.
  let { url }: { url: string } = $props();
</script>

<ApplicationRoot definition={application} options={{ dependencies: {}, initial: { input: url, url } }}>
  {#snippet children(app)}
    <ApplicationHost {app}>
      <MotionPlane />
      <FeatureViews store={app.store} definition={viewPlan}>
        {#snippet children(views)}
          <FeatureOutlet view={views.page}>
            {#snippet fallback({ summary, attempt, retry })}
              <section role="alert">
                <h2>This page failed to render ({summary.name})</h2>
                <p>{summary.message}</p>
                <button type="button" onclick={retry}>Try again (attempt {attempt} failed)</button>
              </section>
            {/snippet}
          </FeatureOutlet>
        {/snippet}
      </FeatureViews>
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>
```

```typescript
import { mount } from 'svelte';
import App from './App.svelte';

// The only browser read: the client entry passes the current URL in.
const target = document.getElementById('app');
if (target) mount(App, { target, props: { url: location.pathname + location.search + location.hash } });
```

- **Initial options.** `ApplicationRoot` needs `dependencies` and `initial: { input, url }`, or `initial: { state, url }` to adopt a server snapshot when hydrating. Pass the URL in from the entry point, and never read `window` while constructing the root. The same component renders on the server; staging and choreography start only after the Host mounts in the browser.
- **`<MotionPlane />`** is an optional explicit outlet for in-flight representations; without it, a document-level plane is used. If any ancestor of the outlet has a `transform`, `filter`, `perspective`, `contain` or `will-change: transform`, the outlet is not a qualified coordinate space. It falls back to the document plane with the `planeOutletUnqualified` diagnostic.
- **`fallback`** applies to the managed route outlet of a staged application:
  - It receives `{ summary, attempt, retry }`, where `attempt` is the failed attempt (1 on first mount).
  - `retry()` re-renders the same owner once per failure. It replays no domain action and no managed initialization.

## 6. Request results and transaction outcomes

Every request settles with one **request result** (`handle.status` after `'pending'`, or `route.status.request(id)`):

| Result | When |
|---|---|
| `admitted { transaction }` | A transaction was created. |
| `rejected` | `policy` returned `false` at admission. |
| `unchanged` | Nothing is pending, and either `expectedURL` equals the current URL or `return: true` was passed. |
| `returned` | A transaction was pending, and either `expectedURL` equals the current URL or `return: true` was passed. The pending transaction ends `cancelled/returned`. |
| `stale { reason }` | Root destroyed, owner retired, binding epoch changed, or a traversal happened after the call. |
| `failed { phase: 'admission' }` | `commit`/`policy` threw or returned an invalid value. |
| `dropped { reason }` | Staging unavailable (`noBinding`, `historyBarrier`, `historyUncertain`, `unmanagedRouteRender`) and `onUnavailable: 'drop'`. |
| `degraded { reason, outcome }` | Staging unavailable and `'immediate'` (default): the commit action runs as an ordinary immediate turn, and `outcome` is that turn's outcome. |

Every admitted transaction ends with one **transaction outcome** (`route.status.transaction(tx)` is `{ phase: 'pending', committing }` or `{ phase: 'terminal', outcome }`):

| Outcome | `attempted` / `domainCommitted` | Notes |
|---|---|---|
| `committed { route: 'accepted' \| 'redirected', url, history }` | 1 / true | `accepted`: the committed URL is `expectedURL`. `redirected`: the URL moved elsewhere. |
| `refused { url, history }` | 1 / true | The reducer ran and the URL stayed where it was. |
| `failed { phase: 'reduction', error }` | 1 / false | The reducer threw. |
| `failed { phase: 'routeClassification', history: 'failed', error }` | 1 / true | |
| `failed { phase: 'commitPolicy' \| 'commitRouteKey', error }` | 0 / false | |
| `vetoed` | 0 / false | `policy` returned `false` at commit. |
| `superseded` | 0 / false | A newer request was admitted. |
| `cancelled { reason }` | 0 / false | `returned`, `explicit` (`route.cancel(tx)`), `ownerRetired`, `directCommit`, `routeKeyFailed`, `traversal`, `historyUnavailable`, `detached`, `rootDestroyed`. |

`history` reports what the binding recorded for that exact turn:

- `written`: a push or replace was recorded.
- `unchanged`: the binding was live but no write was due.
- `failed`: the write failed, or it cannot be proven because the binding retired.

**Return intent** (`{ return: true }`) means "abandon the in-flight transition and stay". It cancels whatever transaction is pending (`cancelled/returned`, request result `returned`). With nothing pending, it is `unchanged`. It never navigates. A request whose `expectedURL` is the current URL behaves the same way even without `return: true`: while a transition is pending, it returns to the current page (`returned`). The comparison is on the exact committed URL, never on route-key equality. To go back after a commit, make an ordinary request with its own plan, as `DetailView` does, or let the user traverse history.

**Supersession.** A newer request that is admitted (for a different URL) ends the pending one as `superseded`. Shared representations continue from their displayed pose. Custom drivers declared with `continuation: 'none'` settle to the destination without continuity.

## 7. Focus, controls and scroll

- **Route focus.** When a new route instance *replaces* the previous one, focus moves to `[data-route-focus]`, or else the first `h1`. The framework adds `tabindex="-1"` if needed and announces the text in a polite live region. This does not happen on initial render, hydration or retry, or when focus is already inside the new page.
- **Controls.** Mark interactive participants with `role: 'control'` (the default is `'surface'`). Their paint holds, then fades, before the commit, and the real control stays visible and usable. Focusable participants keep their real paint, and so do participants containing embedded interactive content (`iframe`, `embed`, `object`, `audio[controls]`, `video[controls]`), whatever their `tabindex`: they stay pointer-operable until the commit. An incoming participant that is a control, or contains focusable content, may slide (its paint and hit box move together) but never fades below its stable opacity. This is why `DetailView` keeps its Save button outside the fading `detail-body`. An outgoing participant that receives visible focus is restored to its stable paint within a short bound (diagnostic `focusPinned`).
- **Landmarks.** Representations on the motion plane duplicate paint only. The page's real landmarks and controls stay the single semantic view.
- **Scroll (opt-in).**
  - Without `routing.scroll`, browser scroll behaviour is unchanged. With it, `policy({ previous, next, cause })` picks `'top' | 'preserve' | 'entry-restore' | 'fragment'`. Returning `undefined` uses the defaults: `push` → `top`, `replace` → `preserve`, `traversal` → `entry-restore`.
  - `containers` lists up to 8 keys. Each key must match an element marked `data-composable-scroll="<key>"`, as the catalog list above is.
- **Native fragments.** With `fragment: 'native'`, a fragment-only change (`/a#x` → `/a#y`) is native browser movement. It dispatches no route action, cancels no staged transaction, applies no top scroll or route focus, and rebases active motion.

## 8. Representations, providers and limits

### Representations

Shared and outgoing participants are shown on the motion plane as **representations**: framework-owned, inert copies (`inert`, `aria-hidden`, no hit testing, no focusable content, no duplicate IDs). The real page remains the only semantic and interactive view. Incoming tracks animate the real element and need no representation. The source element is only read: its styles, attributes and animations are never modified to build a copy.

By default every element is handled by the built-in **structural projection**. It copies each element's computed style, so ordinary layout and paint are represented: grid and flex, positioning, gradients and other backgrounds, shadows, `::before`/`::after` (including `counter()`, `counters()` and `attr()` text), form control values (including a file input's selected-file label, shown from the same `File` objects without reading them), scroll offsets, open shadow roots, inline SVG, the clip of scrolling or clipping ancestors (including rotated or skewed ones, composed exactly), and 2D transforms (rotation, skew and scale). CSS animations and transitions are replayed on the copy. For some elements the built-in providers do more:

| Element | Representation |
|---|---|
| `<canvas>` (2D or WebGL) | A live mirror of the canvas. After its page retires, it keeps changing only while something still draws into the canvas (`canvasRetiredWithoutRenderer` otherwise). A provider can keep it drawing (below). |
| `<video>` with an `http(s)` URL or a file `blob:` URL | A muted, inert decorative player that follows the source's time, rate and paused state, and keeps playing after the page retires until the run settles. Audio is never duplicated. Until the player has its first frame, the copy shows the source's current frame, if the browser lets it be read. |
| `<video>` whose `srcObject` is a `MediaStream` | A muted decorative player shares the owner's same stream, live for as long as the owner keeps it; the owner's tracks are never cloned or stopped. If the owner stops them, frames stop and `videoStreamEnded` is reported. |
| `<video>` playing unencrypted MSE (a `MediaSource` or its `blob:` URL) | A `MediaSource` attaches to one element, so after removal the detached source element itself is muted, resumed once and mirrored: real decoded frames continue until settle, which pauses it and restores `muted`. If the application re-inserts the element, the run lets go of it (`videoElementReclaimed`). |
| Protected (EME) video (`mediaKeys` set) | Never copied. The **containing participant settles**: no copy and no placeholder. The real player stays usable until the commit and leaves with its page. Reported as `settled:video:videoSourceUnqualified:encrypted`. This is conservative. The EME specification lets a key system's policy withhold decoded pixels (it MAY), so a copy cannot be assumed live. Key systems that do expose frames (for example Clear Key) are not qualified either way. |
| `<img>`, `<picture>` | The same current source. |
| Same-origin `<iframe>` | The frame's document is projected at its scroll offset. |
| Cross-origin `<iframe>` | The browser does not let a page read another origin's document. The copy shows the frame's own box (background, border, radius); opt into `nativeSnapshot` (below) to show its content. |

`content` policies for shared tracks move the representation:

| `content` (shared) | Behaviour | Qualification |
|---|---|---|
| `'crossfade'` (default) | The surface resizes; content crossfades at the destination. | Any represented participant. |
| `'translate'` | Position only. | Fixed-size cards, icons, media. |
| `'scale'` | Scales the representation. | Images and icons. Text-bearing content falls back to `crossfade` during preparation. |
| `'clipReveal'` | Reveals the real destination with an inset clip grown from the source rect. | Expanding surfaces. |
| `'reflow'` | The copy re-wraps inside the resizing surface. | Subtrees of at most 32 elements; larger ones fall back to `crossfade`. |

### Visual configuration

`visual` on `defineApplication` is optional. Without it, a plan uses the built-in providers and a 600 ms preparation budget, and diagnostics are not delivered. It is created with `fluidMotion()`; this is the configuration the example application uses:

```typescript
import {
  fluidMotion,
  type ProvidedRepresentation,
  type RepresentationProvider,
  type RetainedRenderer,
  type VisualDiagnostic
} from '@composable-svelte/core/application/motion';

// A pure visual function of time: no store, no dispatch, no business state.
export type PulseArt = (paint: CanvasRenderingContext2D, time: number) => void;

export const pulseArt: PulseArt = (paint, time) => {
  const { width, height } = paint.canvas;
  paint.clearRect(0, 0, width, height);
  paint.fillStyle = '#38bdf8';
  paint.fillRect(0, 0, width * (0.5 + 0.5 * Math.sin(time / 300)), height);
};

// Keeps a pulse drawing on the motion plane after its page retires. It owns its registry: <Pulse> finds
// this provider with useRepresentationProvider('pulse') and registers its canvas while it is mounted.
export type PulseProvider = RepresentationProvider & {
  register(canvas: HTMLCanvasElement, art: PulseArt): () => void;
};

export function createPulseProvider(): PulseProvider {
  const pulses = new WeakMap<HTMLCanvasElement, PulseArt>();
  return {
    name: 'pulse',
    register(canvas, art) {
      pulses.set(canvas, art);
      return () => { pulses.delete(canvas); };
    },
    // Runs in the Host's read phase: synchronous, and it must not touch the source element or its animations.
    represent(source, context): ProvidedRepresentation | undefined {
      const art = source instanceof HTMLCanvasElement ? pulses.get(source) : undefined;
      if (!art || !(source instanceof HTMLCanvasElement)) return undefined; // Not ours: the next provider, then the built-ins.
      const node = context.document.createElement('canvas');
      node.width = source.width;
      node.height = source.height;
      node.dataset.pulse = '';
      const paint = node.getContext('2d');
      const draw = (time: number) => { if (paint) art(paint, time); };
      draw(performance.now());
      const release = () => { node.width = 0; };
      if (context.reducedMotion) return { node, continuity: 'static', dispose: release };
      // After retirement the run owns rendering: it calls frame() until it disposes this renderer.
      const retained: RetainedRenderer = { frame: draw, dispose: release };
      return { node, continuity: 'retained', frame: draw, retire: () => retained, dispose: release };
    }
  };
}

// Public diagnostics: bounded here; forward them to your own telemetry in production.
export const visualLog: VisualDiagnostic[] = [];
export function recordVisual(event: VisualDiagnostic): void {
  visualLog.push(event);
  if (visualLog.length > 200) visualLog.shift();
}

// The application's visual configuration (passed to defineApplication as `visual`).
export const visual = fluidMotion({
  providers: [createPulseProvider()], // consulted in order, before the built-in providers
  preparationBudgetMs: 250, // for plans that do not declare their own (16–5000; framework default 600), within the staging deadline
  onDiagnostic: recordVisual
});

// Pages whose participants contain cross-origin embeds can opt into native snapshots (route runs only).
export const embedVisual = fluidMotion({ nativeSnapshot: 'namedParticipants', onDiagnostic: recordVisual });
```

`<Pulse>` finds the configured provider and registers its canvas with it; otherwise it tears down normally:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { useRepresentationProvider } from '@composable-svelte/core/application/motion';
  import { pulseArt, type PulseProvider } from './visual.js';

  // The provider this application configured, or undefined (outside a Host, in SSR, or without `visual`).
  const provider = useRepresentationProvider<PulseProvider>('pulse');
  let canvas: HTMLCanvasElement;

  onMount(() => {
    const paint = canvas.getContext('2d');
    const unregister = provider?.register(canvas, pulseArt);
    let handle = requestAnimationFrame(function loop(time) {
      if (paint) pulseArt(paint, time);
      handle = requestAnimationFrame(loop);
    });
    // Ordinary teardown: the provider's representation has its own canvas and lifetime.
    return () => { cancelAnimationFrame(handle); unregister?.(); };
  });
</script>

<canvas bind:this={canvas} width="48" height="8" aria-hidden="true"></canvas>
```

| `fluidMotion` option | Meaning |
|---|---|
| `providers` | Representation providers, consulted in order for the participant root and every element inside it, before the built-ins. Names are lowercase and unique. |
| `preparationBudgetMs` | Default preparation budget for plans that do not declare one. Finite, 16–5000; default 600. |
| `nativeSnapshot` | `'off'` (default) or `'namedParticipants'`. See **Native snapshots**. |
| `onDiagnostic` | Receives public `VisualDiagnostic` events. A throwing listener does not affect motion. |

**Looking up a configured provider.** `useRepresentationProvider(name)` (motion subpath) is called during component initialization and resolves once. It returns the provider object the application passed to `fluidMotion({ providers })` under that `name`, for the nearest `ApplicationHost`. It returns `undefined` outside a Host, during server rendering, when the application declares no `visual`, or when no provider has that name; the component should then behave as it would without motion, as `<Pulse>` does. The lookup is read-only: it exposes no configuration and creates or registers nothing. A component that accepts an explicit provider or scope (for example a media component's `mediaScope`) should prefer it over the lookup.

### Writing a provider

A provider's `represent(source, context)` returns `undefined` (not mine), `{ declined: reason }` (mine, but not now; reported, and the next provider is asked) or a representation `{ node, continuity, ready?, frame?, retire?, dispose }`. The framework places `node` at the source's border box and owns placement, clipping, opacity and inertness.

A decline can also ask for the whole participant to be left out, with the optional `settle: true`. Use it when the element is what the participant is about and it cannot be represented faithfully, such as a live player that cannot move:

```typescript
import type { RepresentationProvider } from '@composable-svelte/core/application/motion';

// A provider for content it knows cannot be represented faithfully once the page commits: a live player
// that cannot move. Settling the participant avoids animating a blank player; the real one stays usable
// until the commit and leaves with its page.
export const livePlayerProvider: RepresentationProvider = {
  name: 'live-player',
  represent(source) {
    if (source.localName !== 'iframe' || !source.hasAttribute('data-live-player')) return undefined;
    return { declined: 'playerNotMovable', settle: true };
  }
};
```

- **Omitted or `false`:** an ordinary decline. The next provider, then the built-ins, handle the element.
- **`true`:** the **containing participant** is not represented: no copy, no placeholder and no choreography for it. This also applies when the declining element is inside a same-origin iframe in the participant. An outgoing participant is not faded or otherwise touched, so its real content (for example a player and its controls) stays usable until the commit and leaves with its page. A shared participant does not fly; the destination renders its own. Other participants of the run are unaffected. It is reported as a `representation` event with provider `settled`, continuity `unrepresented` and reason `settled:<provider>:<declined>` (through a frame, `settled:iframe:nested:<provider>:<declined>`).

A settled participant creates no representation, so there is nothing to dispose; anything a provider had already returned for it is disposed exactly once. Settlement applies to route runs and within-page runs alike. There is no option to leave out only part of a participant.

- `represent` runs in the Host's read phase. It is synchronous, must not modify the source, its styles or its animations, and must not dispatch, navigate, focus, add listeners to page content or start business work. It receives visual capabilities only: `document`, an abort `signal`, `reducedMotion` and `diagnose(reason)`.
- `continuity` is `'static'` (a snapshot), `'live'` (follows its source while the source exists) or `'retained'` (keeps rendering after the source's page retires).
- `ready` is observed, never awaited: it does not delay preparation or the cue, and the node is shown as it is until then. A rejection is reported (`readyFailed`).
- `frame(time)` runs in the write phase of every Host frame while the run is active.
- `retire()` is called once, when the source is removed. For a route run, that is in the frame its page is removed. For a within-page run, a participant inside a `<Presence>` boundary that the commit closes is retired **before** removal, while the source is still connected (§10). Without `Presence`, the removal is only noticed after the element is gone (before the next paint): the representation is still revealed and retired, but a provider that needs the source element itself, for example to move a playing media element, can no longer use it. Returning a `RetainedRenderer` (`{ frame?, dispose }`) moves render authority to the visual run, which then calls its `frame` each frame. Returning nothing keeps the last frame; for non-static continuity that is reported as `liveEndedAtRetirement`.
- **Disposal happens exactly once:** on the `RetainedRenderer` if `retire()` returned one, otherwise on the representation. It happens when the run's representation ends (at settle, at Host teardown or when reduced motion is turned on), or earlier if the provider fails (below). Each provided representation has its own `context.signal`, which aborts when that representation is disposed. A successor run that supersedes this one adopts shared representations with their provider objects, so there is no second representation and no restart.
- **Failures are isolated.** A throw from `represent` is reported (`provider:<name>:representFailed:…`) and the next provider or the projection handles the element. A throw from `frame` is reported (`frameFailed`), and that is the end of the provider's lifecycle: it receives no more frames, it is **disposed at once** and its signal aborts, and it is never retired. Its last painted node stays in the copy. Other providers in the same participant are unaffected. The route commit is never affected.

**Visual lifetime is not business lifetime.** When a page retires, its store, reducers, effects and subscriptions end with it, whatever is still on the plane. A retained renderer may continue *visual* progression (a clock, a shader, a declared animation computed from a data snapshot), as `pulseArt` does from time alone. It must not keep a store or dispatch alive through closures. The framework never seeds the destination's business state: a destination that should continue the same scene or playback reads it from its own application state.

### First-party graphics

`@composable-svelte/graphics` ships a provider. `<Scene>` and `<WebGLOverlay>` register their canvases themselves, so listing the provider is the only application code:

```typescript
import { fluidMotion } from '@composable-svelte/core/application/motion';
import { graphicsVisualProvider } from '@composable-svelte/graphics';

// <Scene> and <WebGLOverlay> register their own canvases; listing the provider is the only app code.
export const sceneVisual = fluidMotion({ providers: [graphicsVisualProvider()] });
```

After the feature retires, renderer-driven progression and playing `startAnimation` descriptors continue on the plane; other store changes stop at the last synced pose. See "Fluid Motion: Rendering Past Retirement" in the [graphics README](https://github.com/jonathanbelolo/composable-svelte/blob/codex/fluid-layout-motion/packages/graphics/README.md) for its lifetime and cost details. A third-party renderer without a provider gets the built-in canvas mirror, which is live only while that renderer's own loop still draws. Mounting a `Scene` and mirroring its canvas have measured costs that depend on the GPU and the browser. The [graphics README](https://github.com/jonathanbelolo/composable-svelte/blob/codex/fluid-layout-motion/packages/graphics/README.md)'s "What it costs" lists them per measured machine and backend.

### First-party media

`@composable-svelte/media` ships `mediaVisualProvider()` for `VideoEmbed`'s cross-origin iframe players (for example YouTube). When a page holding a `VideoEmbed` is removed under a run, its iframe moves into the run's inert decoration with its player state kept. A destination `VideoEmbed` with the same scope, `mediaKey` and configuration can adopt that same player, with no second player or reload. Configure the provider with `fluidMotion({ providers: [...] })`, like the graphics provider. The [media README](https://github.com/jonathanbelolo/composable-svelte/blob/codex/fluid-layout-motion/packages/media/README.md) describes props, identity and scope, audio, and where a state-preserving move is unavailable. Ordinary `<video>` elements need nothing from it: they use the core behaviour in the table above.

### Closed shadow roots and opaque content

Open shadow roots are projected like any other content. A **closed** shadow root that its author did not make serializable (see below) cannot be read by any public API outside its own component, so the framework never claims to have copied one. What it does depends on what it can observe:

| What the framework observes | Result | Reported |
|---|---|---|
| A light child or non-blank text with no box that is not hidden in an ordinary way. `display: none`, `display: contents` and elements that never have a box (such as `wbr` or `option`) do not count. | Never copied | — |
| Such content as a direct child of a **rendered** element that can host a shadow root (a custom element, or `div`, `span`, `p`, `section`, `article` and the other allowed hosts), whose contents are not skipped by `content-visibility`, that has no open root and no `data-composable-representation` declaration. This is the observable sign of unslotted content under a closed root. | The containing participant settles | `settled:closedShadow:<tag>` |
| A defined custom element whose closed root was declared serializable | The participant settles, unless a provider represents it | `settled:closedShadow:serializable:<tag>` |
| Any other defined custom element with no open root | Its light DOM is projected as usual. Completeness is **not verified**: a closed root that slots all of its content looks exactly like ordinary light DOM. | `representationCompletenessUnverified:<tag>` |
| A built-in element with an undeclared, non-serializable closed root and no observable light-DOM signal | Cannot be detected; projected as observed | — |

An element's author can state the fact with `data-composable-representation`. It is a statement about rendered content, not a permission and not lifecycle code:

```html
<!-- The light DOM is the complete rendering: project it, no completeness report. -->
<my-card data-composable-representation="light-dom">…</my-card>
<!-- The rendering is not observable (for example a closed root). -->
<my-player data-composable-representation="opaque"></my-player>
```

For `opaque` content the framework uses, in order: a provider that represents it; on a route run with `nativeSnapshot: 'namedParticipants'` where the View Transition API exists, the static native snapshot; otherwise the containing participant settles (`settled:opaqueDeclared:<tag>`).

To keep a closed-root component moving faithfully, its own library can supply the rendering:

- **A provider (live).** Only the component can read its closed root, so its library's provider returns an equivalent instance of the component, following the source's state while it exists. This keeps animating after retirement and is disposed like any provider representation.
- **A serializable root (static).** A component that attaches with `{ mode: 'closed', serializable: true }` exposes its markup to `getHTML({ serializableShadowRoots: true })`, and a provider can rebuild a static copy from it. That copy is faithful only when the whole rendering is in the markup:
  - no adopted style sheets styling inner elements;
  - nested shadow roots also serializable;
  - no nested components that would have to run to render.

  Rebuild inertly, without constructing components, and settle rather than copy part of a rendering. Firefox 142 serializes only the first child of a shadow root, so its markup is incomplete. The framework itself does not rebuild serializable roots; it settles them unless a provider represents them.
- **A native snapshot (static)**, for declared-opaque content on opted-in route runs.

### Native snapshots

`nativeSnapshot: 'namedParticipants'` uses the browser's View Transition API for content that projection cannot reach: cross-origin iframes (for example a video embed) and content declared `data-composable-representation="opaque"`. It applies to route runs only. Elements whose completeness is merely unverified are never sent to it.

- At the cue, only those unreachable elements are named, and the route commit runs inside the view transition's update callback. The document root is not captured and the overlay is not interactive, so real controls stay usable.
- The browser's old-state image is **static**: it shows the pixels at the cue, not live content. It then follows the element's representation (position, size and opacity) each frame.
- Availability is checked at run time. Where `document.startViewTransition` is missing, the run reports `nativeSnapshotUnavailable:api`, and the element shows only its box. Within-page runs report `nativeSnapshotUnavailable:withinPage`: their commit is immediate and cannot be deferred into a view transition. Another view transition started on the page ends the snapshot (`nativeSnapshotEndedByNewTransition`).
- Chromium and WebKit are exercised with the API present, and Firefox 142 (which lacks it) with the API absent. Other browser versions are detected, not separately qualified.

### Preparation

Before a route run starts, participants are projected in slices across frames, within the preparation budget: the plan's `preparationBudgetMs`, else the application's, else 600 ms. If preparation does not finish in time, a `preparation` diagnostic reports `overBudget`, the run settles, and the transaction commits without choreography. A participant that changes while it is being copied is copied again (a bounded number of times). When the application configures no custom providers, registered participants may also be copied ahead of time in idle slices and reused while still valid: any change to the application's DOM or stylesheets, the viewport size, fonts or colour scheme, or the participant's hover/focus state invalidates the copy, and scroll offsets are read live when it is used. Animated content, content whose generated text depends on counters, and anything containing canvas, video, iframes or other embedded media is always represented fresh. The `preparation` diagnostic's `cached` and `projected` fields report which.

- The staging commit deadline (§2) is separate: `budgets.preparationMs + cueMs + cueSlackMs` from admission, which is `850 + cueMs` ms with the defaults, so it covers the default 600 ms preparation budget. It does not follow the preparation budget automatically: if you raise a plan's or the application's budget, raise `routing.staging.budgets.preparationMs` to at least the same value, or the deadline can commit before the cue.
- Readiness (a decoded image, a provider's `ready`, a mirror's first frame) never delays the cue. The copy shows its first copied frame until live frames arrive, and `readinessPending` counts what was still pending.
- Within-page runs (§10) project synchronously, before their immediate commit. Without a valid warm copy, their cost grows with the participant's element count (in measured runs, about 320–340 ms of work for 1,500 elements), so keep within-page participants moderate.

### Diagnostics

`onDiagnostic` receives the public subset of the Host's diagnostics:

| `type` | Fields | Meaning |
|---|---|---|
| `representation` | `participant`, `provider`, `continuity`, `reason?` | How a participant is represented, for example `provider: 'projection+pulse'`, `continuity: 'retained'`. Provider `settled` reports a participant left out by a settling decline (`settled:…`). |
| `unsupported` | `participant`, `reason` | A skipped participant or element, a declined or failed provider, an animation, media or native-snapshot outcome, or a Host-level issue (`participant: '*'`, for example `topLayer`, `planeOutletUnqualified`). Some reasons are informational (for example `animationReconstructed`). |
| `preparation` | `transaction`, `workMs`, `slices`, `elements`, `projected`, `cached`, `outcome`, `readinessPending?` | Preparation cost and whether it finished within budget. |
| `settled` | `transaction`, `reason` | The visual run ended. |

Reason strings are descriptive and may be added to. `content` fallbacks, driver events and focus pinning are not part of the public stream.

### Current limits

- **Skipped participants.** A shared or outgoing participant that cannot be represented is skipped with an `unsupported` diagnostic, for example `transformed-space:3d` (perspective or 3D transforms), `missing-geometry` or `clippedOut`. A skipped **shared** track does not move: the source stays painted until the commit and the destination appears normally. A skipped **outgoing** track still fades the real content before the commit (a control holds), but nothing continues after its removal.
- **Animations after retirement.** While the source exists, its animations are followed. After its page retires, CSS animations and transitions keep replaying, and other Web Animations are replayed on the copy from the element's own animation stack (keyframes, composite modes, easing, paused state) when its values can be verified against samples. This is exercised in Chromium, Firefox 142 and WebKit, including composite `add`, two animations on one property and non-identity implicit transforms. What cannot be verified holds its last frame and is reported as `animationFrozen:<properties>`.
- **Generated text:** `counter(list-item)`, quotes, `@counter-style` rules and the common predefined counter styles (including `lower-armenian`, `upper-armenian`, `cjk-decimal` and `lower-greek`) are resolved from the document and its style sheets. A predefined style that is not implemented is approximated and reported (`counterStyleApproximated:<style>`).
- **Armenian counters outside 1–9999:** when a counter uses the predefined `lower-armenian` or `upper-armenian` style for a value outside 1–9999, the containing participant **settles** in every engine (`settled:counterStyleOutsideQualifiedRange:<style>:<value>`). This is a deterministic qualification boundary, not a rendering failure: some engines draw these values correctly, but the framework does not claim them. Values from 1 to 9999, custom `@counter-style` rules (including ones that override these names) and all other styles are resolved as usual. Other unresolved tokens are reported (`generatedContentUnresolved:<token>`), and counter resolution stops after 20,000 elements (`counterSimulationBounded`).
- **Known gaps:** Closed shadow roots follow *Closed shadow roots and opaque content* above. Protected (EME) video is never copied; its participant settles.
- **Blending and backdrops:** `backdrop-filter` and `mix-blend-mode` are represented inside participants. Outgoing and shared (flying) participants that blend with the page keep blending with it, including after the commit.
- **Chromium text at fractional positions:** when text sits at a fractional x, Chromium antialiases its glyphs slightly differently on the motion plane than in normal flow. Layout and position are identical, and no paint is missing. In a measured witness at x + 0.234375, 13.75% of the line's pixels differ, but the ink amount matches within 0.05% and its centre within 0.31 px: a sub-pixel antialiasing difference, not displacement. At integer x the copy is identical. Firefox and WebKit matched exactly at both.
- **Not yet qualified:** `::first-letter` and WebGPU canvases.
- **Geometry.** Tracks animate 2D position and size, radius and inset clip. Shared tracks do not animate rotation or 3D transforms; a rotated or skewed participant keeps its own matrix inside the moving box.
- **Top layer.** If a modal `dialog`, an open popover or `[aria-modal="true"]` is present at preparation, the run is `unsupported` (diagnostic `topLayer`), and the transaction commits without choreography.
- **Route boundary.** It catches failures when a route component initializes or renders, when a template `$derived` throws, and when a conditional child mounts. Failures inside the fallback, and shell failures, reach the `ApplicationHost` boundary. A user `$effect` that throws on a later update escapes both boundaries in Svelte 5.43.3 (unsupported); active choreography still settles at its deadline. Event handlers and detached async callbacks are ordinary JavaScript errors.
- **Scope.** There is one managed route outlet per staged application. Nested route outlets are not supported.

## 9. Testing with `TestStore`

`TestStore` runs the same coordinator. Protocol events (`receiveProtocol`) are separate from domain actions (`receive`):

- The staging option wraps the application's declaration: `{ staging, serialize }`.
- Cueing is manual by default (`cueMode: 'manual'`): use `cue(tx)`, or `advanceTime` to reach the deadline.
- History results come from a default `createStagingFixture()`.

```typescript
import { describe, expect, it } from 'vitest';
import { createTestStore } from '@composable-svelte/core/test';
import { initialAppState, rootReducer, staging, type AppAction, type AppState } from '../src/model.js';

// TestStore staging options wrap the application's declaration: { staging, serialize }.
const stagedStore = (url = '/') =>
  createTestStore<AppState, AppAction>({
    initialState: initialAppState(url),
    reducer: rootReducer,
    staging: { staging, serialize: state => state.url }
  });

describe('staged catalog → detail navigation', () => {
  it('admits, commits on cue, and records the outcome', async () => {
    const store = stagedStore();

    const handle = store.request({ to: '/items/pavilion' });
    const status = handle.status;
    if (status === 'pending' || status.type !== 'admitted') throw new Error('expected admission');
    const tx = status.transaction;

    // Protocol events: the request result, then the admitted transaction.
    await store.receiveProtocol({ kind: 'request', request: handle.id, result: status });
    await store.receiveProtocol({ kind: 'admitted', transaction: tx, request: handle.id });

    // Nothing reaches the reducer before the cue.
    expect(store.state.page?.type).toBe('catalog');

    // TestStore cues manually by default (cueMode: 'manual').
    store.cue(tx);

    // Domain: exactly one ordinary action; the page really changes.
    await store.receive({ type: 'navigate', url: '/items/pavilion' }, state => {
      expect(state.page?.type).toBe('detail');
    });
    await store.receiveProtocol({
      kind: 'terminal',
      transaction: tx,
      outcome: { type: 'committed', route: 'accepted', attempted: 1, domainCommitted: true, url: '/items/pavilion', history: 'written' }
    });
    await store.finish();
  });

  it('commits at the absolute deadline without a cue', async () => {
    const store = stagedStore();
    // Deadline = preparationMs (600) + cueMs + cueSlackMs (250) with the default budgets.
    store.request({ to: '/items/harbour' }, { motion: { cueMs: 200 } });
    await store.receiveProtocol({ kind: 'request' });
    await store.receiveProtocol({ kind: 'admitted' });

    await store.advanceTime(1050);

    await store.receive({ type: 'navigate', url: '/items/harbour' });
    await store.receiveProtocol({ kind: 'terminal', outcome: { type: 'committed', route: 'accepted', attempted: 1, domainCommitted: true, url: '/items/harbour', history: 'written' } });
    await store.finish();
  });

  it('a newer request supersedes the pending one', async () => {
    const store = stagedStore();
    store.request({ to: '/items/pavilion' });
    await store.receiveProtocol({ kind: 'request' });
    const first = await store.receiveProtocol({ kind: 'admitted' });
    if (first.kind !== 'admitted') throw new Error('expected admission');

    store.request({ to: '/items/harbour' });
    await store.receiveProtocol({ kind: 'terminal', transaction: first.transaction, outcome: { type: 'superseded', attempted: 0, domainCommitted: false } });
    await store.receiveProtocol({ kind: 'request' });
    await store.receiveProtocol({ kind: 'admitted' });

    store.cue();
    await store.receive({ type: 'navigate', url: '/items/harbour' });
    await store.receiveProtocol({ kind: 'terminal' });
    await store.finish();
  });

  it('return: true abandons the pending transition and stays put', async () => {
    const store = stagedStore();
    store.request({ to: '/items/pavilion' });
    await store.receiveProtocol({ kind: 'request' });
    const admitted = await store.receiveProtocol({ kind: 'admitted' });
    if (admitted.kind !== 'admitted') throw new Error('expected admission');

    store.request({ to: '/' }, { return: true });
    await store.receiveProtocol({ kind: 'terminal', transaction: admitted.transaction, outcome: { type: 'cancelled', reason: 'returned', attempted: 0, domainCommitted: false } });
    await store.receiveProtocol({ kind: 'request', result: { type: 'returned' } });

    // With nothing pending, return intent is `unchanged`; it never navigates.
    store.request({ to: '/items/pavilion' }, { return: true });
    await store.receiveProtocol({ kind: 'request', result: { type: 'unchanged' } });

    expect(store.state.url).toBe('/');
    await store.finish();
  });

  it('a request for the current URL while a transition is pending returns to it', async () => {
    const store = stagedStore();
    store.request({ to: '/items/pavilion' });
    await store.receiveProtocol({ kind: 'request' });
    const admitted = await store.receiveProtocol({ kind: 'admitted' });
    if (admitted.kind !== 'admitted') throw new Error('expected admission');

    // No return option: the current URL alone makes this a return.
    store.request({ to: '/' });
    await store.receiveProtocol({ kind: 'terminal', transaction: admitted.transaction, outcome: { type: 'cancelled', reason: 'returned', attempted: 0, domainCommitted: false } });
    await store.receiveProtocol({ kind: 'request', result: { type: 'returned' } });
    expect(store.state.url).toBe('/');
    await store.finish();
  });

  it('policy false at admission is a rejected request, not a transaction', async () => {
    const store = createTestStore<AppState, AppAction>({
      initialState: { url: '/', page: null },
      reducer: rootReducer,
      staging: { staging, serialize: state => state.url }
    });
    store.request({ to: '/items/pavilion' });
    await store.receiveProtocol({ kind: 'request', result: { type: 'rejected' } });
    expect(store.state.url).toBe('/');
    await store.finish();
  });
});
```

## 10. Within-page choreography

`useLayoutChoreography().transition(plan, commit)` represents the scope's participants and runs `commit` immediately; `commit` is your explicit business action. It then bridges the old and new layout with the plan (`CatalogView` above, `filterCatalog`). It takes no history or focus authority. Without a visual Host (SSR, reduced motion), it simply runs `commit`. Declare its participants with `useParticipant()`.

**Removing participants: `<Presence when>`.** A within-page commit often removes an element, as the "Featured only" filter removes an item. Render such content inside `<Presence when={…}>` (motion subpath), which owns the conditional and renders its children while `when` is true. A participant belongs to the `Presence` inside which its component called `useParticipant()`; that is why each item is its own `CatalogItem` component. Boundaries can nest: when an outer `Presence` closes, the members of the boundaries inside it are handed off too, each exactly once.

- When a committed state change turns `when` false, the boundary's participants are handed off after the business commit and before Svelte removes them: an outgoing participant of the active run is revealed on the plane, and `retire()` is called while its source is still connected.
- Nothing is retired unless the removal is established. A commit that throws, does nothing, or leaves `when` true retires nothing, so input and semantics are untouched. Participants outside a closing `Presence` are never retired early. Before that point the framework only reads.
- Supersession and Host destruction behave as for route runs: a successor adopts, and every retained renderer is disposed exactly once.

## 11. Imports and cost

Fluid motion is opt-in by import:

- An application that never imports `@composable-svelte/core/application/motion` or creates a plan gets none of the choreography or representation engine. `ApplicationHost` reaches the engine only through a plan from `defineChoreography`, or through `visual: fluidMotion(...)` on `defineApplication`. There is no global registration and no import side effect.
- Route staging (`routing.staging`) and scroll restoration (`routing.scroll`) are ordinary routing features. They are present whether or not motion is used.
- Graphics and media providers are separate packages. Import them only where they are configured. The WebGPU engine in `@composable-svelte/graphics` is a lazy chunk loaded only when requested.

Preparation cost is described in §8 (*Preparation*). As a guide from measured runs, a 1,500-element participant takes about 320–340 ms of copying work, which is why the default preparation budget is 600 ms.
