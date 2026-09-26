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

const onCaptureChart = getContext<((view: ChildView<ChartState<MetricRow>, ChartAction<MetricRow>>) => void) | undefined>('onCaptureChart');
const onSelectionChange = getContext<((selection: MetricRow[]) => void) | undefined>('onSelectionChange');
const enableZoom = getContext<boolean | undefined>('enableZoom') ?? true;
const enableBrush = getContext<boolean | undefined>('enableBrush') ?? false;

$effect(() => {
  onCaptureChart?.(store);
});
</script>

<div use:surface data-testid="managed-chart-feature" style="width: 100%; height: 100%;">
  <Chart
    {store}
    x="x"
    y="y"
    type="scatter"
    {enableZoom}
    {enableBrush}
    onSelectionChange={(rows) => onSelectionChange?.(rows)}
  />
</div>
