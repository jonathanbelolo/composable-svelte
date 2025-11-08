<script lang="ts">
/**
 * ChartPrimitive - Low-level component that renders Observable Plot
 * This component handles the Plot lifecycle: mount, update, unmount
 */

import { onMount, untrack } from 'svelte';
import { animate } from 'motion';
import { zoom as d3Zoom } from 'd3-zoom';
import { brush as d3Brush } from 'd3-brush';
import { select } from 'd3-selection';
import type { ChartState, ChartConfig } from '../types/chart.types';
import type { Dispatch } from '@composable-svelte/core';
import type { ChartAction } from '../types/chart.types';
import { animateZoomTransition } from '../utils/animate-zoom';

import type { Store } from '@composable-svelte/core';

// Props
let {
  store,
  config,
  plotBuilder,
  enableZoom = false,
  enableBrush = false
}: {
  store: Store<ChartState<any>, ChartAction<any>>;
  config: ChartConfig & { type?: 'scatter' | 'line' | 'bar' | 'area' | 'histogram' };
  plotBuilder: (state: ChartState<any>, config: any) => any;
  enableZoom?: boolean;
  enableBrush?: boolean;
} = $props();

// Container element
let containerElement: HTMLDivElement | null = $state(null);
let plotElement: HTMLElement | null = $state(null);
let cleanupEventListeners: (() => void) | null = null;

// Setup plot rendering with manual subscription (NOT Svelte 5 effects)
// This avoids infinite loops caused by effect → DOM manipulation → effect
onMount(() => {
  if (!containerElement) return;

  // Track previous values to detect actual changes
  let prevDataLength = 0;
  let prevFilteredLength = 0;
  let prevSelectedCount = 0;
  let prevTransformK = 1;
  let prevTransformX = 0;
  let prevTransformY = 0;

  // Initial render
  renderPlot();

  // Manually subscribe to store updates
  // Only rebuild when data/selection changes (not on zoom/transform changes!)
  const unsubscribe = store.subscribe((state) => {
    const dataChanged = state.data.length !== prevDataLength;
    const filteredChanged = state.filteredData.length !== prevFilteredLength;
    const selectionChanged = state.selection.selectedIndices.length !== prevSelectedCount;
    const transformChanged = state.transform.k !== prevTransformK ||
                            state.transform.x !== prevTransformX ||
                            state.transform.y !== prevTransformY;

    // Only re-render on data/selection changes OR transform changes
    // Transform changes will trigger a rebuild to update the domain
    if (dataChanged || filteredChanged || selectionChanged || transformChanged) {
      prevDataLength = state.data.length;
      prevFilteredLength = state.filteredData.length;
      prevSelectedCount = state.selection.selectedIndices.length;
      prevTransformK = state.transform.k;
      prevTransformX = state.transform.x;
      prevTransformY = state.transform.y;

      renderPlot();
    }
  });

  return () => {
    unsubscribe();
    if (cleanupEventListeners) {
      cleanupEventListeners();
    }
  };
});

// Watch for animated zoom transitions
// This is state-driven: reducer sets isAnimating + targetTransform, component animates
let animationRunning = false;

$effect(() => {
  const state = $store;

  // Only start animation if not already running
  if (state.isAnimating && state.targetTransform && !animationRunning) {
    animationRunning = true;

    const from = state.transform;
    const to = state.targetTransform;

    // Run spring animation
    animateZoomTransition(
      from,
      to,
      store.dispatch,
      (transform) => {
        // Dispatch progress updates during animation
        store.dispatch({
          type: 'zoomProgress',
          transform
        });
      }
    ).then(() => {
      // Animation completed
      animationRunning = false;
    });
  }
});

