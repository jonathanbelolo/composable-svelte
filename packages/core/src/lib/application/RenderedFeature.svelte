<script lang="ts">
 import {onDestroy,type Snippet} from 'svelte';
 import type {Action} from 'svelte/action';
 import type {ViewInstance} from './view-binding.js';
 import type {CaptureChannel} from './renderer/capture-channel.js';
 import ViewScope from './ViewScope.svelte';
 import {optionalRegistry,provideTargetOwner} from './renderer/context.js';

 let {instance,channel,children}:{instance:ViewInstance;channel:CaptureChannel|undefined;children:Snippet<[Action<HTMLElement>]>}=$props();

 const registry=optionalRegistry();if(registry)provideTargetOwner(registry.ownerFor(instance.store));

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
