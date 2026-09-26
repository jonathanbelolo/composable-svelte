<script lang="ts" generics="TRow = unknown">
/**
 * ChartPrimitive - Low-level component that renders Observable Plot
 * This component handles the Plot lifecycle: mount, update, unmount
 */

import { untrack } from 'svelte';
import { zoom as d3Zoom } from 'd3-zoom';
import { brush as d3Brush } from 'd3-brush';
import { select } from 'd3-selection';
import type { ChartState, ChartConfig, ChartStore } from '../types/chart.types.js';
import { animateZoomTransition } from '../utils/animate-zoom.js';
import { ZOOM_MIN, ZOOM_MAX } from '../reducers/chart.reducer.js';

// Props
let {
  store,
  config,
  plotBuilder,
  enableZoom = false,
  enableBrush = false
}: {
  store: ChartStore<TRow>;
  config: ChartConfig<TRow> & { type?: 'scatter' | 'line' | 'bar' | 'area' | 'histogram' };
  plotBuilder: (state: ChartState<TRow>, config: ChartConfig<TRow>) => Element | null;
  enableZoom?: boolean | undefined;
  enableBrush?: boolean | undefined;
} = $props();

// Container element
let containerElement: HTMLDivElement | null = $state(null);
// Gates prop redraws until the store subscription has drawn its first state.
let mounted = $state(false);
let propEffectInitialized = false;
let plotElement: Element | null = $state(null);
let isRetired = $state(false);
let attachmentTimer: ReturnType<typeof setTimeout> | undefined;
let attachmentGeneration = 0;
function retireAttachment() {
  attachmentGeneration++;
  if (attachmentTimer !== undefined) clearTimeout(attachmentTimer);
  attachmentTimer = undefined;
}
let cleanupEventListeners: (() => void) | null = null;
let animationAbortController: AbortController | null = null;

function cleanupAll() {
  if (isRetired) return;
  isRetired = true;
  retireAttachment();
  if (cleanupEventListeners) {
    cleanupEventListeners();
    cleanupEventListeners = null;
  }
  if (animationAbortController) {
    animationAbortController.abort();
    animationAbortController = null;
  }
  if (plotElement) {
    plotElement.remove();
    plotElement = null;
  }
}

// Rebind when the store prop changes. Subscription callbacks and DOM work stay
// untracked, so only the store identity and container drive this effect.
$effect(() => {
  const binding = store;
  if (!containerElement) return;

  if (untrack(() => binding.state) === undefined) {
    // Owner is already retired or uninitialized
    cleanupAll();
    return;
  }

  isRetired = false;

  /**
   * The state this component last drew. Identity, not a hand-picked set of
   * lengths.
   *
   * This used to compare `data.length`, `filteredData.length`,
   * `selection.selectedIndices.length` and the three transform scalars, and
   * everything it missed was invisible:
   *
   * - `dimensions` was not in the set, and is the only thing the plot builders
   *   read for width and height. Every resize was inert; the SVG kept whatever
   *   size was in state at the last render, which for the responsive path is
   *   the `createInitialChartState` default forever.
   * - `setData` with an equal row count never redrew — a re-sort, a re-map, a
   *   sliding window. `DataTransformsDemo`'s Sort button does exactly that.
   * - Moving a selection from one point to another never redrew, because only
   *   the count was compared.
   *
   * The store is `$state.raw` and this package's reducer is immutable, so a
   * changed state is always a new object and an unchanged one is always the
   * same object. Identity is the signal that was being thrown away, and it is
   * O(1) — which matters, because a pan dispatches per frame.
   */
  let renderedState: ChartState<TRow> | null = null;

  const renderIfChanged = (state: ChartState<TRow> | undefined) => {
    // A predecessor cannot retire or draw into its successor between a prop
    // update and this effect's cleanup.
    if (store !== binding) return;
    if (state === undefined) {
      // Terminal undefined from ChildView retirement!
      cleanupAll();
      return;
    }
    if (isRetired) return;
    if (state === renderedState) return;
    renderedState = state;
    renderPlot();
  };

  // `store.subscribe` invokes its listener immediately, so this draws the
  // initial state without a separate explicit `renderPlot()` call. The prop
  // effect skips its first run so mount also has one Plot build.
  const unsubscribe = untrack(() => binding.subscribe(renderIfChanged));
  mounted = true;

  return () => {
    unsubscribe();
    cleanupAll();
    mounted = false;
  };
});

