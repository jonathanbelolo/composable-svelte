import { Effect, type Reducer } from '@composable-svelte/core';

export type RequestState = {
  readonly query: string;
  readonly request: number;
  readonly phase: 'idle' | 'pending' | 'ready' | 'failed';
  readonly accepted: { readonly query: string; readonly value: string } | null;
};
export type RequestAction =
  | { type: 'search'; query: string }
  | { type: 'cancel' }
  | { type: 'received'; request: number; query: string; value: string }
  | { type: 'failed'; request: number };
export interface RequestDependencies {
  search(query: string, signal: AbortSignal | undefined): Promise<string>;
}
export const requestInitial = (): RequestState => ({ query: '', request: 0, phase: 'idle', accepted: null });

// The epoch protects already-enqueued/public result actions. Cancellation alone
// protects late executor callbacks, not every action already in the FIFO queue.
export const requestReducer: Reducer<RequestState, RequestAction, RequestDependencies> = (state, action, deps) => {
  switch (action.type) {
    case 'search': {
      const request = state.request + 1;
      return [{ ...state, query: action.query, request, phase: 'pending' },
        Effect.cancellable('search', async (dispatch, signal) => {
          try {
            const value = await deps.search(action.query, signal);
            dispatch({ type: 'received', request, query: action.query, value });
          } catch {
            // No callback-local abort check needed: managed dispatch is gated.
            dispatch({ type: 'failed', request });
          }
        })];
    }
    case 'cancel':
      return [{ ...state, request: state.request + 1, phase: 'idle' }, Effect.cancel('search')];
    case 'received':
      return action.request === state.request && state.phase === 'pending'
        ? [{ ...state, phase: 'ready', accepted: { query: action.query, value: action.value } }, Effect.none()]
        : [state, Effect.none()];
    case 'failed':
      return action.request === state.request && state.phase === 'pending'
        ? [{ ...state, phase: 'failed' }, Effect.none()] : [state, Effect.none()];
  }
};
