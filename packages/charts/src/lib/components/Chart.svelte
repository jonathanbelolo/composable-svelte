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
  aria-label={`${type} chart showing ${$store.data.length} data points${
    $store.selection.selectedIndices.length > 0
      ? `, ${$store.selection.selectedIndices.length} selected`
      : ''
  }`}
  aria-describedby="chart-summary"
  tabindex="0"
>
  <ChartPrimitive {store} {config} {plotBuilder} {enableZoom} {enableBrush} />

  <!-- Screen reader summary -->
  <div id="chart-summary" class="sr-only">
    {#if x && y}
      Chart with x-axis: {typeof x === 'string' ? x : 'custom accessor'},
      y-axis: {typeof y === 'string' ? y : 'custom accessor'}.
      {#if $store.filteredData.length !== $store.data.length}
        Showing {$store.filteredData.length} of {$store.data.length} filtered data points.
      {:else}
        Showing {$store.data.length} data points.
      {/if}
    {/if}
  </div>
</div>

<style>
  .chart-container {
    position: relative;
    overflow: hidden;
  }

  /* Screen reader only content */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }
</style>
