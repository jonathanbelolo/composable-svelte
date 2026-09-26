import {defineApplication} from '../../src/lib/application/index.js';
import {Effect} from '../../src/lib/effect.js';
import type {Reducer} from '../../src/lib/types.js';
export type State={url:string;loaded:boolean;visits:number;started:string[];locked:boolean};
export type Action={type:'navigate';url:string}|{type:'start';url:string}|{type:'lock'};
export type Dependencies={events:string[];service:{start():()=>void};failure?:'decision'|'action'|undefined};
export const initial=(url='/server',loaded=false):State=>({url,loaded,visits:0,started:[],locked:false});
export const reducer:Reducer<State,Action,Dependencies>=(state,action,deps)=>{
 if(action.type==='lock'){deps.events.push('lock');return[{...state,locked:true},Effect.none()];}
 deps.events.push(`${action.type}:${action.url}`); // Test observation, not application orchestration.
 if(action.type==='navigate'){
  if(action.url==='/throw')throw new Error('route rejected exceptionally');
  if(action.url==='/blocked'||state.locked)return[state,Effect.none()];
  return[{...state,url:action.url==='/redirect'?'/canonical':action.url,visits:state.visits+1},Effect.none()];
 }
 if(deps.failure==='action')throw new Error('startup action failed');
 return[{...state,loaded:true,started:[...state.started,action.url]},Effect.subscription('routing-demo-service',()=>deps.service.start())];
};
export const makeDefinition=(fragment:'native'|'route'='native')=>defineApplication(reducer,{
 initialState:(url:string)=>initial(url),
 startup:(state,deps)=>{if(deps.failure==='decision')throw new Error('startup decision failed');return state.loaded?undefined:{type:'start',url:state.url};},
 routing:{fragment,serialize:state=>state.url,request:url=>url==='/invalid'?undefined:{action:{type:'navigate',url},expectedURL:url}}
});
export const definition=makeDefinition();
