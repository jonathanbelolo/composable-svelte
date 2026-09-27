---
name: composable-svelte-navigation
description: Navigation and animation patterns for Composable Svelte. Use when implementing modals, sheets, drawers, alerts, navigation flows, or component lifecycle animations. Covers state-driven navigation, PresentationState, parent observation, URL routing, and Motion One integration.
---

# Composable Svelte Navigation & Animation

This skill covers state-driven navigation patterns, PresentationState lifecycle animations, and URL routing integration.

---

## CRITICAL RULE

### Rule 3: State-Driven Animations Only

**Principle**: State-driven animation uses the public motion layer. For declared motion
recipes, use `useMotion` or `MotionElement` for a recipe with exactly one target, and
`useMotionGroup` when one recipe coordinates its complete declared target set. These APIs
provide managed target ownership and do not imply default animation behavior for navigation
overlays. Keep an explicit `PresentationState` lifecycle only when application state must observe
completion or keep presentation content alive through dismissal. CSS transitions remain
unsupported for UI interactions. See `guides/ANIMATION-GUIDELINES.md` and
`specs/frontend/application-authoring-and-motion.md`; import the public APIs from
`@composable-svelte/core/application/motion`.

#### Animation Decision Tree
```
Does component have animation?
├─ NO → No animation system needed
└─ YES → What kind?
    ├─ Infinite loop (spinner, shimmer) → CSS @keyframes ONLY
    ├─ Hover/focus/click → instant feedback unless application state drives the change
    ├─ Declared element/group state → MotionElement, useMotion, or useMotionGroup
    ├─ Whole-layout / cross-route fluid motion → useStagedRoute + defineChoreography + MotionPlane
    ├─ Intra-page layout choreography → useLayoutChoreography + defineChoreography
    └─ Store-observed completion/content lifetime → Motion One + PresentationState
```

#### ❌ WRONG - CSS Transitions
```css
.button {
  transition: background-color 0.2s; /* ❌ REMOVED */
}

.modal {
  transition: opacity 0.3s; /* ❌ Not state-driven, not testable */
}
```

#### ✅ CORRECT - State-Driven with Motion One
```typescript
interface ModalState {
  content: Content | null;
  presentation: PresentationState<Content>;
}

// Reducer manages lifecycle
case 'show':
  return [
    {
      ...state,
      content,
      presentation: { status: 'presenting', content, duration: 0.3 }
    },
    Effect.afterDelay(300, (d) => d({
      type: 'presentation',
      event: { type: 'presentationCompleted' }
    }))
  ];

// Component executes animation
$effect(() => {
  if (store.state.presentation.status === 'presenting') {
    animateModalIn(element).then(() => {
      store.dispatch({
        type: 'presentation',
        event: { type: 'presentationCompleted' }
      });
    });
  }
});
```

**WHY**: State-driven animations are predictable, testable with TestStore, and composable with the navigation system.

---

## TREE-BASED NAVIGATION PATTERN

### Core Principle

**Non-null state = presented, null = dismissed**

This creates a navigation tree where each node can optionally present a child screen.

### State Structure

```typescript
// Parent state
interface AppState {
  items: Item[];
  destination: DestinationState | null; // What to show
}

// Destination is enum of possible screens
type DestinationState =
  | { type: 'addItem'; state: AddItemState }
  | { type: 'editItem'; state: EditItemState; itemId: string }
  | { type: 'confirmDelete'; state: ConfirmDeleteState; itemId: string };

// Child states
interface AddItemState {
  name: string;
  quantity: number;
}

interface EditItemState {
  name: string;
  quantity: number;
}

interface ConfirmDeleteState {
  itemName: string;
}
```

### Actions

```typescript
type AppAction =
  | { type: 'addButtonTapped' }
  | { type: 'editButtonTapped'; itemId: string }
  | { type: 'deleteButtonTapped'; itemId: string }
  | { type: 'destination'; action: PresentationAction<DestinationAction> };

type DestinationAction =
  | { type: 'addItem'; action: AddItemAction }
  | { type: 'editItem'; action: EditItemAction }
  | { type: 'confirmDelete'; action: ConfirmDeleteAction };

// PresentationAction wraps child actions
type PresentationAction<A> =
  | { type: 'presented'; action: A }
  | { type: 'dismiss' };
```

---

## LEGACY IFLET COMPOSITION FOR OPTIONAL CHILDREN

**When**: Maintaining reducer-only code that has not adopted managed composition. New
application presentation code should declare an `optionalSlot` or `destinationSlot`;
managed composition consumes its dismissal action and clears the slot automatically.

### Basic Pattern

