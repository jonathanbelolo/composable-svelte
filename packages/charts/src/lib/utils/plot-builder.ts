/**
 * @file plot-builder.ts
 * Utilities for building Observable Plot specifications
 */

import * as Plot from '@observablehq/plot';
import type { ChartState, ChartConfig } from '../types/chart.types.js';
import {
  DATA_COLOR,
  DATA_OPACITY,
  DIMMED_OPACITY,
  AREA_FILL_OPACITY,
  GRID_COLOR,
  GRID_OPACITY,
  MARKER_INK
} from './palette.js';

/**
 * Build a scatter plot specification
 */
export function buildScatterPlot<T>(
  state: ChartState<T>,
  config: ChartConfig
): any {
  const { filteredData, dimensions, transform, selection } = state;
  const { x = 'x', y = 'y', color, size = 5, enableTooltip = true } = config;

  // Calculate domains
  let xDomain: [number, number] | undefined;
  let yDomain: [number, number] | undefined;

  if (config.xDomain && config.xDomain !== 'auto') {
    xDomain = config.xDomain as [number, number];
  } else {
    const calculatedXDomain = calculateDomain(filteredData, x);
    if (calculatedXDomain && typeof calculatedXDomain[0] === 'number') {
      xDomain = calculatedXDomain as [number, number];
    }
  }

  if (config.yDomain && config.yDomain !== 'auto') {
    yDomain = config.yDomain as [number, number];
  } else {
    const calculatedYDomain = calculateDomain(filteredData, y);
    if (calculatedYDomain && typeof calculatedYDomain[0] === 'number') {
      yDomain = calculatedYDomain as [number, number];
    }
  }

  // Apply zoom transform (only to numeric domains)
  if (transform.k !== 1 || transform.x !== 0 || transform.y !== 0) {
    const inner = innerExtent(dimensions);
    if (xDomain) {
      xDomain = applyZoomToDomain(xDomain, transform, 'x', inner.width);
    }
    if (yDomain) {
      yDomain = applyZoomToDomain(yDomain, transform, 'y', inner.height);
    }
  }

  // Check if we have selections
  const hasSelection = selection.selectedIndices.length > 0;
  const selectedSet = new Set(selection.selectedIndices);

  return Plot.plot({
    width: dimensions.width,
    height: dimensions.height,
    marginLeft: PLOT_MARGIN.left,
    marginBottom: PLOT_MARGIN.bottom,
    marginTop: PLOT_MARGIN.top,
    marginRight: PLOT_MARGIN.right,

    marks: [
      // Grid
      Plot.gridY({ stroke: GRID_COLOR, strokeOpacity: GRID_OPACITY }),
      Plot.gridX({ stroke: GRID_COLOR, strokeOpacity: GRID_OPACITY }),

      // Data points - with selection highlighting
      Plot.dot(filteredData, {
        x,
        y,
        fill: color || DATA_COLOR,
        r: size,
        fillOpacity: hasSelection
          ? (d, i) => (selectedSet.has(i) ? DATA_OPACITY : DIMMED_OPACITY)
          : DATA_OPACITY,
        // A constant stroke varied by opacity, never a per-datum `null`.
        //
        // This channel used to return `null` for unselected points, and Plot
        // *drops* a datum whose channel value is null rather than drawing it
        // without that property — so selecting one point deleted every other
        // point from the chart. The intent was to dim them; the effect was to
        // erase them, and the `fillOpacity` line above spent its effort on rows
        // that were no longer there.
        stroke: MARKER_INK,
        strokeOpacity: hasSelection ? (d, i) => (selectedSet.has(i) ? 1 : 0) : 0,
        strokeWidth: 2,
        tip: enableTooltip  // Observable Plot's built-in tooltips
      }),

      // Selected points, then the keyboard cursor on top of them. Both are
      // `null` when there is nothing to draw, and Plot ignores a null mark.
      selectionMark(state, config),
      focusMark(state, config),

      // Axes
      Plot.axisX({ label: null }),
      Plot.axisY({ label: null })
    ],

    ...(xDomain ? { x: { domain: xDomain } } : {}),
    ...(yDomain ? { y: { domain: yDomain } } : {})
  });
}

/**
 * Build a line chart specification
 */
