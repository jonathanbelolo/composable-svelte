<script lang="ts">
 /**
  * One managed route instance. The owned boundary sits inside the outlet's placement claim and
  * outside the instance's nested FeatureViews scopes. Without a declared fallback there is no route
  * boundary: failures escalate to the Host boundary.
  */
 import {onDestroy,type Snippet} from 'svelte';
 import type {Action} from 'svelte/action';
 import RenderedFeature from './RenderedFeature.svelte';
 import type {ViewInstance} from './view-binding.js';
 import type {CaptureChannel} from './renderer/capture-channel.js';
 import type {RouteHost} from './renderer/choreography/route-host.js';
 import {summarizeRenderFailure,type RouteFallbackProps} from './renderer/route-render.js';
 let {instance,channel,host,fallback,children}:{instance:ViewInstance;channel:CaptureChannel|undefined;host:RouteHost|undefined;fallback:Snippet<[RouteFallbackProps]>|undefined;children:Snippet<[Action<HTMLElement>]>}=$props();
 // `host` is the browser route layer; on the server the same structure renders without identity work.
 const routeHost:RouteHost|undefined=host;
 let identity=routeHost?.mount(instance.key);
 const rendered=()=>{if(identity)routeHost?.rendered(identity);};
 // The owned boundary always observes a supported route failure first: record renderFailed(identity)
 // and release its choreography. Without a declared fallback, the `failed` branch rethrows the original
 // error, which Svelte forwards to the parent (Host) boundary: exactly one escalation. `onerror` itself
 // never rethrows: in Svelte 5.43.3 a rethrow from `onerror` while the boundary is still being created
 // reaches `invoke_error_boundary` with an unassigned effect and re-enters this boundary with a TypeError.
 function onerror(error:unknown){if(identity)routeHost?.failed(identity,error);}
 function escalate(error:unknown):never{throw error;}
 function fallbackProps(error:unknown,reset:()=>void):RouteFallbackProps{
  const failedIdentity=identity;
  let used=false;
  return Object.freeze({
   summary:summarizeRenderFailure(error),
   attempt:failedIdentity?.attempt??1,
   // Render-only and user-initiated: no domain action, no reducer effect, no managed initialization.
   retry:()=>{if(used||!failedIdentity||!routeHost)return;const next=routeHost.retry(failedIdentity);if(!next)return;used=true;identity=next;reset();}
  });
 }
 onDestroy(()=>routeHost?.retire(instance.key));
 // Route instance root for semantic focus resolution (display: contents keeps layout unchanged).
 const routeRoot=(node:HTMLElement)=>{const release=routeHost?.registerRouteRoot(instance.key,node);return{destroy(){release?.();}};};
</script>
<svelte:boundary {onerror}>
 <div data-composable-route-instance style="display:contents" use:routeRoot><RenderedFeature {instance} {channel} onrendered={rendered} {children}/></div>
 {#snippet failed(error,reset)}{#if fallback}{@render fallback(fallbackProps(error,reset))}{:else}{escalate(error)}{/if}{/snippet}
</svelte:boundary>
