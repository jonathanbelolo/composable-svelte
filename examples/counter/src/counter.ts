/**
 * Counter feature implementation.
 *
 * Demonstrates:
 * - State type definition
 * - Action discriminated union
 * - Pure reducer function
 * - Effect.cancellable() for cancellable async operations
 * - Injected fact dependencies
 */

import { Effect, type Reducer } from '@composable-svelte/core';
import { type FactService } from './facts.js';

// ============================================================================
// State
// ============================================================================

export interface CounterState {
  count: number;
  isLoading: boolean;
  fact: string | null;
  error: string | null;
}

export const initialState: CounterState = {
  count: 0,
  isLoading: false,
  fact: null,
  error: null
};

// ============================================================================
// Actions
// ============================================================================

export type CounterAction =
  | { type: 'incrementTapped' }
  | { type: 'decrementTapped' }
  | { type: 'resetTapped' }
  | { type: 'loadFactTapped' }
  | { type: 'factLoaded'; fact: string }
  | { type: 'factLoadFailed'; error: string };

export interface CounterDependencies {
  factService: FactService;
}

export const FACT_EFFECT_ID = 'counter/load-fact';

// ============================================================================
// Reducer
// ============================================================================

export const counterReducer: Reducer<CounterState, CounterAction, CounterDependencies> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'incrementTapped':
      return [
        { ...state, count: state.count + 1, fact: null, error: null, isLoading: false },
        Effect.cancel(FACT_EFFECT_ID)
      ];

    case 'decrementTapped':
      return [
        { ...state, count: state.count - 1, fact: null, error: null, isLoading: false },
        Effect.cancel(FACT_EFFECT_ID)
      ];

    case 'resetTapped':
      return [
        { ...initialState },
        Effect.cancel(FACT_EFFECT_ID)
      ];

    case 'loadFactTapped': {
      const factService = deps.factService;
      const count = state.count;
      return [
        { ...state, isLoading: true, error: null },
        Effect.cancellable(FACT_EFFECT_ID, async (dispatch, signal) => {
          try {
            const fact = await factService.getFact(count, signal);
            if (signal?.aborted) return;
            dispatch({ type: 'factLoaded', fact });
          } catch (error) {
            if (signal?.aborted) return;
            const message = error instanceof Error
              ? error.message
              : 'Unknown error';
            dispatch({ type: 'factLoadFailed', error: message });
          }
        })
      ];
    }

    case 'factLoaded':
      return [
        { ...state, isLoading: false, fact: action.fact },
        Effect.none()
      ];

    case 'factLoadFailed':
      return [
        { ...state, isLoading: false, error: action.error },
        Effect.none()
      ];

    default:
      // Exhaustiveness check
      const _exhaustive: never = action;
      return [state, Effect.none()];
  }
};