export function buildLineChart<T>(
  state: ChartState<T>,
  config: ChartConfig
): any {
  const { filteredData, dimensions, transform } = state;
  const { x = 'x', y = 'y', color = DATA_COLOR, enableTooltip = true } = config;

  // Same pair the scatter builder computes: which rows are selected, so the
  // per-datum mark below can dim the rest.
  const hasSelection = state.selection.selectedIndices.length > 0;
  const selectedSet = new Set(state.selection.selectedIndices);

  // Calculate domains
  let xDomain: [number, number] | undefined;
  let yDomain: [number, number] | undefined;

  if (config.xDomain && config.xDomain !== 'auto') {
    xDomain = config.xDomain as [number, number];
  } else {
    const calculatedXDomain = calculateDomain(filteredData, x);
    // Only set domain if it's numeric (not temporal)
    if (calculatedXDomain && typeof calculatedXDomain[0] === 'number') {
      xDomain = calculatedXDomain as [number, number];
    }
  }

  if (config.yDomain && config.yDomain !== 'auto') {
    yDomain = config.yDomain as [number, number];
  } else {
    const calculatedYDomain = calculateDomain(filteredData, y);
    if (calculatedYDomain && typeof calculatedYDomain[0] === 'number') {
      yDomain = calculatedYDomain as [number, number];
    }
  }

  // Apply zoom transform (only to numeric domains)
  if (transform.k !== 1 || transform.x !== 0 || transform.y !== 0) {
    const inner = innerExtent(dimensions);
    if (xDomain) {
      xDomain = applyZoomToDomain(xDomain, transform, 'x', inner.width);
    }
    if (yDomain) {
      yDomain = applyZoomToDomain(yDomain, transform, 'y', inner.height);
    }
  }

  return Plot.plot({
    width: dimensions.width,
    height: dimensions.height,
    marginLeft: PLOT_MARGIN.left,
    marginBottom: PLOT_MARGIN.bottom,
    marginTop: PLOT_MARGIN.top,
    marginRight: PLOT_MARGIN.right,

    marks: [
      // Grid
      Plot.gridY({ stroke: GRID_COLOR, strokeOpacity: GRID_OPACITY }),
      Plot.gridX({ stroke: GRID_COLOR, strokeOpacity: GRID_OPACITY }),

      // Line
      Plot.line(filteredData, {
        x,
        y,
        stroke: color,
        strokeWidth: 2,
        tip: enableTooltip
      }),

      // Points on line
      Plot.dot(filteredData, {
        x,
        y,
        fill: color,
        r: 3,
        fillOpacity: hasSelection ? (d, i) => (selectedSet.has(i) ? DATA_OPACITY : DIMMED_OPACITY) : DATA_OPACITY,
        tip: enableTooltip
      }),

      // Selected points, then the keyboard cursor on top of them. Both are
      // `null` when there is nothing to draw, and Plot ignores a null mark.
      selectionMark(state, config),
      focusMark(state, config),

      // Axes
      Plot.axisX({ label: null }),
      Plot.axisY({ label: null })
    ],

    ...(xDomain ? { x: { domain: xDomain } } : {}),
    ...(yDomain ? { y: { domain: yDomain } } : {})
  });
}

/**
 * Build a bar chart specification
 */
export function buildBarChart<T>(
  state: ChartState<T>,
  config: ChartConfig
): any {
  const { filteredData, dimensions } = state;
  const { x = 'x', y = 'y', color = DATA_COLOR, enableTooltip = true } = config;

  // Same pair the scatter builder computes: which rows are selected, so the
  // per-datum mark below can dim the rest.
  const hasSelection = state.selection.selectedIndices.length > 0;
  const selectedSet = new Set(state.selection.selectedIndices);

  return Plot.plot({
    width: dimensions.width,
    height: dimensions.height,
    marginLeft: PLOT_MARGIN.left,
    // Deeper than the shared bottom margin: category labels need the room.
    // Harmless for panning, which this chart type does not apply.
    marginBottom: PLOT_MARGIN.bottom + 20,
    marginTop: PLOT_MARGIN.top,
    marginRight: PLOT_MARGIN.right,

    marks: [
      // Grid
      Plot.gridY({ stroke: GRID_COLOR, strokeOpacity: GRID_OPACITY }),

      // Bars
      Plot.barY(filteredData, {
        x,
        y,
        fill: color,
        fillOpacity: hasSelection ? (d, i) => (selectedSet.has(i) ? DATA_OPACITY : DIMMED_OPACITY) : DATA_OPACITY,
        tip: enableTooltip
      }),

      // Selected points, then the keyboard cursor on top of them. Both are
      // `null` when there is nothing to draw, and Plot ignores a null mark.
      selectionMark(state, config),
      focusMark(state, config),

      // Axes
      Plot.axisX({ label: null, tickRotate: -45 }),  // Rotate labels for readability
      Plot.axisY({ label: null })
    ],

    // Explicitly configure categorical x-axis
    x: { padding: 0.2 },
    ...(config.yDomain && config.yDomain !== 'auto' ? { y: { domain: config.yDomain } } : {})
  });
}

