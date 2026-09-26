<script lang="ts">
  import {
    Chart,
    ChartPrimitive,
    type ChartState,
    type ChartAction,
    type ChartAccessor
  } from '@composable-svelte/charts';
  import type { PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import type { ComponentProps } from 'svelte';
  import { getContext } from 'svelte';
  import type { MetricRow } from './model.js';

  let { store, surface }: PresentationFeatureViewProps<ChartState<MetricRow>, ChartAction<MetricRow>> = $props();
  const getBrush = getContext<(() => boolean) | undefined>('installedChartBrush');
  const getSelectionReporter = getContext<(() => ((rows: MetricRow[]) => void) | undefined) | undefined>('installedChartSelection');
  const brush = $derived(getBrush?.() ?? false);

  function assertProps(view: PresentationFeatureViewProps<ChartState<MetricRow>, ChartAction<MetricRow>>['store']) {
    const _chartStore: ComponentProps<typeof Chart<MetricRow>>['store'] = view;
    const _primitiveStore: ComponentProps<typeof ChartPrimitive<MetricRow>>['store'] = view;
    const _xAccessor: ChartAccessor<MetricRow> = 'x';
    const _yAccessor: ChartAccessor<MetricRow> = (d: MetricRow) => d.y;
    return [_chartStore, _primitiveStore, _xAccessor, _yAccessor];
  }

  $effect(() => { void assertProps(store); });
</script>

<div use:surface>
  <Chart
    {store}
    x="x"
    y={(d: MetricRow) => d.y}
    type="scatter"
    enableZoom={!brush}
    enableBrush={brush}
    onSelectionChange={(selected) => getSelectionReporter?.()?.(selected)}
  />
</div>
