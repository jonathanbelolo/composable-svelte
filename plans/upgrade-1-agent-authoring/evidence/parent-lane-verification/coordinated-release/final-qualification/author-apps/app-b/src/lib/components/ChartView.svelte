<script lang="ts">
  import { Chart, type ChartState, type ChartAction } from '@composable-svelte/charts';
  import type { PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import type { AccountActivityRow } from '../model.js';

  let { store, surface }: PresentationFeatureViewProps<ChartState<AccountActivityRow>, ChartAction<AccountActivityRow>> = $props();
</script>

<div use:surface data-testid="chart-feature-view" class="chart-container">
  <!-- Chart gestures and keys dispatch typed ChartAction<AccountActivityRow> through
       this genuine child view; the parent reducer handles the routed actions. -->
  <Chart {store} x="date" y="logins" type="bar" height={280} />
</div>

<style>
  .chart-container {
    width: 100%;
    min-height: 280px;
    margin: 1rem 0;
  }
</style>
