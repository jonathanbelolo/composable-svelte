import {defineApplication,useApplication,ApplicationRoot,type ApplicationInstance} from '../src/lib/application/index.js';
import {Effect} from '../src/lib/effect.js';
import type {Reducer} from '../src/lib/types.js';
type S={count:number};type A={type:'increment'};type D={step:number};
const reducer:Reducer<S,A,D>=(s,_a,d)=>[{count:s.count+d.step},Effect.none()];
const definition=defineApplication(reducer,{initialState:(count:number)=>({count})});
const app=useApplication(definition);
declare const children: import('svelte').Snippet<[ApplicationInstance<S,A>]>;
ApplicationRoot(null!,{definition,options:{dependencies:{step:1},initial:{input:0}},children});
app.store.dispatch({type:'increment'});
// @ts-expect-error missing injected dependency
ApplicationRoot(null!,{definition,options:{dependencies:{},initial:{input:0}},children});
// @ts-expect-error invalid initial input
ApplicationRoot(null!,{definition,options:{dependencies:{step:1},initial:{input:'0'}},children});
// @ts-expect-error input and state are mutually exclusive
ApplicationRoot(null!,{definition,options:{dependencies:{step:1},initial:{input:0,state:{count:1}}},children});
// @ts-expect-error lifecycle is not a feature capability
app.store.destroy();
// @ts-expect-error history is separate from feature projection
app.store.history;
// @ts-expect-error framework assembly must not masquerade as finished routing
app.routing;
// @ts-expect-error opaque ownership cannot be forged from a store
const forged:ApplicationInstance<S,A>={store:app.store};

// @ts-expect-error startup must return the reducer's action schema
 defineApplication(reducer,{initialState:(count:number)=>({count}),startup:()=>({type:'foreign'})});
import type {ComponentProps} from 'svelte';
import {ApplicationHost} from '../src/lib/application/index.js';
// @ts-expect-error host content is a required snippet, not an implicit sibling scope
const emptyHost:ComponentProps<typeof ApplicationHost>={app};

// @ts-expect-error ownership is declarative; lookup cannot construct an instance
useApplication(definition,{dependencies:{step:1},initial:{input:0}});
// @ts-expect-error root content is required
ApplicationRoot(null!,{definition,options:{dependencies:{step:1},initial:{input:0}}});

declare const foreignChildren: import('svelte').Snippet<[ApplicationInstance<{url:string},{type:'navigate'}>]>;
// @ts-expect-error a children snippet cannot widen the root business schema
ApplicationRoot(null!,{definition,options:{dependencies:{step:1},initial:{input:0}},children:foreignChildren});
// @ts-expect-error lookup preserves the exact action schema
useApplication(definition).store.dispatch({type:'navigate'});
