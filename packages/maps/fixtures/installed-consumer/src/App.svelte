<script lang="ts">
  import { ApplicationRoot, ApplicationHost, FeatureViews, FeatureOutlet } from '@composable-svelte/core/application';
  import type { ApplicationInstance } from '@composable-svelte/core/application';
  import { definition, views } from './model.js';
  import type { State, Action } from './model.js';
  let { onApp }: { onApp?: ((app: ApplicationInstance<State, Action>) => void) | undefined } = $props();
</script>
<ApplicationRoot {definition} options={{ dependencies: {}, initial: { input: undefined } }}>
  {#snippet children(app)}
    {@const _ = onApp?.(app)}
    <ApplicationHost {app}>
      <FeatureViews store={app.store} definition={views}>
        {#snippet children(captured)}
          <FeatureOutlet view={captured.map} />
        {/snippet}
      </FeatureViews>
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>
