<script lang="ts">
  import { ApplicationRoot, ApplicationHost, FeatureViews, FeatureOutlet } from '@composable-svelte/core/application';
  import type { ApplicationInstance } from '@composable-svelte/core/application';
  import type { State, Action } from './model.js';
  import { definition, views } from './model.js';
</script>

<ApplicationRoot {definition} options={{ dependencies: {}, initial: { input: undefined } }}>
  {#snippet children(app)}
    <ApplicationHost {app}>
      <FeatureViews store={app.store} definition={views}>
        {#snippet children(captured)}
          <FeatureOutlet view={captured.graphics} />
        {/snippet}
      </FeatureViews>
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>