/**
 * Redraw when a *prop* changes.
 *
 * `renderPlot` reads `config`, `plotBuilder`, `enableZoom` and `enableBrush` at
 * call time, and it was only ever called from the store subscription — so none
 * of `type`, `x`, `y`, `color`, `size`, `xDomain`, `yDomain`, `enableZoom`,
 * `enableBrush` or `plotBuilder` reached the canvas until an unrelated data
 * change happened to rebuild. `ScatterChartDemo`'s Brush Mode button is the
 * visible case: switching zoom → brush dispatches nothing, so brushing was
 * never installed, while brush → zoom dispatches `clearSelection` and *may*
 * redraw — which made the bug look intermittent.
 *
 * Deliberately reads only the props. Touching `$store` here would re-run this
 * on every dispatch, duplicating the subscription above; and `renderPlot`
 * mutates the DOM, which is why the store path is a manual subscription rather
 * than an effect in the first place.
 */
$effect(() => {
  // Named so the dependency is explicit rather than incidental.
  void config;
  void plotBuilder;
  void enableZoom;
  void enableBrush;

  if (!propEffectInitialized) {
    propEffectInitialized = true;
    return;
  }

  if (isRetired || untrack(() => store.state) === undefined) return;

  // `untrack` is load-bearing, not decoration. `renderPlot` reads *and* writes
  // `plotElement`, which is `$state`, so calling it inside an effect makes its
  // own writes into the effect's dependencies — the "effect → DOM manipulation
  // → effect" loop the comment on the mount subscription above warns about. It
  // hangs the test runner outright.
  //
  // (`untrack` was imported and unused before this. It is what the file needed
  // all along.)
  if (untrack(() => mounted)) untrack(() => renderPlot());
});

// Depend on the requested target identity, not per-frame transform progress.
const animationTarget = $derived(!isRetired && $store?.isAnimating ? $store?.targetTransform : undefined);
const animationsEnabled = $derived(config.enableAnimations !== false);
$effect(() => {
  const target = animationTarget;
  const enabled = animationsEnabled;
  const currentStore = store;
  if (!target || isRetired) return;
  const controller = new AbortController();
  const current = untrack(() => currentStore.state);
  if (!current) return;
  animationAbortController = controller;
  const dispatch: typeof currentStore.dispatch = action => {
    const latest = currentStore.state;
    if (!controller.signal.aborted && !isRetired && latest?.isAnimating && latest?.targetTransform === target)
      currentStore.dispatch(action);
  };
  if (!enabled) {
    dispatch({ type: 'zoomProgress', transform: target });
    dispatch({ type: 'zoomComplete' });
  } else {
    void animateZoomTransition(
      current.transform, target, dispatch,
      transform => dispatch({ type: 'zoomProgress', transform }),
      current.transitionDuration, controller.signal
    ).catch(error => console.error('[ChartPrimitive] Zoom animation failed:', error));
  }
  return () => {
    controller.abort();
    if (animationAbortController === controller) {
      animationAbortController = null;
    }
  };
});

