<script lang="ts">
  import {
    ApplicationRoot,
    ApplicationHost,
    FeatureViews,
    FeatureOutlet
  } from '../../src/lib/application/index.js';
  import type { ApplicationInstance } from '../../src/lib/application/index.js';
  import {
    hostedApplication,
    hostedPlan,
    type HostedState,
    type HostedAction
  } from './ManagedDestinationCaseModel.js';

  let { input, onApp }: {
    input: number;
    onApp: (app: ApplicationInstance<HostedState, HostedAction>) => void;
  } = $props();
</script>

<ApplicationRoot definition={hostedApplication} options={{ dependencies: {}, initial: { input } }}>
  {#snippet children(app)}
    {@const observed = onApp(app)}
    <ApplicationHost {app}>
      <FeatureViews store={app.store} definition={hostedPlan}>
        {#snippet children(views)}
          <FeatureOutlet view={views.dest!} />
        {/snippet}
      </FeatureViews>
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>
