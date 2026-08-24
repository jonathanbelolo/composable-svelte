<script lang="ts">
/**
 * Chart - High-level wrapper component for charts
 * Handles responsive sizing, provides easy API
 */

import { onMount } from 'svelte';
import ChartPrimitive from './ChartPrimitive.svelte';
import type { Store } from '@composable-svelte/core';
import type { ChartState, ChartAction, ChartConfig } from '../types/chart.types.js';
import { createResizeObserver } from '../utils/responsive.js';
import { buildPlot } from '../utils/plot-builder.js';

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
  width?: number | undefined;
  height?: number | undefined;
  type?: 'scatter' | 'line' | 'bar' | 'area' | 'histogram' | undefined;
  enableZoom?: boolean | undefined;
  enableBrush?: boolean | undefined;
  enableTooltip?: boolean | undefined;
  enableAnimations?: boolean | undefined;
  x?: string | ((d: any) => any) | undefined;
  y?: string | ((d: any) => any) | undefined;
  color?: string | ((d: any) => any) | undefined;
  size?: number | undefined;
  xDomain?: [number, number] | 'auto' | undefined;
  yDomain?: [number, number] | 'auto' | undefined;
  onSelectionChange?: ((selected: any[]) => void) | undefined;
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

// Watch for selection changes.
//
// Narrowed to the array itself, not the whole `$store`. `$state.raw` replaces
// the state object on every dispatch, so depending on `$store` re-ran this on
// every action — including the per-frame `zoomProgress` of a zoom animation,
// re-invoking the consumer's callback with a selection that had not changed.
// The reducer's zoom/resize cases spread `...state`, preserving `selection` by
// reference, so the derived's equality check now absorbs all of them.
//
// And no `length > 0` guard: `clearSelection` allocates a fresh `[]`
// (`chart.reducer.ts:179-191`), so the derived does change identity on a clear
// and the consumer is told. Under the old guard it never was, and a details
// panel wired to this callback showed dismissed rows forever.
const selectedData = $derived($store.selection.selectedData);

// Not $state: written and read inside the effect below. A reactive flag would
// re-trigger the effect it lives in (`effect_update_depth_exceeded`).
let reportedInitial = false;

$effect(() => {
  // Report *changes*, which is what the prop is called. The effect's first run
  // carries the selection the consumer supplied in the initial state, so
  // delivering it back is unsolicited noise — and it is a real call, not a
  // theoretical one: measured as `MOUNT_CALLS=1 [[[]]]` once `ResizeObserver`
  // exists. jsdom lacks it, `onMount` throws, and the effect is suppressed, so
  // this is invisible in this package's own environment.
  const selection = selectedData;
  if (!reportedInitial) {
    reportedInitial = true;
    return;
  }
  onSelectionChange?.(selection);
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
