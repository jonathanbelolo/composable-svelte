<script lang="ts">
  import { ApplicationHost, ApplicationRoot, FeatureOutlet, FeatureViews } from '@composable-svelte/core/application';
  import { MotionPlane } from '@composable-svelte/core/application/motion';
  import { viewPlan, type TestApplication } from './model.js';
  let { url, application }: { url: string; application: TestApplication } = $props();
</script>

<ApplicationRoot definition={application} options={{ dependencies: {}, initial: { input: url, url } }}>
  {#snippet children(app)}
    <ApplicationHost {app}>
      <MotionPlane />
      <FeatureViews store={app.store} definition={viewPlan}>
        {#snippet children(views)}<FeatureOutlet view={views.page} />{/snippet}
      </FeatureViews>
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>
