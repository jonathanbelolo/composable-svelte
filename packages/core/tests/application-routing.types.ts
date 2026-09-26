import {defineApplication,useApplication,ApplicationRoot,type ApplicationInstance,type ApplicationRouting} from '../src/lib/application/index.js';
import type {Reducer} from '../src/lib/types.js';
import {Effect} from '../src/lib/effect.js';
type S={url:string};type A={type:'go';url:string};type D={loaded:boolean};
const reducer:Reducer<S,A,D>=(state,action)=>[{url:action.url},Effect.none()];
const routing:ApplicationRouting<S,A>={fragment:'native',serialize:state=>state.url,request:url=>({action:{type:'go',url},expectedURL:url})};
declare const children: import('svelte').Snippet<[ApplicationInstance<S,A>]>;
const routed=defineApplication(reducer,{initialState:(url:string)=>({url}),routing});
ApplicationRoot(null!,{definition:routed,options:{dependencies:{loaded:true},initial:{input:'/server',url:'https://example.test/server'}},children});
ApplicationRoot(null!,{definition:routed,options:{dependencies:{loaded:true},initial:{state:{url:'/server'},url:'/server'}},children});
// @ts-expect-error routed snapshot hydration requires injected URL
ApplicationRoot(null!,{definition:routed,options:{dependencies:{loaded:true},initial:{state:{url:'/server'}}},children});
// @ts-expect-error routed input initialization also requires URL metadata
ApplicationRoot(null!,{definition:routed,options:{dependencies:{loaded:true},initial:{input:'/server'}},children});
const basic=defineApplication(reducer,{initialState:(url:string)=>({url})});
ApplicationRoot(null!,{definition:basic,options:{dependencies:{loaded:true},initial:{input:'/server'}},children});
// @ts-expect-error a route-free definition does not claim URL initialization
ApplicationRoot(null!,{definition:basic,options:{dependencies:{loaded:true},initial:{input:'/server',url:'/server'}},children});
// @ts-expect-error root action cannot be widened by route request
const wrongAction=defineApplication(reducer,{initialState:(url:string)=>({url}),routing:{fragment:'route',serialize:state=>state.url,request:url=>({action:{type:'other',url},expectedURL:url})}});
// @ts-expect-error fragment ownership is explicit
const missingFragment=defineApplication(reducer,{initialState:(url:string)=>({url}),routing:{serialize:state=>state.url,request:()=>undefined}});
// @ts-expect-error application routing has no browser port/lifecycle extension
const customPort:ApplicationRouting<S,A>={...routing,port:{}};
// @ts-expect-error application routing has no imperative mount callback
const customMount:ApplicationRouting<S,A>={...routing,onMount:()=>{}};

useApplication(routed).store.dispatch({type:"go",url:"/valid"});
