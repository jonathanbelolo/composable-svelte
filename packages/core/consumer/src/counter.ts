import { Effect, type Reducer } from '@composable-svelte/core';
export interface State { count: number; loading: boolean }
export type Action = {type:'increment'} | {type:'load'} | {type:'loaded';value:number} | {type:'failed'};
export interface Dependencies { load: () => Promise<number> }
export const reducer: Reducer<State, Action, Dependencies> = (state, action, deps) => {
  switch (action.type) {
    case 'increment': return [{...state, count:state.count+1}, Effect.none()];
    case 'load': return [{...state, loading:true}, Effect.run(async dispatch => {
      try { dispatch({type:'loaded', value:await deps.load()}); }
      catch { dispatch({type:'failed'}); }
    })];
    case 'loaded': return [{count:action.value, loading:false}, Effect.none()];
    case 'failed': return [{...state, loading:false}, Effect.none()];
  }
};
