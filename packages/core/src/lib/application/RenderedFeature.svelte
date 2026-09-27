<script lang="ts">
 import {onDestroy,onMount,type Snippet} from 'svelte';
 import type {Action} from 'svelte/action';
 import type {ViewInstance} from './view-binding.js';
 import type {CaptureChannel} from './renderer/capture-channel.js';
 import ViewScope from './ViewScope.svelte';
 import {optionalRegistry,provideTargetOwner,provideFeatureSource} from './renderer/context.js';
 import {optionalRouteHost,provideRouteInstance} from './renderer/choreography/route-host.js';

 let {instance,channel,children,onrendered}:{instance:ViewInstance;channel:CaptureChannel|undefined;children:Snippet<[Action<HTMLElement>]>;onrendered?:(()=>void)|undefined}=$props();
 // Managed route `rendered` checkpoint: runs once this mount's DOM exists.
 onMount(()=>{onrendered?.();});

 const registry=optionalRegistry();if(registry)provideTargetOwner(registry.ownerFor(instance.store));
 provideFeatureSource(instance.store);
 // Route participants are scoped by their route instance; nested feature instances inherit it.
 const routeHost=optionalRouteHost();if(routeHost?.isRouteInstance(instance.store))provideRouteInstance(instance.key);

 let disposed=false;
 const surfaces=new Set<HTMLElement>();
 let release=channel?.register(instance.key,()=>{
  let connected:HTMLElement|undefined;
  for(const node of surfaces){
   if(node.isConnected){
    if(connected)return undefined;
    connected=node;
   }
  }
  return connected;
 });

 const surface:Action<HTMLElement>=(node:HTMLElement)=>{
  if(disposed)return;
  surfaces.add(node);
  let removed=false;
  return{
   destroy(){
    if(removed)return;
    removed=true;
    surfaces.delete(node);
   }
  };
 };

 function cleanup(){
  disposed=true;
  release?.();
  release=undefined;
  surfaces.clear();
 }

 $effect.pre(()=>()=>cleanup());
 onDestroy(cleanup);
</script>
<ViewScope views={instance.views}>{@render children(surface)}</ViewScope>
