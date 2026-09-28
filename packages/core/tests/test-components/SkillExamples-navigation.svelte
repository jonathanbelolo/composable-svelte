<script lang="ts">
  /**
   * Live markup pins for every Svelte fence in the managed-presentation and fluid-motion
   * sections of `.claude/skills/composable-svelte-navigation/SKILL.md`.
   */
  import type { Component } from 'svelte';
  import {
    Alert,
    AnimatedNavigationStack,
    Drawer,
    Modal,
    NavigationStack,
    Popover,
    Sheet,
    Sidebar
  } from '../../src/lib/navigation-components/index.js';
  import type { PresentationView } from '../../src/lib/navigation/managed-integration.js';
  import type { PresentationFeatureViewProps } from '../../src/lib/application/view-definition.js';
  import type { PresentationState } from '../../src/lib/navigation/types.js';
  import { Effect } from '../../src/lib/effect.js';
  import { createDestination } from '../../src/lib/navigation/destination.js';
  import type { Reducer } from '../../src/lib/types.js';
  import type { PresentationAction } from '../../src/lib/navigation/types.js';
  import {
    ApplicationHost,
    ApplicationRoot,
    FeatureOutlet,
    FeatureViews,
    defineApplication,
    defineViews,
    destinationSlot,
    ManagedIntegrationBuilder,
    useStagedRoute
  } from '../../src/lib/application/index.js';
  import {
    MotionPlane,
    defineChoreography,
    useLayoutChoreography,
    useParticipant
  } from '../../src/lib/application/motion-public.js';
  // Overlay orchestration fence: the plan-free binding keeps this pin compiling against source while the
  // public export and scoped selectors land; the markup below is what the skill-examples guard compares.
  import { useOverlayMotion } from '../../src/lib/application/renderer/choreography/overlay-motion.js';

  // Fluid-motion section: a minimal staged application for the Host and route-page fences.
  interface CatalogState { readonly featuredOnly: boolean }
  type CatalogAction = { type: 'toggleFeatured' };
  const catalogReducer: Reducer<CatalogState, CatalogAction> = (state) => [{ ...state, featuredOnly: !state.featuredOnly }, Effect.none()];
  const pages = createDestination({ catalog: catalogReducer });
  type PagesAction = typeof pages._types.Action;
  interface AppState { readonly url: string; readonly page: typeof pages._types.State | null }
  type AppAction = { type: 'navigate'; url: string } | { type: 'page'; action: PresentationAction<PagesAction> };
  const rootReducer: Reducer<AppState, AppAction> = (state, action) =>
    action.type === 'navigate' ? [{ ...state, url: action.url }, Effect.none()] : [state, Effect.none()];
  const pageSlot = destinationSlot<AppState, AppAction>()('page', pages);
  const composition = new ManagedIntegrationBuilder(rootReducer).with(pageSlot, { replaceOn: (action) => action.type === 'navigate' }).build();
  const application = defineApplication(composition, {
    initialState: (url: string): AppState => ({ url, page: pages.initial('catalog', { featuredOnly: false }) }),
    routing: {
      fragment: 'native',
      serialize: (state) => state.url,
      request: (url) => ({ action: { type: 'navigate', url }, expectedURL: url }),
      staging: {
        policy: (state) => state.page !== null,
        commit: (intent: { readonly to: string }) => ({ action: { type: 'navigate', url: intent.to }, expectedURL: intent.to }),
        routeSlot: pageSlot
      }
    }
  });
  const ITEMS = [{ id: 'pavilion', title: 'Pavilion of Light', featured: true }];
  const openDetail = (id: string) => defineChoreography({ cueMs: 200, durationMs: 400, tracks: [{ participant: `item-${id}`, side: 'shared', startMs: 0, durationMs: 400 }] });
  const resizeList = defineChoreography({ cueMs: 0, durationMs: 300, tracks: [{ participant: 'catalog-list', side: 'shared', startMs: 0, durationMs: 300 }] });

  type Screen = { type: 'step1' } | { type: 'step2' };
  interface State {
    stack: Screen[];
    presentation: PresentationState<Screen>;
  }
  type Action =
    | { type: 'save' }
    | { type: 'popped' };

  type LiveStore = PresentationView<State, Action>;
  type Surface = (node: HTMLElement) => void | { destroy?: () => void };

  let {
    store,
    surface,
    presentation,
    dispatch,
    Feature,
    Step1,
    Step2,
    catalogStore,
    CatalogPage,
    url
  }: {
    store: LiveStore;
    surface: Surface;
    presentation: PresentationState<unknown>;
    dispatch: (action: { type: 'presentationCompleted' | 'dismissalCompleted' }) => void;
    Feature: Component<{ state: State; onAction: (action: Action) => void }>;
    Step1: Component<{ store: LiveStore }>;
    Step2: Component<{ store: LiveStore }>;
    catalogStore: PresentationFeatureViewProps<CatalogState, CatalogAction, {}>['store'];
    CatalogPage: Component<PresentationFeatureViewProps<CatalogState, CatalogAction, {}>>;
    url: string;
  } = $props();

  const viewPlan = defineViews(composition, { page: { cases: { catalog: { render: CatalogPage } } } });
  const route = useStagedRoute(application);
  const participant = useParticipant();
  const dialog = useOverlayMotion();
  const layout = useLayoutChoreography();
  const featuredOnly = $derived(catalogStore.state?.featuredOnly ?? false);
  const visible = $derived(ITEMS.filter((item) => !featuredOnly || item.featured));
  function open(id: string) {
    route.request({ to: `/items/${id}` }, { motion: openDetail(id) });
  }
  function toggleFeatured() {
    layout.transition(resizeList, () => catalogStore.dispatch({ type: 'toggleFeatured' }));
  }