// Render the plot (called on mount and when data/selection/transform changes)
function renderPlot() {
  if (!containerElement) return;

  // Clean up previous event listeners
  if (cleanupEventListeners) {
    cleanupEventListeners();
    cleanupEventListeners = null;
  }

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

  // Wait for SVG to be available before attaching behaviors
  // Observable Plot returns the SVG element directly, so we need to query from the container
  const attemptAttach = (retries = 0) => {
    if (!containerElement || !plotElement) return; // Guard in case component unmounted

    // Observable Plot returns the SVG directly, so look for it in the container
    const svg = containerElement.querySelector('svg');
    if (svg) {
      // SVG found - attach event listeners
      const cleanup = attachEventListeners(containerElement);
      if (cleanup) {
        cleanupEventListeners = cleanup;
      }
    } else if (retries < 5) {
      // SVG not found yet - retry after a short delay
      setTimeout(() => attemptAttach(retries + 1), 10);
    } else if (enableZoom || enableBrush) {
      // Give up after 5 retries
      console.warn('[ChartPrimitive] Could not find SVG after multiple attempts');
    }
  };

  // Start attachment attempt on next tick
  setTimeout(() => attemptAttach(), 0);
}

/**
 * Attach event listeners for chart interactions
 * Handles zoom/pan or brush selection (mutually exclusive)
 */
function attachEventListeners(element: HTMLElement): (() => void) | void {
  // Find the SVG element (Observable Plot creates one)
  const svg = element.querySelector('svg');
  if (!svg) {
    if (enableZoom || enableBrush) {
      console.warn('[ChartPrimitive] No SVG found, cannot attach interactions');
    }
    return;
  }

  // Brush takes precedence over zoom (they're mutually exclusive)
  if (enableBrush) {
    return attachBrushBehavior(svg);
  } else if (enableZoom) {
    return attachZoomBehavior(svg);
  }

  // No interactions - Observable Plot handles tooltips
  return;
}

/**
 * Attach zoom behavior to SVG
 */
function attachZoomBehavior(svg: SVGSVGElement): () => void {
  const zoomBehavior = d3Zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.5, 10])  // Min and max zoom levels
    .on('zoom', (event) => {
      // Dispatch zoom action with transform
      store.dispatch({
        type: 'zoom',
        transform: {
          x: event.transform.x,
          y: event.transform.y,
          k: event.transform.k
        }
      });
    });

  // Attach zoom behavior to SVG
  select(svg).call(zoomBehavior);

  // Return cleanup function
  return () => {
    select(svg).on('.zoom', null);
  };
}

/**
 * Attach brush behavior to SVG for selection
 */
function attachBrushBehavior(svg: SVGSVGElement): () => void {
  const brushBehavior = d3Brush()
    .on('start', () => {
      store.dispatch({ type: 'brushStart' });
    })
    .on('brush', (event) => {
      if (event.selection) {
        const [[x0, y0], [x1, y1]] = event.selection as [[number, number], [number, number]];
        store.dispatch({
          type: 'brushMove',
          extent: [[x0, y0], [x1, y1]]
        });
      }
    })
    .on('end', (event) => {
      if (!event.selection) {
        // Brush was cleared - clear selection
        store.dispatch({ type: 'clearSelection' });
        store.dispatch({ type: 'brushEnd' });
        return;
      }

      // Compute which data points are selected
      const [[x0, y0], [x1, y1]] = event.selection as [[number, number], [number, number]];

      // Find all circles (data points) within the brush extent
      const circles = svg.querySelectorAll('circle');
      const selectedIndices: number[] = [];
      const selectedData: any[] = [];
      const currentState = store.state;

      circles.forEach((circle, index) => {
        const cx = parseFloat(circle.getAttribute('cx') || '0');
        const cy = parseFloat(circle.getAttribute('cy') || '0');

        // Check if circle center is within brush extent
        if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) {
          selectedIndices.push(index);
          if (index < currentState.filteredData.length) {
            selectedData.push(currentState.filteredData[index]);
          }
        }
      });

      // Dispatch selection with the selected data points
      if (selectedIndices.length > 0) {
        store.dispatch({
          type: 'selectRange',
          range: [Math.min(...selectedIndices), Math.max(...selectedIndices)]
        });
      }

      store.dispatch({ type: 'brushEnd' });
    });

  // Attach brush to SVG
  select(svg).call(brushBehavior);

  // Return cleanup function
  return () => {
    select(svg).on('.brush', null);
  };
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