```typescript
// Parent state
interface AppState {
  items: Item[];
  destination: AddItemState | null; // Optional child
}

// Parent actions
type AppAction =
  | { type: 'addButtonTapped' }
  | { type: 'destination'; action: PresentationAction<AddItemAction> };

// Reducer
import { ifLetPresentation } from '@composable-svelte/core';

case 'addButtonTapped':
  return [
    { ...state, destination: { name: '', quantity: 0 } },
    Effect.none()
  ];

case 'destination': {
  // Handle dismiss
  if (action.action.type === 'dismiss') {
    return [{ ...state, destination: null }, Effect.none()];
  }

  // Compose child
  const [newState, effect] = ifLetPresentation(
    (s) => s.destination,
    (s, d) => ({ ...s, destination: d }),
    'destination',
    (ca): AppAction => ({ type: 'destination', action: { type: 'presented', action: ca } }),
    addItemReducer
  )(state, action, deps);

  // Parent observes child completion
  if ('action' in action &&
      action.action.type === 'presented' &&
      action.action.action.type === 'saveButtonTapped') {
    const item = newState.destination!;
    return [
      {
        ...newState,
        destination: null, // Dismiss
        items: [...newState.items, { id: crypto.randomUUID(), ...item }]
      },
      effect
    ];
  }

  return [newState, effect];
}
```

---

## PARENT OBSERVATION PATTERN

**Critical Pattern**: Parent can observe child actions to react to completion, cancellation, or other child events.
The manual reducer example below is a legacy reducer-only boundary. In managed
composition, observe presented child actions in the root reducer but let the declared
slot consume dismissal.

### Example: Observing Save/Cancel

```typescript
case 'destination': {
  // Legacy-only dismissal handling (no managed slot owns this boundary).
  if (action.action.type === 'dismiss') {
    return [{ ...state, destination: null }, Effect.none()];
  }

  // Route to child reducer based on destination type
  let newState = state;
  let effect: Effect<AppAction> = Effect.none();

  if (state.destination?.type === 'addItem' && 'action' in action && action.action.type === 'presented') {
    const [childState, childEffect] = addItemReducer(
      state.destination.state,
      action.action.action,
      deps
    );

    newState = {
      ...state,
      destination: { type: 'addItem', state: childState }
    };

    // By hand there is no cancellation: a save still in flight when the
    // destination is nulled below lands in the next presentation. Prefer
    // `integrate(core).with('destination', Destination.reducer)`, which puts
    // the child's effects in the field's cancellation group and cancels it on
    // dismiss, on a parent null and on a case change — or add
    // `Effect.cancelGroup('destination')` where the field is nulled and nest
    // the child's effect with `Effect.inGroup(…, 'destination')`.
    effect = Effect.map(childEffect, (childAction): AppAction => ({
      type: 'destination',
      action: { type: 'presented', action: { type: 'addItem', action: childAction } }
    }));

    // Observe child completion
    if (action.action.action.type === 'saveButtonTapped') {
      return [
        {
          ...newState,
          destination: null,
          items: [...newState.items, {
            id: crypto.randomUUID(),
            name: childState.name,
            quantity: childState.quantity
          }]
        },
        effect
      ];
    }

    // Observe child cancellation
    if (action.action.action.type === 'cancelButtonTapped') {
      return [
        { ...newState, destination: null },
        effect
      ];
    }
  }

  // Similar for editItem and confirmDelete...

  return [newState, effect];
}
```

---

## SCOPING AND MANAGED PRESENTATION

Legacy `scopeToDestination`, `scopeToOptional`, and fluent `scopeTo` remain useful for
state reads and action dispatch outside presentation rendering. Their returned stores
do not carry dismissal authority and must not be passed to dismissing navigation
components.

For a rendered presentation, declare an `optionalSlot` or `destinationSlot` in the
application composition, declare its view with `defineViews`, and render it through
`FeatureViews` / `FeatureOutlet`. The renderer receives a nominal
`PresentationView<State, Action>` and its `surface` action:

Import `PresentationFeatureViewProps` from `@composable-svelte/core/application` when
annotating a standalone declaration snippet.

```svelte
<script lang="ts">
  import type { PresentationFeatureViewProps } from '@composable-svelte/core/application';
</script>

{#snippet modalView({ store, surface }: PresentationFeatureViewProps<State, Action>)}
  <Modal {store} ariaLabel="Edit item">
    <form use:surface>
      <button onclick={() => store.dispatch({ type: 'save' })}>Save</button>
      <button onclick={() => store.dismiss()}>Cancel</button>
    </form>
  </Modal>
{/snippet}
```

Do not fabricate or cast a view. `dismiss()` is exact-owner authority: a copied or stale
view cannot dismiss a replacement.

---

## PRESENTATIONSTATE LIFECYCLE

### The Lifecycle

```
idle → presenting → presented → dismissing → idle
  ↑        ↓           ↓           ↓         ↑
  └────────┴───────────┴───────────┴─────────┘
```

### PresentationState Type

```typescript
type PresentationState<Content> =
  | { status: 'idle' }
  | { status: 'presenting'; content: Content; duration: number }
  | { status: 'presented'; content: Content }
  | { status: 'dismissing'; content: Content; duration: number };

type PresentationEvent =
  | { type: 'presentationCompleted' }
  | { type: 'dismissalCompleted' };
```

### Managed animated presentation

