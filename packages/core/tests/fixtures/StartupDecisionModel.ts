import {createStore} from '../../src/lib/store.svelte.js';
import {Effect} from '../../src/lib/effect.js';
import {rendererOwner} from '../../src/lib/application/renderer/owner.js';
import type {StoreExecutionConfig} from '../../src/lib/types.js';
export type DecisionState={route:string;booted:string[]};
export type DecisionAction={type:'go';route:string}|{type:'boot';route:string};
export function createDecisionModel(events:string[]){
 const execution:StoreExecutionConfig<DecisionState,DecisionAction>={mode:'managed',_initialization:{mode:'attached',startupDecision:state=>{events.push('decide:'+state.route);return{type:'boot',route:state.route};}}};
 const store=createStore<DecisionState,DecisionAction>({initialState:{route:'/server',booted:[]},execution,reducer:(state,action)=>[action.type==='go'?{...state,route:action.route}:{...state,booted:[...state.booted,action.route]},Effect.none()]});
 return{store,owner:rendererOwner(store,execution)};
}
