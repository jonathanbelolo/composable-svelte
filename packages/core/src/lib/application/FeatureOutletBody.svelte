<script lang="ts" generics="S, A, C extends SlotCatalog">
 import {onDestroy} from 'svelte';
 import {BROWSER} from 'esm-env';
 import RenderedFeature from './RenderedFeature.svelte';
 import {CaptureChannel} from './renderer/capture-channel.js';
 import {optionalRegistry} from './renderer/context.js';
 import {usePlacement} from './renderer/placement-context.js';
 import type {SlotCatalog} from '../navigation/managed-integration.js';
 import {resolveView,type FeatureView} from './view-binding.js';
 let {view}:{view:FeatureView<S,A,C>}=$props();
 const release=usePlacement().claim(view);
 $effect.pre(()=>release.acknowledge());
 $effect.pre(()=>()=>release());
 const registry=optionalRegistry();
 const channel=BROWSER&&registry?new CaptureChannel(registry):undefined;
 $effect.pre(()=>()=>channel?.dispose());
 onDestroy(()=>{release();channel?.dispose();});
 const instances=$derived(resolveView(view));
 $effect.pre(()=>channel?.prepare(instances.map(instance=>instance.key)));
 $effect(()=>{instances;channel?.rendered();});
</script>
{#each instances as instance (instance.key)}
 <RenderedFeature {instance} {channel}>
  {#snippet children(surface)}
  {#if instance.render}
   {@const Component=instance.render}
   <Component store={instance.store} views={instance.views} {surface}/>
  {:else if instance.content}
   {@render instance.content({store:instance.store,views:instance.views,surface})}
  {/if}
  {/snippet}
 </RenderedFeature>
{/each}