Pass the admitted `PresentationView` and the reducer-owned `PresentationState` to the
navigation component. Completion callbacks report the visual lifecycle; they do not
mint dismissal authority or synthesize raw dismiss actions.

```svelte
<Modal
  {store}
  {presentation}
  onPresentationComplete={() => dispatch({ type: 'presentationCompleted' })}
  onDismissalComplete={() => dispatch({ type: 'dismissalCompleted' })}
>
  <section use:surface>...</section>
</Modal>
```

The component owns focus, portal, dismissal boundary, scroll lock, and exit-shell
lifetime. Keep those concerns out of application reducers.

---

## MOTION ONE ANIMATION SYSTEM

The current public authoring surface is `MotionElement`, `useMotion`, and `useMotionGroup`
from `@composable-svelte/core/application/motion`. Use a declared recipe for element or group
motion. The explicit helper pattern below is retained for legacy application-owned lifecycles
whose reducers must observe completion or retain content through dismissal; it is not required
for every animation.

### Legacy Explicit Lifecycle Helpers

```typescript
import {
  animateModalIn,
  animateModalOut,
  animateSheetIn,
  animateSheetOut,
  animateAccordionExpand,
  animateAccordionCollapse
} from '@composable-svelte/core/animation';

// Usage
$effect(() => {
  if ($store.presentation.status === 'presenting') {
    animateModalIn(element).then(() => {
      store.dispatch({
        type: 'presentation',
        event: { type: 'presentationCompleted' }
      });
    });
  }
});
```

### Choosing the Public Motion Surface

1. **One declared element**: use `MotionElement` or `useMotion`.
2. **Several declared targets sharing one lifecycle**: use `useMotionGroup`.
3. **Application-owned completion or presentation lifetime**: retain the explicit
   `PresentationState` and completion-event pattern below.
4. **Overlay defaults**: do not assume managed presentation supplies an automatic animation;
   choose and declare the motion required by that view.

### All Animation Helpers (26 functions)

```typescript
import { animateModalIn, animateSheetIn, /* etc */ } from '@composable-svelte/core/animation';

// Modal (fade + scale)
animateModalIn(element), animateModalOut(element)
animateBackdropIn(element), animateBackdropOut(element)

// Sheet (slide from bottom)
animateSheetIn(element), animateSheetOut(element)

// Drawer (slide from side)
animateDrawerIn(element, side), animateDrawerOut(element, side)

// Alert (fade + scale, smaller)
animateAlertIn(element), animateAlertOut(element)

// Tooltip (fade + slight scale)
animateTooltipIn(element), animateTooltipOut(element)

// Toast (slide from edge)
animateToastIn(element), animateToastOut(element)

// Dropdown (fade + slide)
animateDropdownIn(element), animateDropdownOut(element)

// Sidebar (width expand/collapse)
animateSidebarExpand(element), animateSidebarCollapse(element)

// Popover (fade + scale)
animatePopoverIn(element), animatePopoverOut(element)

// NavigationStack (slide left/right)
animateStackPushIn(element), animateStackPushOut(element)
animateStackPopIn(element), animateStackPopOut(element)

// Accordion (height expand/collapse)
animateAccordionExpand(element), animateAccordionCollapse(element)
```

### CSS @keyframes (EXCEPTIONS ONLY)

```css
/* ✅ ALLOWED - Infinite loop */
@keyframes spin {
  to { transform: rotate(360deg); }
}

.spinner {
  animation: spin 1s linear infinite;
}

/* ✅ ALLOWED - Shimmer effect */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton {
  animation: shimmer 1.5s infinite;
}
```

**CSS Animations**:
- ✅ **Allowed**: Infinite loops (Spinner, Skeleton shimmer effects, Progress indicators)
- ❌ **Prohibited**: Hover states, Focus states, Click/Active states
---

## FLUID LAYOUT MOTION & STAGED ROUTING

Opt-in API for whole-layout motion across a route change. Introduced in core 0.14.0 (graphics 0.4.0 and media 0.6.0 for their providers). Ordinary routing, `AnimatedNavigationStack` and overlay presentation are unchanged. The full compiled example and contracts are in `packages/core/docs/fluid-motion.md`.

**Rules**

1. Declare `routing.staging` (`policy`, `commit`, `routeSlot`) on `defineApplication`. `policy` is pure:
   - It runs at admission: `false` → request result `rejected`.
   - It runs again at commit: `false` → outcome `vetoed`.
   - Do not refuse the current URL in it. The framework reports a current-URL request as `unchanged`, or `returned` (cancelling the pending transition) when one is pending.
