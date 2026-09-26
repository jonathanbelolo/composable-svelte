<script lang="ts">
import ChartPrimitive from '../../src/lib/components/ChartPrimitive.svelte';
import type { ChartStore, ChartConfig, ChartState } from '../../src/lib/types/chart.types.js';
import type { MetricRow } from './managed-chart-recipe-model.js';

let {
  store,
  config = { type: 'scatter' },
  plotBuilder = () => null
}: {
  store: ChartStore<MetricRow>;
  config?: (ChartConfig<MetricRow> & { type?: 'scatter' | 'line' | 'bar' | 'area' | 'histogram' }) | undefined;
  plotBuilder?: ((state: ChartState<MetricRow>, config: ChartConfig<MetricRow>) => Element | null) | undefined;
} = $props();
</script>

<div data-testid="standalone-primitive-host">
  <ChartPrimitive {store} {config} {plotBuilder} />
</div>
