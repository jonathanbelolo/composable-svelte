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
  DataTransform
} from './types/chart.types.js';
// NOTE: `DataTransforms` is intentionally not re-exported as a type here. The
// interface in chart.types.ts and the const in utils/data-transforms.ts share a
// name, and an explicit `export type` wins over the `export *` below — which
// hid the implementation and made the README's own example fail to compile.
// The value is what consumers call, so the value export is the one that stands.

// ============================================================================
// Reducers
// ============================================================================
export { chartReducer, createInitialChartState } from './reducers/chart.reducer.js';

// ============================================================================
// Components
// ============================================================================
export { default as Chart } from './components/Chart.svelte';
export { default as ChartPrimitive } from './components/ChartPrimitive.svelte';

// ============================================================================
// Utils
// ============================================================================
export * from './utils/plot-builder.js';
export * from './utils/data-transforms.js';
export * from './utils/responsive.js';
