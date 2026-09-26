<script lang="ts">
  import { setContext } from 'svelte';
  import { ApplicationRoot, ApplicationHost, FeatureViews, FeatureOutlet } from '@composable-svelte/core/application';
  import type { ApplicationInstance } from '@composable-svelte/core/application';
  import { definition, views, type State, type Action, type MetricRow } from './model.js';
  let { onSelectionChange, brush = false }: { onSelectionChange?: ((rows: MetricRow[]) => void) | undefined; brush?: boolean | undefined } = $props();
  setContext('installedChartBrush', () => brush);
  setContext('installedChartSelection', () => onSelectionChange);
</script>

<ApplicationRoot {definition} options={{ dependencies: {}, initial: { input: undefined } }}>
  {#snippet children(app)}
    <ApplicationHost {app}>
      <FeatureViews store={app.store} definition={views}>
        {#snippet children(captured)}
          <FeatureOutlet view={captured.chart} />
        {/snippet}
      </FeatureViews>
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>