2. Call `useStagedRoute(application)` (from `@composable-svelte/core/application`), `useParticipant()` and `useLayoutChoreography()` (from `@composable-svelte/core/application/motion`) during component initialization. Requests are bound to the calling page's owner. Retirement → `cancelled/ownerRetired`.
3. Plans (`defineChoreography`) need at least one track and use keyword easings only (`linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`). Shared tracks need the same participant key on both pages. Incoming tracks may add `slide: { dx, dy }` (px) next to `opacity`. Controls and focusable content slide but never fade, so keep buttons out of a fading incoming participant.
4. Reduced motion is framework-owned: the request commits without choreography. Never build empty plans for it.
5. `{ return: true }` abandons a pending transition (`returned`), or is `unchanged`. It never navigates. "Back" after a commit is an ordinary request with its own plan.
6. `ApplicationRoot` options are `{ dependencies, initial: { input, url } }`, with `url` injected by the entry point. Never read `window` while constructing the root.
7. The transaction outcome is recorded when the commit turn settles, at the cue or deadline. Tracks after `cueMs` are visual only.
8. Style participants normally (grid, flex, gradients, positioning, SVG, canvas, video): the framework represents them as painted. Never restyle a page to make it animate. Optional `visual: fluidMotion({ providers, preparationBudgetMs, nativeSnapshot, onDiagnostic })` on `defineApplication` adds representation providers (for example `graphicsVisualProvider()` from `@composable-svelte/graphics`), a preparation budget, native snapshots for cross-origin embeds, and public diagnostics. A provider's retained renderer continues visuals only: the retired page's store and dispatch never outlive it, and destination state is never seeded. Components find a configured provider with `useRepresentationProvider(name)`. When a within-page commit removes participants, render them inside `<Presence when={…}>`, with `useParticipant()` called by a component inside it, so they hand off before removal.

### Route page: participants, staged request, within-page choreography

```svelte
<script lang="ts">
  import { useStagedRoute, type PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import { useLayoutChoreography, useParticipant } from '@composable-svelte/core/application/motion';
  import { application, ITEMS, type CatalogAction, type CatalogState } from './model.js';
  import { openDetail, resizeList } from './motion.js';

  let { store }: PresentationFeatureViewProps<CatalogState, CatalogAction, {}> = $props();
  const route = useStagedRoute(application);
  const participant = useParticipant();
  const layout = useLayoutChoreography();
  const featuredOnly = $derived(store.state?.featuredOnly ?? false);
  const visible = $derived(ITEMS.filter(item => !featuredOnly || item.featured));

  function open(id: string) {
    route.request({ to: `/items/${id}` }, { motion: openDetail(id) });
  }
  function toggleFeatured() {
    layout.transition(resizeList, () => store.dispatch({ type: 'toggleFeatured' }));
  }
</script>

<button type="button" onclick={toggleFeatured}>{featuredOnly ? 'Show all' : 'Featured only'}</button>
<ul class="catalog" data-composable-scroll="catalog-list" use:participant={{ key: 'catalog-list' }}>
  {#each visible as item (item.id)}
    <li use:participant={{ key: `item-${item.id}` }}>
      <button type="button" onclick={() => open(item.id)}>{item.title}</button>
    </li>
  {/each}
</ul>
```

### Host

```svelte
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

### Testing: protocol events are not domain actions

```typescript
const store = createTestStore<AppState, AppAction>({
  initialState: initialAppState('/'),
  reducer: rootReducer,
  staging: { staging, serialize: state => state.url } // wraps the app's declaration
});
const handle = store.request({ to: '/items/pavilion' });
const status = handle.status;
if (status === 'pending' || status.type !== 'admitted') throw new Error('expected admission');
await store.receiveProtocol({ kind: 'request' });
await store.receiveProtocol({ kind: 'admitted' });
store.cue(status.transaction); // manual cue is the TestStore default
await store.receive({ type: 'navigate', url: '/items/pavilion' });
await store.receiveProtocol({ kind: 'terminal', outcome: { type: 'committed', route: 'accepted', attempted: 1, domainCommitted: true, url: '/items/pavilion', history: 'written' } });
await store.finish();
```

---

## URL ROUTING INTEGRATION

### Pattern: Sync Browser History with State

URL routing is state synchronization, not a separate navigation system. Use the router's pure functions for serialization/parsing.

```typescript
import { syncBrowserHistory } from '@composable-svelte/core/routing';
import type { Store } from '@composable-svelte/core';

// The destination type is inferred from `getDestination`'s return, which needs
// a typed store to infer *from*. Without one, `dest` in `destinationToAction`
// arrives as `{}` and `dest.state` does not compile.
interface BlogState {
  selectedPostId: string | null;
}
declare const store: Store<BlogState, AppAction>;

type PostDestination = { type: 'post'; state: { postId: string } };

// In client hydration. The destination type is given explicitly: TypeScript
// cannot unify it from `getDestination`'s return and `destinationToAction`'s
// parameter at the same time, and falls back to `{}`.
syncBrowserHistory<BlogState, AppAction, PostDestination>(store, {
  serializers: serializerConfig.serializers,
  parsers: parserConfig.parsers,
  // Map state → destination for URL serialization
  getDestination: (state) => {
    if (state.selectedPostId !== null) {
      return { type: 'post' as const, state: { postId: state.selectedPostId } };
    }
    return null;
  },
  // Map destination → action for back/forward navigation
  destinationToAction: (dest) => {
    if (dest?.type === 'post') {
      return { type: 'selectPost', postId: dest.state.postId };
    }
    return null;
  }
});
```

### Server-Side URL Parsing

```typescript
import { parseDestination } from './routing';