// Render the plot (called on mount and when data/selection/transform changes)
function renderPlot() {
  if (!containerElement || isRetired) return;

  retireAttachment();
  const generation = attachmentGeneration;

  // Clean up previous event listeners
  if (cleanupEventListeners) {
    cleanupEventListeners();
    cleanupEventListeners = null;
  }

  // Get current state (not reactive, just a snapshot)
  const plotState = store.state;
  if (!plotState || isRetired) return;

  // Build plot. `plotBuilder` returns an Element (SVG or Figure) or null.
  const plot: Element | null = plotBuilder(plotState, config);
  if (!plot || isRetired) return;

  // Clear previous plot
  if (plotElement) {
    plotElement.remove();
  }

  // Render new plot
  plotElement = plot;
  containerElement.appendChild(plot);

  if (!enableZoom && !enableBrush) return;

  // Wait for SVG to be available before attaching behaviors
  // Observable Plot returns the SVG element directly, so we need to query from the container
  const attemptAttach = (retries = 0) => {
    if (generation !== attachmentGeneration || isRetired || !containerElement || plotElement !== plot) return;
    attachmentTimer = undefined;

    // Observable Plot returns the SVG directly, so look for it in the container
    const svg = containerElement.querySelector('svg');
    if (svg) {
      // SVG found - attach event listeners
      const cleanup = attachEventListeners(containerElement);
      if (cleanup) {
        if (generation === attachmentGeneration && !isRetired) cleanupEventListeners = cleanup;
        else cleanup();
      }
    } else if (retries < 5) {
      // SVG not found yet - retry after a short delay
      attachmentTimer = setTimeout(() => attemptAttach(retries + 1), 10);
    } else if (enableZoom || enableBrush) {
      // Give up after 5 retries
      console.warn('[ChartPrimitive] Could not find SVG after multiple attempts');
    }
  };

  // Start attachment attempt on next tick
  attachmentTimer = setTimeout(() => attemptAttach(), 0);
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
    // From the reducer, not repeated here. `zoomIn`/`zoomOut` clamp to the same
    // pair, so the keyboard and the wheel stop at the same place — and a later
    // change to one cannot leave the other behind.
    .scaleExtent([ZOOM_MIN, ZOOM_MAX])
    .on('zoom', (event) => {
      if (isRetired || !store.state) return;
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
 * The circles belonging to the *data* mark, in data order.
 *
 * `svg.querySelectorAll('circle')` was close enough while a plot held exactly
 * one dot mark, and the comment here said so. It no longer does: the keyboard
 * cursor draws a ring, which is a second dot mark and a second circle. That ring
 * happens to render last, so the old `index < filteredData.length` bound
 * excluded it — correct by accident of ordering, which is not a property worth
 * relying on.
 *
 * The data mark is the first group to contain circles, because every builder
 * appends `focusMark` after the mark it annotates.
 */
function dataCircles(svg: SVGSVGElement): SVGCircleElement[] {
  for (const group of Array.from(svg.querySelectorAll('g'))) {
    const circles = group.querySelectorAll('circle');
    if (circles.length > 0) return Array.from(circles) as SVGCircleElement[];
  }
  return [];
}

/**
 * Attach brush behavior to SVG for selection
 */
function attachBrushBehavior(svg: SVGSVGElement): () => void {
  const brushBehavior = d3Brush()
    .on('start', () => {
      if (isRetired || !store.state) return;
      store.dispatch({ type: 'brushStart' });
    })
    .on('end', (event) => {
      if (isRetired || !store.state) return;
      if (!event.selection) {
        // Brush was cleared - clear selection
        store.dispatch({ type: 'clearSelection' });
        return;
      }

      // Compute which data points are selected
      const [[x0, y0], [x1, y1]] = event.selection as [[number, number], [number, number]];

      const selectedIndices: number[] = [];
      const currentState = store.state;
      if (!currentState) return;

      dataCircles(svg).forEach((circle, index) => {
        const cx = parseFloat(circle.getAttribute('cx') || '0');
        const cy = parseFloat(circle.getAttribute('cy') || '0');

        if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) {
          if (index < currentState.filteredData.length) selectedIndices.push(index);
        }
      });

      // Report the points the brush actually caught.
      //
      // This used to dispatch `selectRange: [min, max]`, and `selectRange`
      // describes a *contiguous* span — so brushing the first and last points
      // of a scattered cloud selected every point between them too, and the
      // user saw rows highlighted that the gesture never touched.
      //
      // Dispatched unconditionally, where the old code returned early on an
      // empty result: a brush drawn over empty space left the previous
      // selection standing, which read as the gesture having done nothing.
      store.dispatch({ type: 'selectPoints', indices: selectedIndices });
    });

  // d3-brush installs into a <g>, not the <svg> root: @types/d3-brush types
  // BrushBehavior as callable only on Selection<SVGGElement, ...>. The behaviour
  // is unchanged — with no explicit .extent(), d3 falls back to defaultExtent,
  // which reads `this.ownerSVGElement || this`, and for this <g> that is the
  // same <svg> it used before. Appended last, so it keeps its old z-order.
  const brushGroup = select(svg).append('g').attr('class', 'cs-brush');
  brushGroup.call(brushBehavior);

  // Return cleanup function
  return () => {
    brushGroup.on('.brush', null);
    brushGroup.remove();
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
    fill: hsl(var(--muted-foreground, 216.9 19.1% 26.7%));
  }

  .chart-primitive :global(.plot-axis) {
    font-size: 12px;
  }
</style>
