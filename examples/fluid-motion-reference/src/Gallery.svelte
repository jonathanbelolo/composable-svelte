<script lang="ts">
  import { ApplicationHost, FeatureViews, FeatureOutlet, type ApplicationInstance } from '@composable-svelte/core/application';
  import { MotionPlane } from '@composable-svelte/core/application/motion';
  import type { AppState, AppAction } from './model.js';
  import SceneScope from './SceneScope.svelte';
  import { viewPlan } from './views.js';
  import { provideMotionPreference } from './preferences.js';

  let { app }: { app: ApplicationInstance<AppState, AppAction> } = $props();

  provideMotionPreference({
    get reduced() {
      return app.store.state.reducedMotion;
    }
  });

  const state = $derived(app.store.state);
</script>

<div class="app-shell">
  <div class="utility-bar">
    <a class="brand-badge" href="/">
      <span class="brand-dot" aria-hidden="true"></span>
      <span>Horizon Architecture Archive</span>
    </a>
    <label class="pref-label">
      <input
        data-reduced-motion-toggle
        type="checkbox"
        checked={state.reducedMotion}
        onchange={event => app.store.dispatch({ type: 'setReducedMotion', enabled: event.currentTarget.checked })}
      />
      <span>Reduce motion</span>
    </label>
  </div>

  <ApplicationHost {app}>
    <!-- Before the page: incoming controls that slide in (their own layer) stay painted above decoration. -->
    <MotionPlane />
    <SceneScope {app}>
      <FeatureViews store={app.store} definition={viewPlan}>
        {#snippet children(views)}
          <FeatureOutlet view={views.page} />
        {/snippet}
      </FeatureViews>
    </SceneScope>
  </ApplicationHost>

  <footer class="app-footer">
    <span>Horizon Architecture Archive · Public collection 2026</span>
    <span>Images and texts © their respective studios</span>
  </footer>
</div>