// In server route handler
async function renderApp(request: any, reply: any) {
  const posts = await loadPosts();
  const path = request.url;
  const requestedPostId = parsePostFromURL(path, posts[0]?.id || 1);

  const store = createStore({
    initialState: {
      ...initialState,
      posts,
      selectedPostId: requestedPostId,
      meta: computeMetaForPost(posts.find(p => p.id === requestedPostId))
    },
    reducer: appReducer,
    dependencies: {}
  });

  const html = renderToHTML(App, { store });
  reply.type('text/html').send(html);
}
```

### Router Configuration

> There is no `createRouter` builder. Routing is a pair of config objects —
> `parseDestination` for URL → state and `serializeDestination` for state → URL.

```typescript
import {
  parseDestination,
  serializeDestination,
  matchPath,
  type ParserConfig,
  type SerializerConfig
} from '@composable-svelte/core/routing';

type Destination = { type: 'post'; state: { postId: number } };

// `parsers` is an ordered list of functions, each returning a destination or
// null. Put more specific patterns first.
const parserConfig: ParserConfig<Destination> = {
  basePath: '/',
  parsers: [
    (path) => {
      const params = matchPath('/posts/:postId', path);
      return params ? { type: 'post', state: { postId: Number(params.postId) } } : null;
    }
  ]
};

// `serializers` maps destination.type -> a function over that destination's state.
const serializerConfig: SerializerConfig<Destination> = {
  basePath: '/',
  serializers: {
    post: (state) => `/posts/${state.postId}`
  }
};

const destination = parseDestination('/posts/42', parserConfig);
const path = serializeDestination({ type: 'post', state: { postId: 42 } }, serializerConfig);
```

`matchPath('/posts/:postId', path)` returns the params (or `null`) for a single
pattern. Working reference: `examples/url-routing/src/routing.ts`.

---

## NAVIGATION COMPONENTS HOW-TO

`Modal`, `Alert`, `Sheet`, `Drawer`, `Popover`, and `Sidebar` are dismissing managed
presentation families. Each styled component and primitive accepts a framework-minted
`PresentationView`; never pass a raw store or legacy scoped store.

```svelte
<Modal {store} ariaLabel="Details"><section use:surface>...</section></Modal>
<Alert {store} ariaLabel="Confirm"><section use:surface>...</section></Alert>
<Sheet {store} side="bottom"><section use:surface>...</section></Sheet>
<Drawer {store} side="right"><section use:surface>...</section></Drawer>
<Popover {store} style="top: 3rem; right: 1rem"><section use:surface>...</section></Popover>
<Sidebar {store} side="left" width="240px"><nav use:surface>...</nav></Sidebar>
```

Use `store.dispatch()` for feature actions and `store.dismiss()` for an owner-bound
view request. Reducers use `managedDismissDependency()` when dismissal must originate
from reducer logic.

`Tabs`, `NavigationStack`, and `AnimatedNavigationStack` are non-dismissing families
and retain their `ChildView` contract.

---

## COMPLETE EXAMPLE SHAPE

Keep application composition, view declaration, and component rendering separate:

1. Compose reducers with `ManagedIntegrationBuilder` and an optional/destination slot.
2. Build the application with `defineApplication`.
3. Declare component snippets with `defineViews`.
4. Mount `ApplicationRoot` and `ApplicationHost`.
5. Render the admitted view through `FeatureViews` and `FeatureOutlet`.

Inside each view snippet, pass the supplied `store` directly to the navigation
component and attach the supplied `surface` action to feature markup. Do not recreate
that plumbing inside child components and do not scope the raw application store into
a modal, sheet, drawer, alert, popover, or sidebar.

---

## COMMON ANTI-PATTERNS

### 1. Mixing Legacy and Managed Dismissal Plumbing

#### ❌ WRONG
```typescript
case 'destination': {
  // Redundant with the managed slot below.
  if (action.action.type === 'dismiss') {
    return [{ ...state, destination: null }, Effect.none()];
  }
  // ...
}

const composition = new ManagedIntegrationBuilder(reducer)
  .with(destinationSlot, childReducer)
  .build();
```

#### ✅ CORRECT
```typescript
// Managed boundary: the slot consumes dismissal and clears itself.
const composition = new ManagedIntegrationBuilder(reducer)
  .with(destinationSlot, childReducer)
  .build();

