<script lang="ts">
  import { useOverlayMotion } from '@composable-svelte/core/application/motion';
  import { Drawer } from '@composable-svelte/core/navigation-components';
  import type { PresentationView } from '@composable-svelte/core/application';
  import type { PresentationState } from '@composable-svelte/core/navigation';
  import type { AppAction, DrawerState, DrawerAction } from './model.js';
  import { works } from './model.js';
  import { drawerPlans } from './overlay-motion.js';
  import { motionPreference } from './preferences.js';

  interface Props {
    store?: PresentationView<DrawerState, DrawerAction> | undefined;
    presentation?: PresentationState<DrawerState> | undefined;
    dispatch: (action: AppAction) => void;
  }

  let {
    store,
    presentation,
    dispatch
  }: Props = $props();

  const preference = motionPreference();

  // Declarative overlay motion for the drawer instance
  const drawerMotion = useOverlayMotion((overlay) => {
    return drawerPlans(overlay, preference.reduced);
  });
</script>

<!-- Managed Drawer: owns backdrop, slide transform, scroll lock, focus trap, and Escape/Outside dismissal -->
<Drawer
  {store}
  {presentation}
  motion={drawerMotion}
  side="right"
  width="min(440px, 90vw)"
  onPresentationComplete={() => {
    dispatch({
      type: 'drawerPresentation',
      event: { type: 'presentationCompleted' }
    });
  }}
  onDismissalComplete={() => {
    dispatch({
      type: 'drawerPresentation',
      event: { type: 'dismissalCompleted' }
    });
  }}
  ariaLabelledby="archive-drawer-title"
  backdropClass="drawer-backdrop"
  class="drawer-panel"
>
  {#snippet children({ visible, store: snippetStore })}
    {#if snippetStore?.state}
      {@const content = (snippetStore.state as DrawerState)}
      {@const activeWork = works.find(w => w.id === content.workId) ?? works[0]!}
      {@const currentTab = content.tab}

      <aside data-drawer-content class="drawer-panel-inner" aria-label="Archive technical specifications drawer">
        <header class="drawer-header">
          <div>
            <span class="card-badge">Technical Register</span>
            <h2 id="archive-drawer-title" class="drawer-title">Archive Specifications</h2>
          </div>
          <button
            data-drawer-close
            type="button"
            class="btn-secondary btn-small"
            aria-label="Close specifications drawer"
            onclick={() => snippetStore.dismiss()}
          >
            ✕
          </button>
        </header>

        <div class="drawer-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            class="nav-btn"
            class:active={currentTab === 'engineering'}
            aria-selected={currentTab === 'engineering'}
            onclick={() => snippetStore.dispatch({ type: 'setTab', tab: 'engineering' })}
          >
            Engineering
          </button>
          <button
            type="button"
            role="tab"
            class="nav-btn"
            class:active={currentTab === 'acoustics'}
            aria-selected={currentTab === 'acoustics'}
            onclick={() => snippetStore.dispatch({ type: 'setTab', tab: 'acoustics' })}
          >
            Acoustics
          </button>
          <button
            type="button"
            role="tab"
            class="nav-btn"
            class:active={currentTab === 'sustainability'}
            aria-selected={currentTab === 'sustainability'}
            onclick={() => snippetStore.dispatch({ type: 'setTab', tab: 'sustainability' })}
          >
            Sustainability
          </button>
        </div>

        <div class="drawer-body">
          <h3 class="subject-title">{activeWork.title}</h3>
          <p class="subject-summary">{activeWork.summary}</p>

          {#if currentTab === 'engineering'}
            <dl class="spec-grid mono">
              <dt>Tensile Modulus</dt><dd>1,250 MPa</dd>
              <dt>Prestress Target</dt><dd>4.8 kN/m</dd>
              <dt>Wind Uplift Cap</dt><dd>2.2 kPa</dd>
              <dt>Joint Anchor</dt><dd>Grade 316 Stainless</dd>
            </dl>
          {:else if currentTab === 'acoustics'}
            <dl class="spec-grid mono">
              <dt>Reverberation (T60)</dt><dd>1.25 s at 500 Hz</dd>
              <dt>Diffusion Index</dt><dd>0.74 (specular cut)</dd>
              <dt>Acoustic Fabric</dt><dd>Micro-perforated ETFE</dd>
              <dt>Absorption NRC</dt><dd>0.65 weighted</dd>
            </dl>
          {:else}
            <dl class="spec-grid mono">
              <dt>Embodied Carbon</dt><dd>42 kg CO₂e / m²</dd>
              <dt>Solar Reflectance</dt><dd>0.82 SRI</dd>
              <dt>Daylight Factor</dt><dd>14.5% diffused</dd>
              <dt>Lifespan Expectancy</dt><dd>35 years renewable</dd>
            </dl>
          {/if}
        </div>
      </aside>
    {/if}
  {/snippet}
</Drawer>

<style>
  :global(.drawer-backdrop) {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(4px);
  }

  :global(.drawer-panel) {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    background: #0f172a;
    border-left: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: -12px 0 32px rgba(0, 0, 0, 0.6);
    color: #f8fafc;
  }

  .drawer-panel-inner {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .drawer-header {
    padding: 1.5rem;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .drawer-title {
    margin: 0.25rem 0 0;
    font-size: 1.25rem;
    color: #f8fafc;
  }

  .drawer-tabs {
    display: flex;
    padding: 0.75rem 1.5rem;
    gap: 0.5rem;
    background: rgba(30, 41, 59, 0.5);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .drawer-body {
    padding: 1.5rem;
    flex: 1;
    overflow-y: auto;
  }

  .subject-title {
    margin: 0 0 0.5rem;
    font-size: 1.1rem;
    color: #38bdf8;
  }

  .subject-summary {
    color: #94a3b8;
    font-size: 0.85rem;
    line-height: 1.5;
    margin: 0 0 1.5rem;
  }
</style>