/**
 * Build an area chart specification
 */
export function buildAreaChart<T>(
  state: ChartState<T>,
  config: ChartConfig
): any {
  const { filteredData, dimensions, transform } = state;
  const { x = 'x', y = 'y', color = DATA_COLOR, enableTooltip = true } = config;

  // Same pair the scatter builder computes: which rows are selected, so the
  // per-datum mark below can dim the rest.
  const hasSelection = state.selection.selectedIndices.length > 0;
  const selectedSet = new Set(state.selection.selectedIndices);

  // Calculate domains
  let xDomain: [number, number] | undefined;
  let yDomain: [number, number] | undefined;

  if (config.xDomain && config.xDomain !== 'auto') {
    xDomain = config.xDomain as [number, number];
  } else {
    const calculatedXDomain = calculateDomain(filteredData, x);
    // Only set domain if it's numeric (not temporal)
    if (calculatedXDomain && typeof calculatedXDomain[0] === 'number') {
      xDomain = calculatedXDomain as [number, number];
    }
  }

  if (config.yDomain && config.yDomain !== 'auto') {
    yDomain = config.yDomain as [number, number];
  } else {
    const calculatedYDomain = calculateDomain(filteredData, y);
    if (calculatedYDomain && typeof calculatedYDomain[0] === 'number') {
      yDomain = calculatedYDomain as [number, number];
    }
  }

  // Apply zoom transform (only to numeric domains)
  if (transform.k !== 1 || transform.x !== 0 || transform.y !== 0) {
    const inner = innerExtent(dimensions);
    if (xDomain) {
      xDomain = applyZoomToDomain(xDomain, transform, 'x', inner.width);
    }
    if (yDomain) {
      yDomain = applyZoomToDomain(yDomain, transform, 'y', inner.height);
    }
  }

  return Plot.plot({
    width: dimensions.width,
    height: dimensions.height,
    marginLeft: PLOT_MARGIN.left,
    marginBottom: PLOT_MARGIN.bottom,
    marginTop: PLOT_MARGIN.top,
    marginRight: PLOT_MARGIN.right,

    marks: [
      // Grid
      Plot.gridY({ stroke: GRID_COLOR, strokeOpacity: GRID_OPACITY }),
      Plot.gridX({ stroke: GRID_COLOR, strokeOpacity: GRID_OPACITY }),

      // Area
      Plot.areaY(filteredData, {
        x,
        y,
        fill: color,
        fillOpacity: AREA_FILL_OPACITY,
        tip: enableTooltip
      }),

      // Line on top
      Plot.line(filteredData, {
        x,
        y,
        stroke: color,
        strokeWidth: 2
      }),

      // Selected points, then the keyboard cursor on top of them. Both are
      // `null` when there is nothing to draw, and Plot ignores a null mark.
      selectionMark(state, config),
      focusMark(state, config),

      // Axes
      Plot.axisX({ label: null }),
      Plot.axisY({ label: null })
    ],

    ...(xDomain ? { x: { domain: xDomain } } : {}),
    ...(yDomain ? { y: { domain: yDomain } } : {})
  });
}

/**
 * Build a histogram specification
 */
export function buildHistogram<T>(
  state: ChartState<T>,
  config: ChartConfig & { bins?: number; thresholds?: number[] }
): any {
  const { filteredData, dimensions } = state;
  const { x = 'x', color = DATA_COLOR, bins, thresholds, enableTooltip = true } = config;

  return Plot.plot({
    width: dimensions.width,
    height: dimensions.height,
    marginLeft: PLOT_MARGIN.left,
    marginBottom: PLOT_MARGIN.bottom,
    marginTop: PLOT_MARGIN.top,
    marginRight: PLOT_MARGIN.right,

    marks: [
      // Grid
      Plot.gridY({ stroke: GRID_COLOR, strokeOpacity: GRID_OPACITY }),

      // Histogram
      Plot.rectY(
        filteredData,
        Plot.binX(
          { y: 'count' },
          {
            x,
            ...(color ? { fill: color as any } : {}),
            fillOpacity: DATA_OPACITY,
            tip: enableTooltip,
            ...(bins ? { thresholds: bins } : {}),
            ...(thresholds ? { thresholds } : {})
          } as any
        )
      ),

      // Rules rather than rings: a binned chart has no per-datum y to mark.
      selectionMark(state, config, 'rule'),
      focusMark(state, config, 'rule'),

      // Axes
      Plot.axisX({ label: null }),
      Plot.axisY({ label: null, tickFormat: 'd' })
    ]
  });
}

