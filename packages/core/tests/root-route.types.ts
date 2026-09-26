import {bindManagedRootRoute} from '../src/lib/routing/managed-binding.js';
import type {Store,StoreExecutionConfig} from '../src/lib/types.js';
import type {HistoryPort} from '../src/lib/routing/managed-history.js';
type State={url:string};type Action={type:'go';url:string};
declare const store:Store<State,Action>,execution:StoreExecutionConfig<State,Action>,port:HistoryPort;
const shared={store,execution,port,initial:'request-url' as const,id:()=>'',report:()=>{}};
bindManagedRootRoute({...shared,serialize:state=>state.url,request:url=>({action:{type:'go',url},expectedURL:url})});
bindManagedRootRoute({...shared,serialize:state=>state.url,
 // @ts-expect-error Root action cannot be widened by route configuration.
 request:url=>({action:{type:'foreign',url},expectedURL:url})});
bindManagedRootRoute({...shared,
 // @ts-expect-error Root state shape remains inferred from actual store.
 serialize:state=>state.missing,request:()=>undefined});
