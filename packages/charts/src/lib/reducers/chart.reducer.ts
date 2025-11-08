/**
 * @file chart.reducer.ts
 * @description
 * Core chart state management using the Composable Architecture pattern.
 * This reducer handles all chart state transitions including data updates,
 * selections, zoom/pan, and dimension changes.
 */

import type { Reducer } from '@composable-svelte/core';
import type { ChartState, ChartAction } from '../types/chart.types';
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
 * - `updateSpec` - Update Observable Plot specification
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

    case 'brushMove': {
      // Will be implemented with actual data filtering logic
      return [
        {
          ...state,
          selection: {
            ...state.selection,
            type: 'brush',
            brushExtent: action.extent
          }
        },
        Effect.none()
      ];
    }

    case 'brushEnd': {
      // Finalize selection based on brush extent
      return [state, Effect.none()];
    }

    case 'clearSelection': {
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

    case 'updateSpec': {
      return [
        {
          ...state,
          spec: {
            ...state.spec,
            ...action.spec
          }
        },
        Effect.none()
      ];
    }

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
 * - `transitionDuration`: 0.3s
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
 * @param {Partial<ChartState['spec']>} [config.spec={}] - Observable Plot specification overrides
 * @param {{width: number, height: number}} [config.dimensions] - Chart dimensions (default: 600x400)
 * @returns {ChartState<T>} Initial chart state
 *
 * @see {@link ChartState} for full state structure
 * @see {@link chartReducer} for state transitions
 */
export function createInitialChartState<T = unknown>(config: {
  data?: T[];
  spec?: Partial<ChartState['spec']>;
  dimensions?: { width: number; height: number };
}): ChartState<T> {
  const data = config.data ?? [];

  return {
    data,
    filteredData: data,
    spec: config.spec ?? {},
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
    transitionDuration: 0.3
  };
}
