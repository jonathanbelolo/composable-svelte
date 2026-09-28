<script lang="ts">
 import {onMount,onDestroy,untrack,type Snippet} from 'svelte';
 import type {RendererOwner} from './renderer/owner.js';
 import {provideRegistry} from './renderer/context.js';
 import {getApplicationInternal,type ApplicationOwner} from './instance.svelte.js';
 import {BROWSER} from 'esm-env';
 import {RouteHost,provideRouteHost} from './renderer/choreography/route-host.js';
 import {onOverlayProbesChanged,trackOverlayStatuses} from './renderer/choreography/overlay-motion.js';
 import {provideStagedRoute} from './renderer/route-render.js';
 // `owner` remains an internal compatibility path; public wrapper requires app.
 let {app,owner,children}:({app:ApplicationOwner;owner?:undefined}|{owner:RendererOwner;app?:undefined})&{children:Snippet}=$props();
 const resolved=untrack(()=>{
  if(app!==undefined&&owner!==undefined)throw new TypeError('Provide app or owner, not both');
  const internal=app===undefined?undefined:getApplicationInternal(app);
  const selected=internal?.owner??owner;
  if(!selected)throw new TypeError('ApplicationHost requires an owner');
  return {internal,claim:selected.claim()};
 });
 const {claim,internal}=resolved;
 $effect.pre(()=>()=>claim.release());
 provideRegistry(claim.registry);
 if(internal?.staged)provideStagedRoute(internal.staged);
 // Browser-only route visual layer for staged routing; SSR never creates it.
 // Present for every browser Host: route choreography needs staging; within-page choreography does not.
 const routeHost=BROWSER&&typeof window!=='undefined'?new RouteHost(internal?.staged,window,undefined,claim.registry.rootIdentity,internal?.visual):undefined;
 if(routeHost){
  provideRouteHost(routeHost);
  // Scroll seam published by the scroll author on the application internal (browser, once attached).
  routeHost.setScrollSeam(()=>internal?.scroll);
 }
 $effect.pre(()=>()=>routeHost?.dispose());
 // C2 before-removal lifecycle (fluid overlays): a root-level pre-effect tracking every bound overlay's committed status.
 // Render effects run depth-first in tree order, so this runs before any descendant block of the same update removes a
 // source — including status changes that arrive through a bindable/prop write with no store commit.
 let overlayProbes=$state(0);
 if(routeHost){const stop=onOverlayProbesChanged(()=>{overlayProbes++;});onDestroy(stop);}
 $effect.pre(()=>{void overlayProbes;if(routeHost)trackOverlayStatuses();});
 onDestroy(()=>routeHost?.dispose());
 // Host boundary: one teardown (Host visuals and leases, claim release, application destruction).
 // The first failure keeps propagating exactly as before; later failures are stale diagnostics only.
 let teardownError:{readonly error:unknown}|undefined;
 function teardown(error:unknown):void{
  if(teardownError)return;
  teardownError={error};
  try{routeHost?.escalated(error);routeHost?.dispose();}
  finally{claim.release();internal?.destroy();}
 }
 // Staged Host boundary: the first observed failure tears down once and is reported; the boundary then
 // renders nothing. Later or stale failures (after teardown) are diagnostics only and cannot reach a
 // replacement attachment, which owns its own boundary and claim.
 function hostFailed(error:unknown):void{
  if(!teardownError){teardown(error);console.error('[Composable Svelte] Host render failure; application torn down:',error);return;}
  routeHost?.ledger.failed(undefined,error);
 }
 onMount(()=>{try{claim.attach();}catch(error){teardown(error);throw error;}routeHost?.attached();});
 onDestroy(()=>claim.release());
 // Staged route applications get the owned Host boundary (identical on server and client). Others keep
 // today's markup and error behavior exactly: no boundary markers, no interception of outer boundaries.
 const content=():Snippet=>internal?.staged?bounded:children;
 const guarded:Snippet=(...args:Parameters<Snippet>)=>{
  try{return Reflect.apply(content(),undefined,args);}
  catch(error){teardown(error);throw error;}
 };
</script>
{#snippet bounded()}<svelte:boundary onerror={hostFailed}>{@render children()}</svelte:boundary>{/snippet}
{@render guarded()}