</script>

{#snippet modalView({ store, surface }: PresentationFeatureViewProps<State, Action>)}
  <Modal {store} ariaLabel="Edit item">
    <form use:surface>
      <button onclick={() => store.dispatch({ type: 'save' })}>Save</button>
      <button onclick={() => store.dismiss()}>Cancel</button>
    </form>
  </Modal>
{/snippet}

<Modal
  {store}
  {presentation}
  onPresentationComplete={() => dispatch({ type: 'presentationCompleted' })}
  onDismissalComplete={() => dispatch({ type: 'dismissalCompleted' })}
>
  <section use:surface>...</section>
</Modal>

<div use:participant={{ key: 'card' }}>Pavilion of Light</div>
<Modal
  {store}
  {presentation}
  motion={dialog}
  onPresentationComplete={() => dispatch({ type: 'presentationCompleted' })}
  onDismissalComplete={() => dispatch({ type: 'dismissalCompleted' })}
>
  <img use:participant={{ key: 'hero' }} src="/pavilion.jpg" alt="Pavilion of Light" />
</Modal>

<Modal {store} ariaLabel="Details"><section use:surface>...</section></Modal>
<Alert {store} ariaLabel="Confirm"><section use:surface>...</section></Alert>
<Sheet {store} side="bottom"><section use:surface>...</section></Sheet>
<Drawer {store} side="right"><section use:surface>...</section></Drawer>
<Popover {store} style="top: 3rem; right: 1rem"><section use:surface>...</section></Popover>
<Sidebar {store} side="left" width="240px"><nav use:surface>...</nav></Sidebar>

{#snippet featureView({ store, surface }: PresentationFeatureViewProps<State, Action>)}
  <Modal {store} ariaLabel="Feature">
    <section use:surface>
      {#if store.state}<Feature state={store.state} onAction={(action) => store.dispatch(action)} />{/if}
      <button onclick={() => store.dismiss()}>Close</button>
    </section>
  </Modal>
{/snippet}

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

<!-- Fluid motion: route page -->
<button type="button" onclick={toggleFeatured}>{featuredOnly ? 'Show all' : 'Featured only'}</button>
<ul class="catalog" data-composable-scroll="catalog-list" use:participant={{ key: 'catalog-list' }}>
  {#each visible as item (item.id)}
    <li use:participant={{ key: `item-${item.id}` }}>
      <button type="button" onclick={() => open(item.id)}>{item.title}</button>
    </li>
  {/each}
</ul>

<!-- Fluid motion: Host -->
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