// Legacy reducer-only boundary (without ManagedIntegrationBuilder):
case 'destination': {
  if (action.action.type === 'dismiss') {
    return [{ ...state, destination: null }, Effect.none()];
  }

  const [newState, effect] = ifLetPresentation(...)(state, action, deps);
  return [newState, effect];
}
```

**WHY**: Managed composition owns slot dismissal. A legacy `ifLetPresentation` boundary
still handles `PresentationAction.dismiss` itself because it has no managed slot owner.

---

### 2. Not Using PresentationState for Animations

#### ❌ WRONG
```typescript
interface State {
  showModal: boolean; // Just a boolean, no animation lifecycle
}
```

#### ✅ CORRECT
```typescript
interface State {
  content: Content | null;
  presentation: PresentationState<Content>; // Full lifecycle
}
```

**WHY**: PresentationState tracks animation lifecycle (presenting → presented → dismissing), enabling state-driven animations.

---

### 3. CSS Transitions for Lifecycle Animations

#### ❌ WRONG
```css
.modal {
  transition: opacity 0.3s;
}
```

#### ✅ CORRECT
```typescript
$effect(() => {
  if ($store.presentation.status === 'presenting') {
    animateModalIn(element).then(() => {
      store.dispatch({ type: 'presentation', event: { type: 'presentationCompleted' } });
    });
  }
});
```

**WHY**: State-driven animations are testable, predictable, and composable.

---

## DECISION TOOLS

### Navigation Component Selection

```
What kind of overlay?
│
├─ Full-screen important action → Modal
├─ Bottom panel (mobile-first) → Sheet
├─ Side panel (navigation/settings) → Drawer
├─ Quick confirmation (yes/no) → Alert
└─ Contextual menu (dropdown) → Popover
```

### Animation Decision Tree

```
Does component animate?
├─ NO → No animation system needed
└─ YES → What kind?
    ├─ Infinite loop (spinner, shimmer) → CSS @keyframes ONLY
    ├─ Hover/focus/click → instant feedback unless application state drives the change
    ├─ Declared element/group state → MotionElement, useMotion, or useMotionGroup
    ├─ Whole-layout / cross-route fluid motion → useStagedRoute + defineChoreography + MotionPlane
    ├─ Intra-page layout choreography → useLayoutChoreography + defineChoreography
    └─ Store-observed completion/content lifetime → Motion One + PresentationState
```

---

## CHECKLISTS

### Navigation Feature Checklist

- [ ] 1. Add optional destination field to state (`DestinationState | null`)
- [ ] 2. Use discriminated union if multiple destination types
- [ ] 3. Define PresentationAction wrapper
- [ ] 4. Declare the child with `optionalSlot` or `destinationSlot`; managed dismissal clears it
- [ ] 5. Compose the child with `ManagedIntegrationBuilder`
- [ ] 6. Parent observes child completion actions
- [ ] 7. Declare a view with `defineViews` and render it through `FeatureViews` / `FeatureOutlet`
- [ ] 8. Add PresentationState if animations needed

### Animation Feature Checklist

- [ ] 1. Define the element or group recipe and valid states
- [ ] 2. Use `MotionElement`, `useMotion`, or `useMotionGroup` for the declared targets
- [ ] 3. Keep `PresentationState` only when reducers observe completion or retain content
- [ ] 4. If using that legacy explicit lifecycle, guard transitions and dispatch completion events
- [ ] 5. Preserve the final state and completion behavior under reduced motion
- [ ] 6. Test observable motion and, where present, the reducer lifecycle

### Fluid Motion Feature Checklist

- [ ] 1. Declare `routing.staging` in `defineApplication` with pure `policy`, `commit`, and `routeSlot`
- [ ] 2. Inject the URL: `initial: { input: url, url }` plus `dependencies`
- [ ] 3. Place `<MotionPlane />` inside `ApplicationHost`, outside transformed/filtered ancestors
- [ ] 4. Declare participants with `const participant = useParticipant()` and `use:participant={{ key }}` on both pages for shared tracks (`role: 'control'` for interactive ones)
- [ ] 5. Declare plans with `defineChoreography` (at least one track, keyword easing, `cueMs <= durationMs`)
- [ ] 6. Request via `useStagedRoute(application).request(intent, { motion: plan })`; "back" is an ordinary request
- [ ] 7. Mark scroll containers with `data-composable-scroll="<key>"` if `routing.scroll.containers` is used
- [ ] 8. Test with `TestStore` `staging: { staging, serialize }`: `receiveProtocol` for request/admitted/terminal, `receive` for the one domain action
- [ ] 9. Wrap content that a within-page commit removes in `<Presence when={…}>`, with `useParticipant()` called by a component inside it
- [ ] 10. Configure providers (`graphicsVisualProvider()`, `mediaVisualProvider()` or your own) with `visual: fluidMotion({ providers })`; declare unobservable content with `data-composable-representation`

---

## MANAGED PRESENTATION TEMPLATE

```svelte
<script lang="ts">
  import type { PresentationFeatureViewProps } from '@composable-svelte/core/application';
</script>

