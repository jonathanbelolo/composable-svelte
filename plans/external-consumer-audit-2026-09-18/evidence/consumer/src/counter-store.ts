import { createStore, Effect } from '@composable-svelte/core';

interface CounterState {
  count: number;
  isLoading: boolean;
}

type CounterAction =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'incrementAsync' }
  | { type: 'incrementCompleted' };

const counterReducer = (
  state: CounterState,
  action: CounterAction,
  deps: {}
): [CounterState, Effect<CounterAction>] => {
  switch (action.type) {
    case 'increment':
      return [{ ...state, count: state.count + 1 }, Effect.none()];

    case 'decrement':
      return [{ ...state, count: state.count - 1 }, Effect.none()];

    case 'incrementAsync':
      return [
        { ...state, isLoading: true },
        Effect.run(async (dispatch) => {
          await new Promise(resolve => setTimeout(resolve, 1000));
          dispatch({ type: 'incrementCompleted' });
        })
      ];

    case 'incrementCompleted':
      return [
        { ...state, count: state.count + 1, isLoading: false },
        Effect.none()
      ];
  }
};

export const store = createStore({
  initialState: { count: 0, isLoading: false },
  reducer: counterReducer,
  dependencies: {}
});
