/**
 * @file plot-builder.ts
 * Utilities for building Observable Plot specifications
 */

import * as Plot from '@observablehq/plot';
import type { PlotSpec, ChartState, ChartConfig } from '../types/chart.types';

/**
 * Build a scatter plot specification
 */
export function buildScatterPlot<T>(
  state: ChartState<T>,
  config: ChartConfig
): any {
  const { filteredData, dimensions, transform, selection } = state;
  const { x = 'x', y = 'y', color, size = 5 } = config;

  // Calculate domains
  let xDomain: [number, number] | undefined;
  let yDomain: [number, number] | undefined;

  if (config.xDomain && config.xDomain !== 'auto') {
    xDomain = config.xDomain as [number, number];
  } else {
    xDomain = calculateDomain(filteredData, x);
  }

  if (config.yDomain && config.yDomain !== 'auto') {
    yDomain = config.yDomain as [number, number];
  } else {
    yDomain = calculateDomain(filteredData, y);
  }

  // Apply zoom transform
  if (transform.k !== 1 || transform.x !== 0 || transform.y !== 0) {
    xDomain = applyZoomToDomain(xDomain, transform, 'x');
    yDomain = applyZoomToDomain(yDomain, transform, 'y');
  }

  // Check if we have selections
  const hasSelection = selection.selectedIndices.length > 0;
  const selectedSet = new Set(selection.selectedIndices);

  return Plot.plot({
    width: dimensions.width,
    height: dimensions.height,
    marginLeft: 60,
    marginBottom: 40,
    marginTop: 20,
    marginRight: 20,

    marks: [
      // Grid
      Plot.gridY({ stroke: '#e5e7eb', strokeOpacity: 0.5 }),
      Plot.gridX({ stroke: '#e5e7eb', strokeOpacity: 0.5 }),

      // Data points - with selection highlighting
      Plot.dot(filteredData, {
        x,
        y,
        fill: color || '#3b82f6',
        r: size,
        fillOpacity: hasSelection
          ? (d, i) => (selectedSet.has(i) ? 1.0 : 0.2)  // Dim unselected
          : 0.7,
        stroke: hasSelection
          ? (d, i) => (selectedSet.has(i) ? '#000' : null)  // Stroke selected
          : null,
        strokeWidth: 2,
        tip: true  // Use Observable Plot's built-in tooltips
      }),

      // Axes
      Plot.axisX({ label: null }),
      Plot.axisY({ label: null })
    ],

    x: { domain: xDomain },
    y: { domain: yDomain }
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
  const { x = 'x', y = 'y', color = '#3b82f6' } = config;

  // Calculate domains
  let xDomain: [number, number] | undefined;
  let yDomain: [number, number] | undefined;

  if (config.xDomain && config.xDomain !== 'auto') {
    xDomain = config.xDomain as [number, number];
  } else {
    xDomain = calculateDomain(filteredData, x);
  }

  if (config.yDomain && config.yDomain !== 'auto') {
    yDomain = config.yDomain as [number, number];
  } else {
    yDomain = calculateDomain(filteredData, y);
  }

  // Apply zoom transform
  if (transform.k !== 1 || transform.x !== 0 || transform.y !== 0) {
    xDomain = applyZoomToDomain(xDomain, transform, 'x');
    yDomain = applyZoomToDomain(yDomain, transform, 'y');
  }

  return Plot.plot({
    width: dimensions.width,
    height: dimensions.height,
    marginLeft: 60,
    marginBottom: 40,
    marginTop: 20,
    marginRight: 20,

    marks: [
      // Grid
      Plot.gridY({ stroke: '#e5e7eb', strokeOpacity: 0.5 }),
      Plot.gridX({ stroke: '#e5e7eb', strokeOpacity: 0.5 }),

      // Line
      Plot.line(filteredData, {
        x,
        y,
        stroke: color,
        strokeWidth: 2,
        tip: true
      }),

      // Points on line
      Plot.dot(filteredData, {
        x,
        y,
        fill: color,
        r: 3,
        tip: true
      }),

      // Axes
      Plot.axisX({ label: null }),
      Plot.axisY({ label: null })
    ],

    x: { domain: xDomain },
    y: { domain: yDomain }
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
  const { x = 'x', y = 'y', color = '#3b82f6' } = config;

  return Plot.plot({
    width: dimensions.width,
    height: dimensions.height,
    marginLeft: 60,
    marginBottom: 60,  // More space for labels
    marginTop: 20,
    marginRight: 20,

    marks: [
      // Grid
      Plot.gridY({ stroke: '#e5e7eb', strokeOpacity: 0.5 }),

      // Bars
      Plot.barY(filteredData, {
        x,
        y,
        fill: color,
        fillOpacity: 0.8,
        tip: true
      }),

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
  const { x = 'x', y = 'y', color = '#3b82f6' } = config;

  // Calculate domains
  let xDomain: [number, number] | undefined;
  let yDomain: [number, number] | undefined;

  if (config.xDomain && config.xDomain !== 'auto') {
    xDomain = config.xDomain as [number, number];
  } else {
    xDomain = calculateDomain(filteredData, x);
  }

  if (config.yDomain && config.yDomain !== 'auto') {
    yDomain = config.yDomain as [number, number];
  } else {
    yDomain = calculateDomain(filteredData, y);
  }

  // Apply zoom transform
  if (transform.k !== 1 || transform.x !== 0 || transform.y !== 0) {
    xDomain = applyZoomToDomain(xDomain, transform, 'x');
    yDomain = applyZoomToDomain(yDomain, transform, 'y');
  }

  return Plot.plot({
    width: dimensions.width,
    height: dimensions.height,
    marginLeft: 60,
    marginBottom: 40,
    marginTop: 20,
    marginRight: 20,

    marks: [
      // Grid
      Plot.gridY({ stroke: '#e5e7eb', strokeOpacity: 0.5 }),
      Plot.gridX({ stroke: '#e5e7eb', strokeOpacity: 0.5 }),

      // Area
      Plot.areaY(filteredData, {
        x,
        y,
        fill: color,
        fillOpacity: 0.3,
        tip: true
      }),

      // Line on top
      Plot.line(filteredData, {
        x,
        y,
        stroke: color,
        strokeWidth: 2
      }),

      // Axes
      Plot.axisX({ label: null }),
      Plot.axisY({ label: null })
    ],

    x: { domain: xDomain },
    y: { domain: yDomain }
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
  const { x = 'x', color = '#3b82f6', bins, thresholds } = config;

  return Plot.plot({
    width: dimensions.width,
    height: dimensions.height,
    marginLeft: 60,
    marginBottom: 40,
    marginTop: 20,
    marginRight: 20,

    marks: [
      // Grid
      Plot.gridY({ stroke: '#e5e7eb', strokeOpacity: 0.5 }),

      // Histogram
      Plot.rectY(
        filteredData,
        Plot.binX(
          { y: 'count' },
          {
            x,
            ...(color ? { fill: color as any } : {}),
            fillOpacity: 0.8,
            tip: true,
            ...(bins ? { thresholds: bins } : {}),
            ...(thresholds ? { thresholds } : {})
          } as any
        )
      ),

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
 * Apply zoom transform to domain
 * Converts screen-space transform to data-space domain
 */
export function applyZoomToDomain(
  domain: [number, number],
  transform: { x: number; y: number; k: number },
  axis: 'x' | 'y'
): [number, number] {
  if (transform.k === 1 && transform.x === 0 && transform.y === 0) {
    return domain;
  }

  const [min, max] = domain;
  const range = max - min;
  const center = (min + max) / 2;
  const scale = transform.k;

  // Zooming: scale > 1 means zoom in (smaller range), scale < 1 means zoom out (larger range)
  const newRange = range / scale;

  // Center the zoom around the middle of the domain
  const newMin = center - newRange / 2;
  const newMax = center + newRange / 2;

  return [newMin, newMax];
}

/**
 * Calculate domain from data
 * Returns [min, max] for numeric data
 */
export function calculateDomain<T>(
  data: T[],
  accessor: string | ((d: T) => number)
): [number, number] {
  if (data.length === 0) return [0, 1];

  const getValue = typeof accessor === 'string'
    ? (d: T) => (d as any)[accessor]
    : accessor;

  const values = data.map(getValue).filter((v): v is number => typeof v === 'number' && !isNaN(v));

  if (values.length === 0) return [0, 1];

  const min = Math.min(...values);
  const max = Math.max(...values);

  // Add 5% padding
  const padding = (max - min) * 0.05;

  return [min - padding, max + padding];
}
