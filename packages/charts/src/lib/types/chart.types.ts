/**
 * @file chart.types.ts
 * Core type definitions for chart state and actions
 * Based on Phase 11 plan: Interactive Charts & Visualizations
 */

import type { Plot } from '@observablehq/plot';

/**
 * Chart state manages data, visualization config, and interactivity
 */
export interface ChartState<T = unknown> {
  // Data
  data: T[];
  filteredData: T[];

  // Visualization config
  spec: PlotSpec;
  dimensions: { width: number; height: number };

  // Interactivity state
  selection: SelectionState<T>;

  // Zoom/pan state
  transform: ZoomTransform;
  targetTransform?: ZoomTransform; // Target for animated zoom

  // Tooltips handled by Observable Plot (no state needed)

  // Animation state
  isAnimating: boolean;
  transitionDuration: number;
}

/**
 * Selection state for different selection modes
 */
export interface SelectionState<T = unknown> {
  type: 'none' | 'point' | 'range' | 'brush';
  selectedData: T[];
  selectedIndices: number[];
  brushExtent?: [[number, number], [number, number]]; // For 2D brush
  range?: [number, number]; // For 1D range selection
}

/**
 * Zoom transform state
 */
export interface ZoomTransform {
  x: number;
  y: number;
  k: number; // scale factor
}

// Note: TooltipState removed - Observable Plot handles tooltips natively

/**
 * Observable Plot specification
 * This will be passed to Plot.plot()
 */
export interface PlotSpec {
  marks?: any[]; // Plot marks (dot, line, bar, etc.)
  width?: number;
  height?: number;
  marginLeft?: number;
  marginRight?: number;
  marginTop?: number;
  marginBottom?: number;
  x?: any; // Scale config
  y?: any; // Scale config
  color?: any; // Color scale config
  [key: string]: any; // Allow other Plot options
}

/**
 * Chart actions
 */
export type ChartAction<T = unknown> =
  // Data actions
  | { type: 'setData'; data: T[] }
  | { type: 'filterData'; predicate: (d: T) => boolean }
  | { type: 'clearFilters' }

  // Selection actions
  | { type: 'selectPoint'; data: T; index: number }
  | { type: 'selectRange'; range: [number, number] }
  | { type: 'brushStart' }
  | { type: 'brushMove'; extent: [[number, number], [number, number]] }
  | { type: 'brushEnd' }
  | { type: 'clearSelection' }

  // Zoom/pan actions
  | { type: 'zoom'; transform: ZoomTransform }
  | { type: 'zoomAnimated'; targetTransform: ZoomTransform }
  | { type: 'zoomProgress'; transform: ZoomTransform }
  | { type: 'zoomComplete' }
  | { type: 'resetZoom' }

  // Tooltip actions - Handled by Observable Plot (no actions needed)

  // Dimension actions
  | { type: 'resize'; dimensions: { width: number; height: number } }

  // Spec updates
  | { type: 'updateSpec'; spec: Partial<PlotSpec> };

/**
 * Chart configuration
 */
export interface ChartConfig {
  // Data accessors
  x?: string | ((d: any) => any) | undefined;
  y?: string | ((d: any) => any) | undefined;
  color?: string | ((d: any) => any) | undefined;
  // Dot radius in px. Not an accessor like x/y/color: plot-builder destructures
  // it with `size = 5` and passes it straight to Plot's `r`.
  size?: number | undefined;

  // Domain overrides
  xDomain?: [number, number] | 'auto' | undefined;
  yDomain?: [number, number] | 'auto' | undefined;

  // Interaction flags
  enableZoom?: boolean | undefined;
  enableBrush?: boolean | undefined;
  enableTooltip?: boolean | undefined;

  // Animation
  enableAnimations?: boolean | undefined;
  transitionDuration?: number | undefined;
}

/**
 * Data transform operations
 */
export type DataTransform<T = any> = (data: T[]) => T[];

export interface DataTransforms {
  // Filtering
  filter: (predicate: (d: any) => boolean) => DataTransform;

  // Grouping
  groupBy: (key: string | ((d: any) => string)) => DataTransform;

  // Aggregation
  aggregate: (operation: 'sum' | 'mean' | 'median' | 'count', field: string) => DataTransform;

  // Sorting
  sortBy: (field: string, order: 'asc' | 'desc') => DataTransform;

  // Binning (for histograms)
  bin: (field: string, thresholds: number | number[]) => DataTransform;

  // Rolling window
  rollup: (window: number, operation: (values: number[]) => number) => DataTransform;
}
