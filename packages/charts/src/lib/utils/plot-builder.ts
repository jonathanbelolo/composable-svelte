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
  const { filteredData, selection, dimensions } = state;
  const { x = 'x', y = 'y', color, size = 5 } = config;

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

      // Data points
      Plot.dot(filteredData, {
        x,
        y,
        fill: color || '#3b82f6',
        r: size,
        fillOpacity: 0.7,
        tip: true  // Use Observable Plot's built-in tooltips
      }),

      // Axes
      Plot.axisX({ label: null }),
      Plot.axisY({ label: null })
    ],

    ...(config.xDomain && config.xDomain !== 'auto' ? { x: { domain: config.xDomain } } : {}),
    ...(config.yDomain && config.yDomain !== 'auto' ? { y: { domain: config.yDomain } } : {})
  });
}

/**
 * Build a line chart specification
 */
export function buildLineChart<T>(
  state: ChartState<T>,
  config: ChartConfig
): any {
  const { filteredData, dimensions } = state;
  const { x = 'x', y = 'y', color = '#3b82f6' } = config;

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

    ...(config.xDomain && config.xDomain !== 'auto' ? { x: { domain: config.xDomain } } : {}),
    ...(config.yDomain && config.yDomain !== 'auto' ? { y: { domain: config.yDomain } } : {})
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
  const { filteredData, dimensions } = state;
  const { x = 'x', y = 'y', color = '#3b82f6' } = config;

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

    ...(config.xDomain && config.xDomain !== 'auto' ? { x: { domain: config.xDomain } } : {}),
    ...(config.yDomain && config.yDomain !== 'auto' ? { y: { domain: config.yDomain } } : {})
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
            fill: color,
            fillOpacity: 0.8,
            tip: true,
            ...(bins ? { thresholds: bins } : {}),
            ...(thresholds ? { thresholds } : {})
          }
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
 * Apply zoom transform to plot specification
 * This will be used for zoom/pan functionality
 */
export function applyZoomTransform(spec: any, transform: { x: number; y: number; k: number }): any {
  // For now, return spec as-is
  // Will implement actual zoom transform logic when D3 zoom is integrated
  return spec;
}
