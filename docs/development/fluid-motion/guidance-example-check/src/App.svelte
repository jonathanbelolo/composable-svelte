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