{#snippet featureView({ store, surface }: PresentationFeatureViewProps<State, Action>)}
  <Modal {store} ariaLabel="Feature">
    <section use:surface>
      {#if store.state}<Feature state={store.state} onAction={(action) => store.dispatch(action)} />{/if}
      <button onclick={() => store.dismiss()}>Close</button>
    </section>
  </Modal>
{/snippet}
```

Use the same boundary for the other dismissing component families. The application
composition supplies the view; the component owns rendering mechanics.

---

## STACK NAVIGATION

For multi-screen linear flows (wizards, drill-down navigation).

```typescript
import { push, pop, popToRoot, setPath, handleStackAction, topScreen, rootScreen, canGoBack, stackDepth } from '@composable-svelte/core/navigation';

// State: array of screens
interface AppState {
  stack: Screen[];
}

// Push a new screen
const [newStack, effect] = push(state.stack, newScreen);

// Pop current screen
const [newStack, effect] = pop(state.stack);

// Pop to root
const [newStack, effect] = popToRoot(state.stack);

// Replace entire path. `setPath` takes the *new* path — it replaces rather
// than appends, so the current stack is not an argument.
const [newStack, effect] = setPath([screen1, screen2]);

// Handle actions dispatched from screens. Six arguments: the deps come before
// the reducer, and the last two are how the stack is read from and written back
// into the parent state.
const [newState, effect] = handleStackAction(
  state,
  action,
  deps,
  screenReducer,
  (s) => s.stack,
  (s, stack) => ({ ...s, stack })
);

// Query helpers
const current = topScreen(state.stack);     // Last screen
const first = rootScreen(state.stack);      // First screen
const canPop = canGoBack(state.stack);      // stack.length > 1
const depth = stackDepth(state.stack);      // stack.length
```

### NavigationStack Component

> These take a `stack` array, not just a store, and the snippet is `children` —
> there is no `renderScreen`. A `renderScreen` snippet is silently never
> rendered, so the stack appears empty.

```svelte
<script lang="ts">
  import { NavigationStack, AnimatedNavigationStack } from '@composable-svelte/core/navigation-components';
</script>

<!-- Basic (no animations) -->
{#if store.state}
  <NavigationStack {store} stack={store.state.stack} onBack={() => store.dispatch({ type: 'popped' })}>
    {#snippet children({ currentScreen, canGoBack, onBack })}
      {@const screen = currentScreen as Screen | undefined}
      {#if screen?.type === 'step1'}
        <Step1 {store} />
      {:else if screen?.type === 'step2'}
        <Step2 {store} />
      {/if}
    {/snippet}
  </NavigationStack>
{/if}

<!-- With push/pop animations: also requires `presentation` -->
{#if store.state}
  <AnimatedNavigationStack
    {store}
    stack={store.state.stack}
    presentation={store.state.presentation}
    onBack={() => store.dispatch({ type: 'popped' })}
  >
    {#snippet children({ currentScreen })}
      <!-- same -->
    {/snippet}
  </AnimatedNavigationStack>
{/if}
```

The children snippet receives `{ visible, store, currentScreen, canGoBack, onBack }`.

---

## DESTINATION REDUCERS

Route actions to the correct child reducer based on destination type.

```typescript
import { createDestinationReducer, createDestination, isDestinationType, extractDestinationState } from '@composable-svelte/core/navigation';

// Create a reducer that routes to the correct child
const destinationReducer = createDestinationReducer({
  addItem: addItemReducer,
  editItem: editItemReducer,
  confirmDelete: confirmDeleteReducer
});

// The DSL: one object carrying the routing reducer and the matcher API.
// Members are `reducer`, `initial`, `extract`, `is`, `matchCase` and `match`.
const Destination = createDestination({
  addItem: addItemReducer,
  editItem: editItemReducer
});

const [next, effect] = Destination.reducer(state.destination, action, deps);

// Type guards
if (isDestinationType(state.destination, 'addItem')) {
  // state.destination is narrowed to { type: 'addItem'; state: AddItemState }
}

const addState = extractDestinationState(state.destination, 'addItem');
// addState: AddItemState | null
```

---

## MATCHERS

Pattern matching for nested presentation actions.

```typescript
import { matchPresentationAction, isActionAtPath, matchPaths, extractDestinationOnAction } from '@composable-svelte/core/navigation';

// Check if action matches a case path
if (isActionAtPath(action, 'addItem.saveButtonTapped')) {
  // Action is addItem's saveButtonTapped
}

// Match and extract. These take the action and the path — the *action* carries
// the child payload, so no state argument is involved.
const result = matchPresentationAction(action, 'editItem.saveButtonTapped');
if (result) {
  // result is the child action at that path
}

// Multi-case matching: (action, handlers)
const matched = matchPaths(action, {
  'addItem.saveButtonTapped': (addAction) => ({ type: 'add', action: addAction }),
  'editItem.saveButtonTapped': (editAction) => ({ type: 'edit', action: editAction })
});

// Extracting *state* does need the state, and a way to reach the destination
// within it: (action, state, path, getDestination).
const destState = extractDestinationOnAction(
  action,
  state,
  'confirmDelete.confirmButtonTapped',
  (s) => s.destination
);
```

---

## MANAGED DISMISS DEPENDENCY

Children can request dismissal through application-owned authority without capturing a
parent dispatch function or destination field name.

```typescript
import {
  managedDismissDependency,
  type DismissDependency
} from '@composable-svelte/core/application';

interface ChildDependencies {
  readonly dismiss: DismissDependency;
}

const dependencies: ChildDependencies = {
  dismiss: managedDismissDependency(async () => {
    await analytics.track('child_dismissed');
  })
};

case 'closeButtonTapped':
  return [state, deps.dismiss()];
```

`deps.dismiss()` is an `Effect`; return or batch it. Managed composition claims the
request for the exact optional/destination owner. Replacement, destruction, abort, or
an unsupported keyed/legacy lift makes a stale request inert.

---

## ELEMENT SCOPING

Scope a store to a specific element in a list (for forEach/forEachElement patterns).

```typescript
import { scopeToElement } from '@composable-svelte/core/navigation';

// Create a scoped store for a specific list item
// Positional: (parentStore, actionType, getArray, id). The action type is the
// wrapper's `type`; the store builds `{ type, id, action }` itself.
const itemStore = scopeToElement(
  parentStore,
  'item',
  (s) => s.items,
  item.id
);
```

---

## PHASE 3 DSL

Fluent APIs for reducer composition and store scoping.

```typescript
import { integrate, scopeTo } from '@composable-svelte/core/navigation';
import type { Reducer, Store } from '@composable-svelte/core';

// `.with(field, ...)` and `.into(field)` are both checked against the state
// type, so both need one: with an untyped reducer or store every field name
// resolves to `never`.
interface AppState {
  counter: CounterState;
  todos: TodosState;
  destination: { type: 'addItem'; state: AddItemState } | null;
}

declare const baseReducer: Reducer<AppState, AppAction>;
declare const store: Store<AppState, AppAction>;

// Fluent reducer integration
const appReducer = integrate(baseReducer)
  .with('counter', counterReducer)
  .with('todos', todoReducer)
  .build();

// Fluent store scoping for components
const childStore = scopeTo(store).into('destination').case('addItem');
// State/read/dispatch only; do not pass childStore to a presentation component.
```

---

## ALL NAVIGATION COMPONENTS

| Component | Purpose | Import from |
|-----------|---------|-------------|
| Modal | Full-screen overlay dialog | `core/navigation-components` |
| Sheet | Bottom drawer (mobile-first) | `core/navigation-components` |
| Drawer | Side panel (left/right) | `core/navigation-components` |
| Alert | Confirmation dialog | `core/navigation-components` |
| Popover | Contextual popup | `core/navigation-components` |
| Sidebar | Persistent side navigation | `core/navigation-components` |
| Tabs | Horizontal tabbed navigation | `core/navigation-components` |
| NavigationStack | Multi-screen stack | `core/navigation-components` |
| AnimatedNavigationStack | Stack with push/pop animations | `core/navigation-components` |

Each component also has a `*Primitive` variant for advanced customization (e.g., `ModalPrimitive`, `SheetPrimitive`).

---

## SUMMARY

This skill covers navigation and animation patterns for Composable Svelte:

1. **Critical Rule**: State-driven animations use declared public motion recipes; explicit `PresentationState` remains for application-observed lifecycles
2. **Tree-Based Navigation**: Non-null = presented, null = dismissed
3. **Stack Navigation**: push, pop, popToRoot, handleStackAction for linear flows
4. **Managed Composition**: optional/destination slots own presentation dismissal; `ifLetPresentation` remains a legacy reducer-only boundary
5. **Destination Reducers**: createDestinationReducer, createDestination for enum routing
6. **Matchers**: matchPresentationAction, isActionAtPath for pattern matching
7. **Parent Observation**: React to child completion/cancellation
8. **Managed Dismiss Dependency**: application-owned exact-owner self-dismissal
8b. **Cancellation Groups**: a presentation's effects are cancelled on dismiss, a parent null, a case change, a pop and a shrinking setPath (`ifLetPresentation`, `integrate`, `handleStackAction`); by hand, `Effect.inGroup` + `Effect.cancelGroup`
9. **PresentationState Lifecycle**: legacy explicit idle → presenting → presented → dismissing → idle when application state observes completion
10. **Public Motion**: `MotionElement` / `useMotion` for one target and `useMotionGroup` for a complete declared target set
11. **URL Routing**: Sync browser history with state
12. **Navigation components**: six dismissing PresentationView families plus non-dismissing ChildView stacks and tabs
13. **Fluid Layout Motion**: Whole-layout and cross-route transitions via `useStagedRoute`, `defineChoreography`, `<MotionPlane />`, and `useLayoutChoreography`

**Remember**: Use the public declared-motion APIs for element and group motion, and staged routing (`useStagedRoute` + `defineChoreography`) for cross-route fluid transitions. Retain an explicit `PresentationState` lifecycle only when the application must observe completion or retain content; navigation overlays do not gain animation defaults automatically.

For core architecture patterns, see **composable-svelte-core** skill.
For testing navigation flows, see **composable-svelte-testing** skill.
For component library reference, see **composable-svelte-components** skill.
For SSR with navigation, see **composable-svelte-ssr** skill.
