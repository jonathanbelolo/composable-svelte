<script lang="ts">
import { getContext } from 'svelte';
import type { PresentationFeatureViewProps, ChildView } from '@composable-svelte/core/application';
import type { ChartState, ChartAction } from '../../src/lib/types/chart.types.js';
import type { MetricRow } from './managed-chart-recipe-model.js';
import Chart from '../../src/lib/components/Chart.svelte';

let {
  store,
  surface
}: PresentationFeatureViewProps<ChartState<MetricRow>, ChartAction<MetricRow>> = $props();

const onCaptureSidebar = getContext<((view: ChildView<ChartState<MetricRow>, ChartAction<MetricRow>>) => void) | undefined>('onCaptureSidebar');

$effect(() => {
  onCaptureSidebar?.(store);
});
</script>

<div use:surface data-testid="managed-sidebar-chart-feature" style="width: 100%; height: 100%;">
  <Chart {store} x="x" y="y" type="scatter" enableZoom={true} />
</div>
