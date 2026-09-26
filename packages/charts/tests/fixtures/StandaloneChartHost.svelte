<script lang="ts">
import Chart from '../../src/lib/components/Chart.svelte';
import type { ChartStore, ChartAccessor } from '../../src/lib/types/chart.types.js';
import type { MetricRow } from './managed-chart-recipe-model.js';

let {
  store,
  x = 'x',
  y = (d: MetricRow) => d.y,
  enableZoom = false,
  onSelectionChange
}: {
  store: ChartStore<MetricRow>;
  x?: ChartAccessor<MetricRow> | undefined;
  y?: ChartAccessor<MetricRow> | undefined;
  enableZoom?: boolean | undefined;
  onSelectionChange?: ((rows: MetricRow[]) => void) | undefined;
} = $props();
</script>

<div data-testid="standalone-chart-host">
  <Chart
    {store}
    {x}
    {y}
    type="scatter"
    {enableZoom}
    onSelectionChange={(rows) => onSelectionChange?.(rows)}
  />
</div>
