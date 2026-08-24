/**
 * @file chart.reducer.ts
 * @description
 * Core chart state management using the Composable Architecture pattern.
 * This reducer handles all chart state transitions including data updates,
 * selections, zoom/pan, and dimension changes.
 */

import type { Reducer } from '@composable-svelte/core';
import type { ChartState, ChartAction } from '../types/chart.types.js';
import { Effect } from '@composable-svelte/core';

/**
 * @function chartReducer
 * @description
 * Pure reducer function that manages all chart state transitions.
 * Follows the (state, action, deps) => [newState, effect] pattern.
 *
 * **Supported Actions:**
 * - `setData` - Replace entire dataset
 * - `filterData` - Filter data by predicate
 * - `clearFilters` - Reset to original dataset
 * - `selectPoint` - Select single data point
 * - `selectRange` - Select range of indices
 * - `brushStart/Move/End` - Brush selection workflow
 * - `clearSelection` - Clear all selections
 * - `zoom` - Update zoom transform
 * - `zoomAnimated` - Initiate animated zoom
 * - `zoomProgress` - Update transform during animation
 * - `zoomComplete` - Complete animation
 * - `resetZoom` - Reset to identity transform
 * - `resize` - Update chart dimensions
 *
 * @example
 * ```typescript
 * import { createStore } from '@composable-svelte/core';
 * import { chartReducer, createInitialChartState } from '@composable-svelte/charts';
 *
 * const store = createStore({
 *   initialState: createInitialChartState({ data: myData }),
 *   reducer: chartReducer,
 *   dependencies: {}
 * });
 *
 * // Dispatch actions
 * store.dispatch({ type: 'filterData', predicate: d => d.value > 100 });
 * store.dispatch({ type: 'zoom', transform: { x: 0, y: 0, k: 2 } });
 * ```
 *
 * @param {ChartState} state - Current chart state
 * @param {ChartAction} action - Action to process
 * @param {{}} _deps - Dependencies (unused)
 * @returns {[ChartState, Effect<ChartAction>]} Tuple of new state and effect
 *
 * @see {@link ChartState} for state structure
 * @see {@link ChartAction} for action types
 * @see {@link createInitialChartState} for state initialization
 */
export const chartReducer: Reducer<ChartState, ChartAction, {}> = (
  state,
  action,
  _deps
) => {
  switch (action.type) {
    // ========================================================================
    // Data Actions
    // ========================================================================

    case 'setData': {
      return [
        {
          ...state,
          data: action.data,
          filteredData: action.data
        },
        Effect.none()
      ];
    }

    case 'filterData': {
      const filteredData = state.data.filter(action.predicate);
      return [
        {
          ...state,
          filteredData
        },
        Effect.none()
      ];
    }

    case 'clearFilters': {
      return [
        {
          ...state,
          filteredData: state.data
        },
        Effect.none()
      ];
    }

    // ========================================================================
    // Selection Actions
    // ========================================================================

    case 'selectPoint': {
      // Idempotent by value, returning the *identical* state object. Re-clicking
      // an already-selected point is ordinary chart use, and allocating a fresh
      // `[action.data]` every time changed the array's identity, so `Chart`'s
      // narrowed `$derived` fired `onSelectionChange` again with equal contents.
      const sel = state.selection;
      if (
        sel.type === 'point' &&
        sel.selectedIndices.length === 1 &&
        sel.selectedIndices[0] === action.index &&
        sel.selectedData[0] === action.data
      ) {
        return [state, Effect.none()];
      }
      return [
        {
          ...state,
          selection: {
            type: 'point',
            selectedData: [action.data],
            selectedIndices: [action.index]
          }
        },
        Effect.none()
      ];
    }

    case 'selectRange': {
      const selectedIndices: number[] = [];
      const selectedData: any[] = [];

      state.filteredData.forEach((d, i) => {
        // Assuming numeric index-based selection
        if (i >= action.range[0] && i <= action.range[1]) {
          selectedIndices.push(i);
          selectedData.push(d);
        }
      });

      // Idempotent by value, same reasoning as `selectPoint` and
      // `clearSelection`. This is the case a real brush gesture hits:
      // `ChartPrimitive.svelte:275` dispatches it on every brush end, so
      // re-brushing the same points re-notified with equal contents.
      const prev = state.selection;
      if (
        prev.type === 'range' &&
        prev.range?.[0] === action.range[0] &&
        prev.range?.[1] === action.range[1] &&
        prev.selectedIndices.length === selectedIndices.length &&
        prev.selectedIndices.every((v, i) => v === selectedIndices[i])
      ) {
        return [state, Effect.none()];
      }

      return [
        {
          ...state,
          selection: {
            type: 'range',
            selectedData,
            selectedIndices,
            range: action.range
          }
        },
        Effect.none()
      ];
    }

    case 'brushStart': {
      return [
        {
          ...state,
          selection: {
            ...state.selection,
            type: 'brush'
          }
        },
        Effect.none()
      ];
    }

    case 'clearSelection': {
      // Idempotent by value, same reasoning. Reachable with nothing selected —
      // `ChartPrimitive.svelte:245` dispatches it whenever a brush is cleared.
      if (state.selection.type === 'none' && state.selection.selectedData.length === 0) {
        return [state, Effect.none()];
      }
      return [
        {
          ...state,
          selection: {
            type: 'none',
            selectedData: [],
            selectedIndices: []
          }
        },
        Effect.none()
      ];
    }

    // ========================================================================
    // Zoom/Pan Actions
    // ========================================================================

    case 'zoom': {
      return [
        {
          ...state,
          transform: action.transform
        },
        Effect.none()
      ];
    }

    case 'zoomAnimated': {
      // Start animation - component will handle the actual animation
      return [
        {
          ...state,
          isAnimating: true,
          // Store target transform for component to animate towards
          targetTransform: action.targetTransform
        },
        Effect.none()
      ];
    }

    case 'zoomProgress': {
      // Update transform during animation
      return [
        {
          ...state,
          transform: action.transform
        },
        Effect.none()
      ];
    }

    case 'zoomComplete': {
      // Animation finished
      // Remove targetTransform by destructuring it out
      const { targetTransform, ...restState } = state;
      return [
        {
          ...restState,
          isAnimating: false
        },
        Effect.none()
      ];
    }

    case 'resetZoom': {
      return [
        {
          ...state,
          isAnimating: true,
          targetTransform: {
            x: 0,
            y: 0,
            k: 1
          }
        },
        Effect.none()
      ];
    }

    // ========================================================================
    // Tooltip Actions - Handled by Observable Plot
    // ========================================================================
    // Removed: showTooltip, hideTooltip
    // Observable Plot handles tooltips natively with better edge case handling

    // ========================================================================
    // Dimension Actions
    // ========================================================================

    case 'resize': {
      return [
        {
          ...state,
          dimensions: action.dimensions
        },
        Effect.none()
      ];
    }

    // ========================================================================
    // Spec Updates
    // ========================================================================

    default: {
      const _exhaustive: never = action;
      return [state, Effect.none()];
    }
  }
};

