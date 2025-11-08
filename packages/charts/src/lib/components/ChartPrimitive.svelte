<script lang="ts">
/**
 * ChartPrimitive - Low-level component that renders Observable Plot
 * This component handles the Plot lifecycle: mount, update, unmount
 */

import { onMount, untrack } from 'svelte';
import { animate } from 'motion';
import type { ChartState, ChartConfig } from '../types/chart.types';
import type { Dispatch } from '@composable-svelte/core';
import type { ChartAction } from '../types/chart.types';

import type { Store } from '@composable-svelte/core';

// Props
let {
  store,
  config,
  plotBuilder
}: {
  store: Store<ChartState<any>, ChartAction<any>>;
  config: ChartConfig & { type?: 'scatter' | 'line' | 'bar' | 'area' | 'histogram' };
  plotBuilder: (state: ChartState<any>, config: any) => any;
} = $props();

// Container element
let containerElement: HTMLDivElement | null = $state(null);
let plotElement: HTMLElement | null = $state(null);

// Setup plot rendering with manual subscription (NOT Svelte 5 effects)
// This avoids infinite loops caused by effect → DOM manipulation → effect
onMount(() => {
  if (!containerElement) return;

  // Track previous values to detect actual changes
  let prevDataLength = 0;
  let prevFilteredLength = 0;
  let prevSelectedCount = 0;

  // Initial render
  renderPlot();

  // Manually subscribe to store updates
  // Only rebuild when data/selection actually changes (not on resize, etc.)
  const unsubscribe = store.subscribe((state) => {
    const dataChanged = state.data.length !== prevDataLength;
    const filteredChanged = state.filteredData.length !== prevFilteredLength;
    const selectionChanged = state.selection.selectedIndices.length !== prevSelectedCount;

    if (dataChanged || filteredChanged || selectionChanged) {
      prevDataLength = state.data.length;
      prevFilteredLength = state.filteredData.length;
      prevSelectedCount = state.selection.selectedIndices.length;

      renderPlot();
    }
  });

  return () => {
    unsubscribe();
  };
});

// Render the plot (called on mount and when data/selection changes)
function renderPlot() {
  if (!containerElement) return;

  // Get current state (not reactive, just a snapshot)
  const plotState = store.state;

  // Build plot
  const plot = plotBuilder(plotState, config);

  // Clear previous plot
  if (plotElement) {
    plotElement.remove();
  }

  // Render new plot
  plotElement = plot;
  containerElement.appendChild(plotElement);

  // Attach event listeners for interactivity
  attachEventListeners(plotElement);
}

/**
 * Attach event listeners for chart interactions
 * Currently disabled - Observable Plot handles all interactions via tooltips
 * Selection feature can be added later using Plot's interaction APIs
 */
function attachEventListeners(element: HTMLElement) {
  // All interactions handled by Observable Plot's built-in features
  // Future: Add proper selection using Plot.pointer() or similar APIs
}
</script>

<div bind:this={containerElement} class="chart-primitive"></div>

<style>
  .chart-primitive {
    width: 100%;
    height: 100%;
    position: relative;
  }

  /* Style Observable Plot output */
  .chart-primitive :global(svg) {
    max-width: 100%;
    height: auto;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .chart-primitive :global(text) {
    fill: #374151;
  }

  .chart-primitive :global(.plot-axis) {
    font-size: 12px;
  }
</style>
