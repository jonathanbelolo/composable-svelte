<script lang="ts">
  import { useStagedRoute, type PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import { useParticipant } from '@composable-svelte/core/application/motion';
  import { applicationDefinition, type DossierTab, type DetailPageState, type DetailPageAction } from './model.js';
  import { fromDossier } from './motion.js';
  import { motionPreference } from './preferences.js';

  let { store }: PresentationFeatureViewProps<DetailPageState, DetailPageAction, {}> = $props();

  const route = useStagedRoute(applicationDefinition);
  const participant = useParticipant();
  const preference = motionPreference();
  /** Undefined only while this page is being replaced by another. */
  const current = $derived(store.state);

  let airflowVideo: HTMLVideoElement | undefined = $state();
  // The page's own media element follows explicit dossier state (which starts paused under reduced motion).
  $effect(() => {
    const video = airflowVideo;
    if (!video || !current) return;
    if (current.airflow === 'playing') void video.play().catch(() => {});
    else video.pause();
  });

  const tabs: ReadonlyArray<{ readonly id: DossierTab; readonly label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'structure', label: 'Structure' },
    { id: 'commentary', label: 'Curator commentary' }
  ];
</script>

{#if current}
{@const state = current}

<div data-page="detail" class="detail-page">
  <header class="hero-header-compact">
    <div data-hero use:participant={{ key: 'hero', role: 'control' }} class="hero-compact">
      <button data-back type="button" class="btn-secondary" onclick={() => route.request({ to: '/' }, { motion: fromDossier(preference.reduced) })}>
        <span aria-hidden="true">←</span> Catalogue
      </button>
      <div>
        <span class="hero-tag">Retrospective dossier</span>
        <h1 data-route-focus class="hero-title-compact">Horizon Retrospective 2026</h1>
      </div>
    </div>
    <p data-status use:participant={{ key: 'status' }} class="status-badge">Permanent collection · entry 804</p>
  </header>

  <main class="detail-container">
    <article class="dossier-main" aria-labelledby="dossier-title">
      <div data-intro use:participant={{ key: 'intro' }} class="dossier-intro intro-media">
        <p>
          Curatorial documentation on tensile membranes, thermodynamic envelopes and continuous fluid skins shown across
          this year's triennials.
        </p>
        <!-- Muted, captionless visual loop (no audio track); its playback is explicit dossier state. It is its own
             control-free participant so its copy can linger, still playing, after the dossier retires. -->
        <div data-airflow-frame use:participant={{ key: 'airflow' }} class="airflow-frame">
          <video bind:this={airflowVideo} data-airflow-video src="/media/airflow-study.webm" muted loop playsinline preload="auto" aria-describedby="airflow-caption"></video>
        </div>
      </div>
      <p id="airflow-caption" class="airflow-caption muted">
        Airflow study: a four-second wind-tunnel simulation over the membrane, looping.
        <button data-airflow type="button" class="btn-secondary btn-small" aria-pressed={state.airflow === 'paused'} onclick={() => store.dispatch({ type: 'toggleAirflow' })}>
          {state.airflow === 'playing' ? 'Pause' : 'Play'}
        </button>
      </p>
      <div class="dossier-heading">
        <div>
          <h2 id="dossier-title">Pavilion of Light & Atmosphere</h2>
          <p class="muted">Commissioned 2024 · Elysia Vance & Partners</p>
        </div>
        <button data-bookmark type="button" class="btn-secondary" aria-pressed={state.bookmarked} onclick={() => store.dispatch({ type: 'toggleBookmark' })}>
          {state.bookmarked ? '★ Bookmarked' : '☆ Bookmark'}
        </button>
      </div>

      <div class="nav-bar" role="group" aria-label="Dossier sections">
        {#each tabs as tab (tab.id)}
          <button type="button" class="nav-btn" class:active={state.tab === tab.id} aria-pressed={state.tab === tab.id} onclick={() => store.dispatch({ type: 'setTab', tab: tab.id })}>
            {tab.label}
          </button>
        {/each}
      </div>

      {#if state.tab === 'overview'}
        <section aria-label="Overview" class="prose">
          <p>
            An ultra-thin PTFE membrane is tensioned across twelve CNC-milled timber arches. The geometry diffuses daylight
            while steering prevailing wind into low-velocity cooling flues below the floor.
          </p>
          <p>Staggered membrane layers regulate temperature and shade through changing weather while keeping the interior generous.</p>
        </section>
      {:else if state.tab === 'structure'}
        <section aria-label="Structure">
          <dl class="spec-grid mono">
            <dt>Span</dt><dd>38.4 m</dd>
            <dt>Clear height</dt><dd>9.2 m</dd>
            <dt>Membrane preload</dt><dd>4.8 kN/m</dd>
            <dt>Arches</dt><dd>12 × glulam larch</dd>
          </dl>
        </section>
      {:else}
        <section aria-label="Curator commentary">
          <blockquote class="quote">
            “Surfaces stop being static boundaries and become responsive mediators of climate.” — Dr. M. Aris Thorne
          </blockquote>
        </section>
      {/if}
    </article>

    <aside class="dossier-sidebar" aria-label="Project facts">
      <div class="sidebar-card">
        <h2 class="panel-title">Project facts</h2>
        <dl class="spec-grid">
          <dt>Location</dt><dd>Venice Architecture Biennale</dd>
          <dt>Footprint</dt><dd>420 m²</dd>
          <dt>Structure</dt><dd>Tensile shell</dd>
        </dl>
      </div>
    </aside>
  </main>
</div>
{/if}

<style>
  .intro-media { display: grid; grid-template-columns: 1fr 200px; gap: 1rem; align-items: center; }
  .intro-media p { margin: 0; }
  .airflow-frame { width: 200px; }
  .intro-media video { display: block; width: 200px; aspect-ratio: 16 / 9; border-radius: 10px; background: #0c0f17; }
  .airflow-caption { display: flex; align-items: center; gap: 0.75rem; margin: -0.75rem 0 1.25rem; font-size: 0.8rem; }
</style>
