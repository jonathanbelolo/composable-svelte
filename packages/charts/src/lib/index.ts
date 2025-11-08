/**
 * @composable-svelte/charts
 * Interactive data visualization components for Composable Svelte
 * Built with Observable Plot and D3
 *
 * @packageDocumentation
 */

// ============================================================================
// Types
// ============================================================================
export type {
  ChartState,
  ChartAction,
  ChartConfig,
  SelectionState,
  ZoomTransform,
  TooltipState,
  PlotSpec,
  DataTransform,
  DataTransforms
} from './types/chart.types';

// ============================================================================
// Reducers
// ============================================================================
export { chartReducer, createInitialChartState } from './reducers/chart.reducer';

// ============================================================================
// Components
// ============================================================================
export { default as Chart } from './components/Chart.svelte';
export { default as ChartPrimitive } from './components/ChartPrimitive.svelte';
export { default as ChartTooltip } from './components/ChartTooltip.svelte';

// ============================================================================
// Utils
// ============================================================================
export * from './utils/plot-builder';
export * from './utils/data-transforms';
export * from './utils/responsive';
