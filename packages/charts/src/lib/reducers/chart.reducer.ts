/**
 * @file chart.reducer.ts
 * Core chart state reducer
 * Handles all chart state transitions
 */

import type { Reducer } from '@composable-svelte/core';
import type { ChartState, ChartAction } from '../types/chart.types';
import { Effect } from '@composable-svelte/core';

/**
 * Chart reducer
 * Manages chart state transitions based on actions
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
            selectedIndices: [action.index],
            brushExtent: undefined,
            range: undefined
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
            range: action.range,
            brushExtent: undefined
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
            selectedIndices: [],
            brushExtent: undefined,
            range: undefined
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

    case 'resetZoom': {
      return [
        {
          ...state,
          transform: {
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
 * Create initial chart state
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
