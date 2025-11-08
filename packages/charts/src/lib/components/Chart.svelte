<script lang="ts">
/**
 * Chart - High-level wrapper component for charts
 * Handles responsive sizing, provides easy API
 */

import { onMount } from 'svelte';
import ChartPrimitive from './ChartPrimitive.svelte';
import type { Store } from '@composable-svelte/core';
import type { ChartState, ChartAction, ChartConfig } from '../types/chart.types';
import { createResizeObserver } from '../utils/responsive';
import { buildPlot } from '../utils/plot-builder';

// Props
let {
  store,
  width,
  height,
  type = 'scatter',
  enableZoom = false,
  enableBrush = false,
  enableTooltip = true,
  enableAnimations = true,
  x,
  y,
  color,
  size,
  xDomain,
  yDomain,
  onSelectionChange
}: {
  store: Store<ChartState<any>, ChartAction<any>>;
  width?: number;
  height?: number;
  type?: 'scatter' | 'line' | 'bar' | 'area' | 'histogram';
  enableZoom?: boolean;
  enableBrush?: boolean;
  enableTooltip?: boolean;
  enableAnimations?: boolean;
  x?: string | ((d: any) => any);
  y?: string | ((d: any) => any);
  color?: string | ((d: any) => any);
  size?: number;
  xDomain?: [number, number] | 'auto';
  yDomain?: [number, number] | 'auto';
  onSelectionChange?: (selected: any[]) => void;
} = $props();

// Container element
let containerElement: HTMLDivElement | null = $state(null);
let resizeObserver: ResizeObserver | null = $state(null);

// Chart config
const config: ChartConfig & { type: typeof type } = $derived({
  type,
  enableZoom,
  enableBrush,
  enableTooltip,
  enableAnimations,
  x,
  y,
  color,
  size,
  xDomain,
  yDomain
});

// Setup resize observer
onMount(() => {
  if (containerElement && !width && !height) {
    // Use ResizeObserver for fully responsive sizing
    resizeObserver = createResizeObserver(containerElement, store.dispatch);
  } else if (width || height) {
    // Use fixed dimensions
    store.dispatch({
      type: 'resize',
      dimensions: {
        width: width || 600,
        height: height || 400
      }
    });
  }

  return () => {
    resizeObserver?.disconnect();
  };
});

// Watch for selection changes
$effect(() => {
  if (onSelectionChange && $store.selection.selectedData.length > 0) {
    onSelectionChange($store.selection.selectedData);
  }
});

// Provide plot builder to primitive
function plotBuilder(chartState: ChartState<any>, chartConfig: any) {
  return buildPlot(chartState, chartConfig);
}
</script>

<div
  bind:this={containerElement}
  class="chart-container"
  style:width={width ? `${width}px` : '100%'}
  style:height={height ? `${height}px` : '400px'}
  role="img"
  aria-label={`${type} chart with ${$store.data.length} data points`}
>
  <ChartPrimitive {store} {config} {plotBuilder} />
  <!-- Tooltips handled by Observable Plot -->
</div>

<style>
  .chart-container {
    position: relative;
    overflow: hidden;
  }
</style>
