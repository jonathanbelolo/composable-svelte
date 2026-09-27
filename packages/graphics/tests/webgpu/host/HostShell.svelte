<script lang="ts">
  import { ApplicationHost, FeatureViews, FeatureOutlet, defineViews, type ApplicationInstance } from '@composable-svelte/core/application';
  import { MotionPlane } from '@composable-svelte/core/application/motion';
  import { composition, type HostState, type HostAction } from './model.js';
  import SceneScope from './SceneScope.svelte';
  import Gallery from './Gallery.svelte';
  import Detail from './Detail.svelte';
  let { app, onApp }: { app: ApplicationInstance<HostState, HostAction>; onApp: (app: ApplicationInstance<HostState, HostAction>) => void } = $props();
  // svelte-ignore state_referenced_locally
  onApp(app);
  const views = defineViews(composition, { page: { cases: { gallery: { render: Gallery }, detail: { render: Detail } } }, scene: { headless: true } });
</script>

<ApplicationHost {app}>
  <MotionPlane />
  <SceneScope {app}>
    <FeatureViews store={app.store} definition={views}>
      {#snippet children(v)}<FeatureOutlet view={v.page} />{/snippet}
    </FeatureViews>
  </SceneScope>
</ApplicationHost>