/**
 * Generic plot builder that delegates to specific builders
 */
export function buildPlot<T>(
  state: ChartState<T>,
  config: ChartConfig & { type?: 'scatter' | 'line' | 'bar' | 'area' | 'histogram' }
): any {
  const type = config.type || 'scatter';

  switch (type) {
    case 'scatter':
      return buildScatterPlot(state, config);
    case 'line':
      return buildLineChart(state, config);
    case 'bar':
      return buildBarChart(state, config);
    case 'area':
      return buildAreaChart(state, config);
    case 'histogram':
      return buildHistogram(state, config);
    default:
      return buildScatterPlot(state, config);
  }
}

/**
 * The margins every zoomable builder passes to `Plot.plot`. Named because the
 * *inner* extent — the size the domain actually maps onto — is what a pan has
 * to be measured against, and three builders were repeating these numbers.
 */
const PLOT_MARGIN = { left: 60, right: 20, top: 20, bottom: 40 } as const;

/** The plot area's width and height, excluding margins. */
function innerExtent(dimensions: { width: number; height: number }): {
  width: number;
  height: number;
} {
  return {
    width: Math.max(1, dimensions.width - PLOT_MARGIN.left - PLOT_MARGIN.right),
    height: Math.max(1, dimensions.height - PLOT_MARGIN.top - PLOT_MARGIN.bottom)
  };
}

/**
 * Convert a d3-zoom screen transform into the data domain it makes visible.
 *
 * d3-zoom maps a screen position `s` to `k * s + t`. Inverting that gives the
 * screen window the viewport now shows, `[-t/k, (extent - t)/k]`, which scales
 * onto the original domain.
 *
 * This used to read `transform.x` and `transform.y` **only inside the
 * early-return guard**. Past it, the window was `center ± range/2` computed
 * from the domain's own midpoint — so a pure pan at `k === 1` fell through the
 * guard and returned the original domain bit-for-bit, and any zoom was always
 * centred on the middle of the data no matter where the user had dragged or
 * pointed. Dragging did nothing while d3-zoom dispatched a `zoom` per frame,
 * rebuilding the entire Plot each time to draw an identical image.
 *
 * `axis` was a required parameter the body never referenced. It selects which
 * translate component applies, which is the only thing it could ever have
 * meant.
 *
 * `extent` is the axis's length in pixels — the plot's *inner* size, since that
 * is what the domain maps onto. The transform itself comes from d3-zoom
 * attached to the whole SVG, so a pan is accurate to within the margins rather
 * than exactly; that is a bounded approximation, where before there was no
 * motion at all.
 */
export function applyZoomToDomain(
  domain: [number, number],
  transform: { x: number; y: number; k: number },
  axis: 'x' | 'y',
  extent: number
): [number, number] {
  if (transform.k === 1 && transform.x === 0 && transform.y === 0) {
    return domain;
  }

  const [min, max] = domain;
  const range = max - min;
  const translate = axis === 'x' ? transform.x : transform.y;

  // The screen window, as fractions of the extent.
  const startFraction = -translate / transform.k / extent;
  const endFraction = (extent - translate) / transform.k / extent;

  // Screen y grows downward while the y domain grows upward, so the y axis maps
  // the window from `max` down rather than from `min` up.
  if (axis === 'y') {
    return [max - endFraction * range, max - startFraction * range];
  }
  return [min + startFraction * range, min + endFraction * range];
}

/**
 * The selected points, drawn on top of whatever mark the chart type uses.
 *
 * `state.selection` was read by `buildScatterPlot` alone, so on the other four
 * types a selection was real in the store, reported through `onSelectionChange`,
 * announced to a screen reader — and invisible. The README recorded that as a
 * known gap for long enough that it outlived two rounds of review.
 *
 * An overlay rather than per-mark styling, because the five types have nothing
 * in common to style: an area chart is a single path, and a histogram's rects
 * are bins rather than rows. A point is the one thing every type can be asked
 * where it put.
 *
 * **Selected is filled, focused is a ring**, and the two nest rather than
 * compete: a point that is both shows a filled dot inside an outer ring. The
 * radii are chosen so that stays legible — `size + 1` here against `size + 4`
 * for focus.
 */
