<script lang="ts" generics="S, A, C extends SlotCatalog">
 import {onDestroy,type Snippet} from 'svelte';
 import {BROWSER} from 'esm-env';
 import RenderedFeature from './RenderedFeature.svelte';
 import FeatureOutletRoute from './FeatureOutletRoute.svelte';
 import {CaptureChannel} from './renderer/capture-channel.js';
 import {optionalRegistry} from './renderer/context.js';
 import {optionalRouteHost} from './renderer/choreography/route-host.js';
 import {optionalStagedRoute,type RouteFallbackProps} from './renderer/route-render.js';
 import {usePlacement} from './renderer/placement-context.js';
 import type {SlotCatalog} from '../navigation/managed-integration.js';
 import {resolveView,isRootSlotView,type FeatureView} from './view-binding.js';
 let {view,fallback}:{view:FeatureView<S,A,C>;fallback?:Snippet<[RouteFallbackProps]>|undefined}=$props();
 const release=usePlacement().claim(view);
 $effect.pre(()=>release.acknowledge());
 $effect.pre(()=>()=>release());
 const registry=optionalRegistry();
 const channel=BROWSER&&registry?new CaptureChannel(registry):undefined;
 $effect.pre(()=>()=>channel?.dispose());
 onDestroy(()=>{release();channel?.dispose();});
 const instances=$derived(resolveView(view));
 // Managed route outlet: identified by its declared root route slot, so it is attached even while
 // the slot is empty. Browser-only; ordinary outlets keep their existing behavior.
 // Structure depends only on the staged declaration (server and client); visuals are browser-only.
 const staged=optionalStagedRoute();
 const routeOutlet=!!staged&&isRootSlotView(view,staged.routeSlot);
 const routeHost=BROWSER&&routeOutlet?optionalRouteHost():undefined;
 let routeKeys:readonly object[]=[];
 $effect.pre(()=>{if(!routeOutlet||!routeHost)return;const detach=routeHost.attachOutlet();return detach;});
 $effect.pre(()=>{
  const next=instances.map(instance=>instance.key);
  if(routeOutlet&&routeHost){
   // beforeRemoval: the existing pre-render capture position, before Svelte removes outgoing instances.
   for(const key of routeKeys)if(!next.includes(key))routeHost.beforeRemoval(key);
   routeKeys=next;
  }
  channel?.prepare(next,routeHost?(owner=>routeHost.claims(owner)):undefined);
 });
 $effect(()=>{instances;channel?.rendered();});
 // Chosen in script so ordinary outlets keep identical server markup (no extra block markers).
 const Item=(routeOutlet?FeatureOutletRoute:RenderedFeature) as typeof FeatureOutletRoute;
</script>
{#each instances as instance (instance.key)}
 <Item {instance} {channel} host={routeHost} {fallback}>
  {#snippet children(surface)}
  {#if instance.render}
   {@const Component=instance.render}
   <Component store={instance.store} views={instance.views} {surface}/>
  {:else if instance.content}
   {@render instance.content({store:instance.store,views:instance.views,surface})}
  {/if}
  {/snippet}
 </Item>
{/each}