/**
 * @function createInitialChartState
 * @description
 * Factory function that creates the initial state for a chart store.
 * Provides sensible defaults for all state fields while allowing
 * customization via the config parameter.
 *
 * **Default Values:**
 * - `data`: Empty array
 * - `filteredData`: Same as data
 * - `dimensions`: 600x400px
 * - `selection`: No selection (type: 'none')
 * - `transform`: Identity transform {x: 0, y: 0, k: 1}
 * - `isAnimating`: false
 * - `transitionDuration`: 400ms
 * - `spec`: Empty object (Observable Plot will use defaults)
 *
 * @example
 * ```typescript
 * import { createInitialChartState } from '@composable-svelte/charts';
 *
 * // With data
 * const state = createInitialChartState({
 *   data: [{ x: 1, y: 10 }, { x: 2, y: 20 }]
 * });
 *
 * // With custom dimensions
 * const state = createInitialChartState({
 *   data: myData,
 *   dimensions: { width: 800, height: 600 }
 * });
 *
 * // With Observable Plot spec customization
 * const state = createInitialChartState({
 *   data: myData,
 *   spec: {
 *     marginLeft: 60,
 *     marginBottom: 40,
 *     grid: true
 *   }
 * });
 * ```
 *
 * @template T - Type of data items in the dataset
 * @param {Object} config - Configuration object
 * @param {T[]} [config.data=[]] - Initial dataset
 * @param {{width: number, height: number}} [config.dimensions] - Chart dimensions (default: 600x400)
 * @returns {ChartState<T>} Initial chart state
 *
 * @see {@link ChartState} for full state structure
 * @see {@link chartReducer} for state transitions
 */
export function createInitialChartState<T = unknown>(config: {
  data?: T[];
  dimensions?: { width: number; height: number };
  /** Zoom animation length, in milliseconds. Default 400. */
  transitionDuration?: number;
}): ChartState<T> {
  const data = config.data ?? [];

  return {
    data,
    filteredData: data,
    dimensions: config.dimensions ?? { width: 600, height: 400 },
    selection: {
      type: 'none',
      selectedData: [],
      selectedIndices: []
    },
    transform: {
      x: 0,
      y: 0,
      k: 1
    },
    // Tooltips handled by Observable Plot (no state needed)
    isAnimating: false,
    transitionDuration: config.transitionDuration ?? 400
  };
}
