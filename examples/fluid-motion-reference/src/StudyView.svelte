<script lang="ts">
  import { useStagedRoute, type PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import { useParticipant } from '@composable-svelte/core/application/motion';
  import { applicationDefinition, works, type Zoom, type StudyPageState, type StudyPageAction } from './model.js';
  import { cardKey, closeStudy } from './motion.js';
  import { motionPreference } from './preferences.js';
  import PavilionArtwork from './PavilionArtwork.svelte';
  import PavilionModel from './PavilionModel.svelte';
  import Turntable from './Turntable.svelte';

  let { store }: PresentationFeatureViewProps<StudyPageState, StudyPageAction, {}> = $props();

  const route = useStagedRoute(applicationDefinition);
  const participant = useParticipant();
  const preference = motionPreference();
  /** Undefined only while this page is being replaced by another. */
  const current = $derived(store.state);
  const work = $derived(works.find(entry => entry.id === current?.id) ?? works[0]!);
  const zooms: readonly Zoom[] = [1, 1.5, 2];
</script>

{#if current}
{@const state = current}

<main data-page="study" class="card-expanded-page">
  <!-- Control box separate from the decorative surface: Back is outside the shared study surface, in a
       positioned nav that paints above the route plane (see .study-nav). -->
  <nav class="study-nav" aria-label="Study">
    <button data-close-study type="button" class="btn-secondary" onclick={() => route.request({ to: '/' }, { motion: closeStudy(state.id, preference.reduced) })}>
      <span aria-hidden="true">←</span> Back to the catalogue
    </button>
  </nav>
  <article class="expanded-card-container" aria-labelledby="study-title">
    <div data-study use:participant={{ key: cardKey(state.id) }} class="expanded-header study-surface">
      <span class="card-badge">{work.label} · study</span>
      <h1 id="study-title" data-route-focus class="study-title">{work.title}</h1>
      <p class="muted">{work.summary}</p>
      <div class="study-art">
        <PavilionModel height="260px" />
        <PavilionArtwork still={preference.reduced} />
      </div>
    </div>

    <section data-study-tools use:participant={{ key: 'study-tools' }} class="interactive-panel" aria-label="Model inspection">
      <div class="interactive-controls">
        <Turntable />
        <span class="muted" id="zoom-label">Zoom</span>
        <div role="group" aria-labelledby="zoom-label" class="zoom-group">
          {#each zooms as zoom (zoom)}
            <button data-zoom={zoom} type="button" class="nav-btn" class:active={state.zoom === zoom} aria-pressed={state.zoom === zoom} onclick={() => store.dispatch({ type: 'setZoom', zoom })}>
              {zoom}×
            </button>
          {/each}
        </div>
        <label class="pref-label">
          <input data-overlay="stress" type="checkbox" checked={state.overlays.stress} onchange={() => store.dispatch({ type: 'toggleOverlay', overlay: 'stress' })} />
          Stress lines
        </label>
        <label class="pref-label">
          <input data-overlay="solar" type="checkbox" checked={state.overlays.solar} onchange={() => store.dispatch({ type: 'toggleOverlay', overlay: 'solar' })} />
          Solar gain
        </label>
      </div>

      <figure class="zoom-viewport">
        <div class="model" class:stress={state.overlays.stress} class:solar={state.overlays.solar} style:transform="scale({state.zoom})">
          Membrane model · {state.zoom}×
        </div>
        <figcaption class="muted small">Schematic membrane with {state.overlays.stress ? 'stress lines' : 'no stress lines'}{state.overlays.solar ? ' and solar gain' : ''}.</figcaption>
      </figure>

      <label for="study-notes" class="notes-label">Your study notes</label>
      <textarea id="study-notes" data-notes class="notes-input" value={state.notes} oninput={event => store.dispatch({ type: 'editNotes', notes: event.currentTarget.value })}></textarea>
      <div class="study-actions">
        <button data-save type="button" class="btn-primary" disabled={state.saved || state.notes.length === 0} onclick={() => store.dispatch({ type: 'save' })}>
          {state.saved ? 'Notes saved' : 'Save notes'}
        </button>
      </div>
    </section>
  </article>
</main>
{/if}

<style>
  .study-art { display: grid; grid-template-columns: 3fr 2fr; gap: 1rem; align-items: center; margin-top: 1rem; }
</style>