export function selectionMark<T>(
  state: ChartState<T>,
  config: ChartConfig,
  kind: 'point' | 'rule' = 'point'
): any | null {
  const { selection, filteredData } = state;
  if (selection.selectedIndices.length === 0) return null;

  const selected = selection.selectedIndices
    .map((index) => filteredData[index])
    .filter((datum): datum is T => datum !== undefined);
  if (selected.length === 0) return null;

  if (kind === 'rule') {
    if (!config.x) return null;
    return Plot.ruleX(selected, {
      x: config.x as any,
      // Solid, where the focus rule is dashed — the two are told apart by line
      // style rather than by colour, so the distinction survives a colour-blind
      // reader and a greyscale print.
      stroke: MARKER_INK,
      strokeWidth: 2
    });
  }

  return Plot.dot(selected, {
    x: config.x as any,
    y: config.y as any,
    r: (config.size ?? 5) + 1,
    fill: (config.color as any) || DATA_COLOR,
    fillOpacity: DATA_OPACITY,
    stroke: MARKER_INK,
    strokeWidth: 1.5
  });
}

/**
 * Turn the `string | (d) => value` accessor shape every chart prop uses into a
 * plain function.
 *
 * Extracted from `calculateDomain`, which held the only copy, because
 * `Chart.svelte` needs the same resolution to read a focused datum's values for
 * its live region — and a second hand-rolled copy is how two readers of one
 * convention drift apart.
 */
export function resolveAccessor<T, V = any>(
  accessor: string | ((d: T) => V)
): (d: T) => V {
  return typeof accessor === 'string' ? (d: T) => (d as any)[accessor] : accessor;
}

/**
 * A ring around the point the keyboard cursor is on, or `null` when there is no
 * cursor.
 *
 * Appended by every builder, not only `buildScatterPlot`. The selection
 * highlight is scatter-only and documented as such in the README — but focus is
 * different in kind: a sighted keyboard user pressing an arrow has to see
 * *something* move, and a chart where the cursor is invisible offers navigation
 * that only a screen reader can follow.
 *
 * `kind: 'rule'` exists for the histogram, which bins its rows: there is no
 * per-datum `y` to ring, so the cursor is drawn as a vertical rule at the
 * datum's x — where in the distribution the point falls, which is the honest
 * answer for a binned chart rather than a dot at a coordinate that means nothing.
 */
export function focusMark<T>(
  state: ChartState<T>,
  config: ChartConfig,
  kind: 'point' | 'rule' = 'point'
): any | null {
  const { focusedIndex, filteredData } = state;
  if (focusedIndex === null) return null;

  const datum = filteredData[focusedIndex];
  if (datum === undefined) return null;

  if (kind === 'rule') {
    if (!config.x) return null;
    return Plot.ruleX([datum], {
      x: config.x as any,
      stroke: MARKER_INK,
      strokeWidth: 2,
      strokeDasharray: '4 2'
    });
  }

  return Plot.dot([datum], {
    x: config.x as any,
    y: config.y as any,
    // Sits outside the plotted dot rather than on top of it, so the ring reads
    // as an annotation and the point's own colour stays legible underneath.
    r: (config.size ?? 5) + 4,
    fill: 'none',
    stroke: MARKER_INK,
    strokeWidth: 2
  });
}

/**
 * Calculate domain from data
 * Returns [min, max] for numeric data or temporal data
 */
export function calculateDomain<T>(
  data: T[],
  accessor: string | ((d: T) => number | Date)
): [number, number] | [Date, Date] | undefined {
  if (data.length === 0) return [0, 1];

  const values = data.map(resolveAccessor(accessor));

  // Check if values are Date objects
  const firstValue = values.find(v => v != null);
  if (firstValue instanceof Date) {
    // For dates, return undefined to let Observable Plot infer the domain
    return undefined;
  }

  // Filter to only numeric values
  const numericValues = values.filter((v): v is number => typeof v === 'number' && !isNaN(v));

  if (numericValues.length === 0) return [0, 1];

  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);

  // Add 5% padding
  const padding = (max - min) * 0.05;

  return [min - padding, max + padding];
}
