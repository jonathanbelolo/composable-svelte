<script lang="ts">
import { setContext } from 'svelte';
import {
  ApplicationRoot,
  ApplicationHost,
  FeatureViews,
  FeatureOutlet,
  type ApplicationInstance,
  type ChildView
} from '@composable-svelte/core/application';
import {
  chartAppDefinition,
  type AppState,
  type AppAction,
  type MetricRow
} from './managed-chart-recipe-model.js';
import { chartViews } from './managed-chart-recipe-views.js';
import type { ChartState, ChartAction } from '../../src/lib/types/chart.types.js';

let {
  onCaptureChart,
  onCaptureSidebar,
  onSelectionChange,
  enableZoom,
  enableBrush,
  onApp
}: {
  onCaptureChart?: ((view: ChildView<ChartState<MetricRow>, ChartAction<MetricRow>>) => void) | undefined;
  onCaptureSidebar?: ((view: ChildView<ChartState<MetricRow>, ChartAction<MetricRow>>) => void) | undefined;
  onSelectionChange?: ((selection: MetricRow[]) => void) | undefined;
  enableZoom?: boolean | undefined;
  enableBrush?: boolean | undefined;
  onApp?: ((app: ApplicationInstance<AppState, AppAction>) => void) | undefined;
} = $props();

setContext('onCaptureChart', onCaptureChart);
setContext('onCaptureSidebar', onCaptureSidebar);
setContext('onSelectionChange', onSelectionChange);
setContext('enableZoom', enableZoom);
setContext('enableBrush', enableBrush);
</script>

<ApplicationRoot definition={chartAppDefinition} options={{ dependencies: {}, initial: { input: undefined } }}>
  {#snippet children(app)}
    {@const _ = onApp?.(app)}
    <ApplicationHost {app}>
      <FeatureViews store={app.store} definition={chartViews}>
        {#snippet children(views)}
          <main data-testid="chart-outlet">
            <FeatureOutlet view={views.chart} />
          </main>
          <aside data-testid="sidebar-chart-outlet">
            <FeatureOutlet view={views.sidebarChart} />
          </aside>
        {/snippet}
      </FeatureViews>
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>
