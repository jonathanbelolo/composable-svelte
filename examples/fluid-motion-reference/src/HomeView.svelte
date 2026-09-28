<script lang="ts">
  import {
    useStagedRoute,
    useApplication,
    scopeTo,
    type PresentationFeatureViewProps,
    type PresentationView
  } from '@composable-svelte/core/application';
  import { useParticipant, useLayoutChoreography } from '@composable-svelte/core/application/motion';
  import {
    applicationDefinition,
    visibleWorks,
    curatorSlot,
    confirmAlertSlot,
    drawerSlot,
    type Category,
    type HomePageState,
    type HomePageAction,
    type CuratorModalState,
    type CuratorModalAction,
    type ConfirmAlertState,
    type ConfirmAlertAction,
    type DrawerState,
    type DrawerAction
  } from './model.js';
  import { cardKey, toDossier, openStudy, featureWork, filterCatalog, reconfigure } from './motion.js';
  import { motionPreference } from './preferences.js';
  import PavilionArtwork from './PavilionArtwork.svelte';
  import PavilionModel from './PavilionModel.svelte';
  import Turntable from './Turntable.svelte';
  import CuratorModal from './CuratorModal.svelte';
  import ArchiveDrawer from './ArchiveDrawer.svelte';

  let { store }: PresentationFeatureViewProps<HomePageState, HomePageAction, {}> = $props();

  const app = useApplication(applicationDefinition);
  const route = useStagedRoute(applicationDefinition);
  const participant = useParticipant();
  const layout = useLayoutChoreography();
  const preference = motionPreference();

  const appState = $derived(app.store.state);

  // Capability identity is WeakSet-backed: use raw state to prevent deep Svelte proxy wrapping
  let boundCurator = $state.raw<PresentationView<CuratorModalState, CuratorModalAction> | undefined>(undefined);
  let boundConfirmAlert = $state.raw<PresentationView<ConfirmAlertState, ConfirmAlertAction> | undefined>(undefined);
  let boundDrawer = $state.raw<PresentationView<DrawerState, DrawerAction> | undefined>(undefined);

  $effect(() => {
    boundCurator = appState.curator !== null ? scopeTo(app.store, curatorSlot) : undefined;
  });

  $effect(() => {
    boundConfirmAlert = appState.confirmAlert !== null ? scopeTo(app.store, confirmAlertSlot) : undefined;
  });

  $effect(() => {
    boundDrawer = appState.drawer !== null ? scopeTo(app.store, drawerSlot) : undefined;
  });

  /** Undefined only while this page is being replaced by another. */
  const current = $derived(store.state);
  const shown = $derived(current ? visibleWorks(current) : []);
  const reading = $derived(current?.layout === 'reading');

  const categories: ReadonlyArray<{ readonly id: Category; readonly label: string }> = [
    { id: 'all', label: 'All works' },
    { id: 'pneumatic', label: 'Pneumatics' },
    { id: 'kinetic', label: 'Kinetic shells' }
  ];

  /** Layout changes are explicit business actions; the choreography only bridges the two layouts. */
  function change(plan: () => Parameters<typeof layout.transition>[0], action: HomePageAction) {
    if (preference.reduced) store.dispatch(action);
    else layout.transition(plan(), () => store.dispatch(action));
  }
</script>

