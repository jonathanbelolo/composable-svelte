import {createStore} from '../../src/lib/store.svelte.js';
import {integrate} from '../../src/lib/navigation/integrate.js';
import {Effect} from '../../src/lib/effect.js';
import {managedRootAccess} from '../../src/lib/execution/store-access.js';
import {bindManagedRootRoute} from '../../src/lib/routing/managed-binding.js';
import type {Reducer} from '../../src/lib/types.js';
import type {HistoryPort} from '../../src/lib/routing/managed-history.js';
type State={url:string;booted:string[]};
type Action={type:'go';url:string}|{type:'startup';url:string};
export function createRootRouteModel(events:string[],port:HistoryPort){
 const reducer:Reducer<State,Action>=(state,action)=>{
  events.push(`${action.type}:${action.url}`);
  return[action.type==='go'?{...state,url:action.url}:{...state,booted:[...state.booted,action.url]},Effect.none()];
 };
 const composition=integrate(reducer).managed().build();
 const store=createStore({initialState:{url:'/server',booted:[]},...composition,execution:{...composition.execution,_initialization:{mode:'attached',startupDecision:(state):Action=>({type:'startup',url:state.url})}}});
 const access=managedRootAccess(store,composition.execution);let id=0;
 return {store,attach(){const claim={live:true};const binding=bindManagedRootRoute({store,execution:composition.execution,port,initial:'request-url',serialize:state=>state.url,request:url=>({action:{type:'go',url},expectedURL:url}),id:()=>`root-route-${++id}`,report:()=>{},_attachment:{ready:()=>{if(claim.live)access.activateInitialization(claim);},failed:()=>{claim.live=false;store.destroy();}}});return()=>{claim.live=false;binding?.dispose();access.releaseInitialization(claim);};},serverProbe(){return bindManagedRootRoute({store,execution:composition.execution,port,initial:'request-url',serialize:state=>state.url,request:url=>({action:{type:'go',url},expectedURL:url}),id:()=>String(++id),report:()=>{}});}};
}
