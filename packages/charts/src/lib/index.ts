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
  PlotSpec,
  DataTransform
} from './types/chart.types';
// NOTE: `DataTransforms` is intentionally not re-exported as a type here. The
// interface in chart.types.ts and the const in utils/data-transforms.ts share a
// name, and an explicit `export type` wins over the `export *` below — which
// hid the implementation and made the README's own example fail to compile.
// The value is what consumers call, so the value export is the one that stands.

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
