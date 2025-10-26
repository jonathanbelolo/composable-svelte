/**
 * Counter feature implementation.
 *
 * Demonstrates:
 * - State type definition
 * - Action discriminated union
 * - Pure reducer function
 * - Effect.run() for async operations
 */

import { Effect, type Reducer } from '@composable-svelte/core';

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

// ============================================================================
// Reducer
// ============================================================================

export const counterReducer: Reducer<CounterState, CounterAction> = (state, action) => {
  switch (action.type) {
    case 'incrementTapped':
      return [
        { ...state, count: state.count + 1 },
        Effect.none()
      ];

    case 'decrementTapped':
      return [
        { ...state, count: state.count - 1 },
        Effect.none()
      ];

    case 'resetTapped':
      return [
        { ...initialState },
        Effect.none()
      ];

    case 'loadFactTapped':
      return [
        { ...state, isLoading: true, error: null },
        Effect.run(async (dispatch) => {
          try {
            const response = await fetch(
              `http://numbersapi.com/${state.count}/trivia`
            );
            const fact = await response.text();
            dispatch({ type: 'factLoaded', fact });
          } catch (error) {
            const message = error instanceof Error
              ? error.message
              : 'Unknown error';
            dispatch({ type: 'factLoadFailed', error: message });
          }
        })
      ];

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