{#if current}
{@const state = current}

<main data-page="home" class="home-main" class:reading>
  <section data-hero use:participant={{ key: 'hero' }} class="hero-banner" aria-labelledby="home-title">
    <span class="hero-tag">Annual architecture archive</span>
    <h1 id="home-title" data-route-focus class="hero-title">Horizon Retrospective 2026</h1>
    {#if !reading}
      <p data-body use:participant={{ key: 'body' }} class="hero-subtitle">
        A curated survey of pneumatic structures, fluid envelopes and kinetic public spaces.
      </p>
    {/if}
    <button data-open-dossier type="button" class="btn-primary" onclick={() => route.request({ to: '/dossier' }, { motion: toDossier(preference.reduced) })}>
      Read the retrospective dossier
    </button>
  </section>

  <nav aria-label="Catalogue">
    <div data-nav use:participant={{ key: 'nav', role: 'control' }} class="nav-bar">
    {#each categories as category (category.id)}
      <button
        type="button"
        class="nav-btn"
        class:active={state.category === category.id}
        aria-pressed={state.category === category.id}
        onclick={() => change(filterCatalog, { type: 'setCategory', category: category.id })}
      >
        {category.label}
      </button>
    {/each}
    <button
      data-reading-layout
      type="button"
      class="btn-secondary layout-toggle"
      aria-pressed={reading}
      onclick={() => change(() => reconfigure(!reading), { type: 'setLayout', layout: reading ? 'gallery' : 'reading' })}
    >
      {reading ? 'Back to gallery' : 'Reading room'}
    </button>
    <button
      data-open-drawer
      type="button"
      class="btn-secondary"
      onclick={() => store.dispatch({ type: 'openDrawer' })}
    >
      Technical Archive
    </button>
    </div>
  </nav>

  <div class="home-layout">
    <section data-catalog use:participant={{ key: 'catalog' }} class="catalog-grid" aria-label="Featured installations">
      {#each shown as work (work.id)}
        <article data-card={work.id} use:participant={{ key: cardKey(work.id) }} class="exhibition-card" class:featured={work.id === state.featured}>
          <div class="card-top">
            <span class="card-badge">
              <svg class="glyph" viewBox="0 0 16 16" aria-hidden="true">
                {#if work.category === 'pneumatic'}<path d="M2 12 Q8 1 14 12Z" fill="currentColor" />{:else}<path d="M2 13 5 4 8 11 11 3 14 13" fill="none" stroke="currentColor" stroke-width="1.8" />{/if}
              </svg>
              {work.label}
            </span>
            {#if work.id === 'pavilion'}
              <button data-applaud type="button" class="btn-secondary btn-small" aria-label="Applaud this work ({state.applause} so far)" onclick={() => store.dispatch({ type: 'applaud' })}>
                ♥ <span data-applause>{state.applause}</span>
              </button>
            {/if}
          </div>
          {#if work.id === 'pavilion'}
            <figure data-pavilion-art use:participant={{ key: 'pavilion-art' }} class="card-art">
              <PavilionArtwork still={preference.reduced} />
              <PavilionModel height="140px" />
            </figure>
          {/if}
          <h2 class="card-title">{work.title}</h2>
          <p class="card-desc">{work.summary}</p>
          <div class="card-actions">
            {#if work.id === 'pavilion'}
              <button data-open-study type="button" class="btn-primary" onclick={() => route.request({ to: '/study' }, { motion: openStudy(work.id, preference.reduced) })}>
                Open study
              </button>
              <Turntable />
            {/if}
            <button
              data-open-curator={work.id}
              type="button"
              class="btn-secondary"
              onclick={() => store.dispatch({ type: 'openCurator', id: work.id })}
            >
              Curator Specs
            </button>
            {#if work.id !== state.featured}
              <button data-feature={work.id} type="button" class="btn-secondary" onclick={() => change(() => featureWork(work.id), { type: 'feature', id: work.id })}>
                Feature first
              </button>
            {/if}
          </div>
        </article>
      {/each}
    </section>

    <aside aria-labelledby="reading-title">
      <div data-reading-list use:participant={{ key: 'reading-list' }} class="reading-list-panel">
      <div class="reading-list-header">
        <h2 id="reading-title" class="panel-title">Curator's reading list</h2>
        <span class="muted">6 volumes</span>
      </div>
      {#if reading}
        <p data-reading-note use:participant={{ key: 'reading-note' }} class="reading-note">
          The reading room gathers the texts that shaped this year's selection. Scroll the list; your place is kept when you come back.
        </p>
      {/if}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <ul class="reading-list-scroll" data-composable-scroll="reading-list" tabindex="0" aria-label="Reference volumes">
        {#each volumes as volume (volume.title)}
          <li class="reading-list-item">
            <div>
              <strong>{volume.title}</strong>
              <div class="muted small">{volume.source}</div>
            </div>
            <span class="mono small">{volume.volume}</span>
          </li>
        {/each}
      </ul>
      </div>
    </aside>
  </div>
</main>

  <!-- Stacked overlay orchestration: modal, nested alert, and drawer layers scoped to the page owner -->
  {#if appState.curatorPresentation.status !== 'idle'}
    {@const activeWorkId = appState.curatorPresentation.content?.spec.id ?? appState.curator?.spec.id}
    {#if activeWorkId}
      {#key activeWorkId}
        <CuratorModal
          workId={activeWorkId}
          store={boundCurator}
          alertStore={boundConfirmAlert}
          presentation={appState.curatorPresentation}
          alertPresentation={appState.confirmAlertPresentation}
          dispatch={app.store.dispatch}
        />
      {/key}
    {/if}
  {/if}

  {#if appState.drawerPresentation.status !== 'idle'}
    <ArchiveDrawer
      store={boundDrawer}
      presentation={appState.drawerPresentation}
      dispatch={app.store.dispatch}
    />
  {/if}
{/if}

<script lang="ts" module>
  const volumes = [
    { title: 'Tensile Membranes & Elastic Boundaries', source: 'Frei Otto Institute, 1982', volume: 'Vol. I' },
    { title: 'Active Thermal Envelopes in Modern Practice', source: 'Banham & Associates, 1999', volume: 'Vol. II' },
    { title: 'Kinetic Morphologies: Computational Joinery', source: 'Computational Architecture Press, 2021', volume: 'Vol. III' },
    { title: 'Atmospheric Architecture & Sensory Ecology', source: 'Pallasmaa & Zumthor Colloquium, 2025', volume: 'Vol. IV' },
    { title: 'Pneumatic Structures: A Handbook', source: 'Herzog, 1976', volume: 'Vol. V' },
    { title: 'Soft Cities and Inflatable Commons', source: 'Urban Membranes Review, 2023', volume: 'Vol. VI' }
  ];
</script>

<style>
  /* Rich card surface: gradient ribbon (generated content), a tilted badge and a clipped art frame. */
  .exhibition-card { position: relative; }
  .exhibition-card.featured::before {
    content: '';
    position: absolute;
    inset: 0 0 auto 0;
    height: 4px;
    border-radius: 12px 12px 0 0;
    background: linear-gradient(90deg, #38bdf8, #a855f7 55%, #f59e0b);
  }
  .card-badge { display: inline-flex; align-items: center; gap: 0.35rem; transform: rotate(-1.5deg); }
  .glyph { width: 0.9rem; height: 0.9rem; }
  .card-art {
    display: grid;
    grid-template-columns: 3fr 2fr;
    gap: 0.5rem;
    margin: 0.75rem 0;
    clip-path: inset(0 round 14px);
  }
</style>
