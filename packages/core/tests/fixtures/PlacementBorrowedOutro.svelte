<script lang="ts">
 import {fade} from 'svelte/transition';
 import {FeatureViews,FeatureOutlet,defineViews} from '../../src/lib/application/index.js';
 import type {ManagedProjection} from '../../src/lib/execution/store-access.js';
 import {composition,type Root,type Action} from './FeatureViewsModel.js';
 import Row from './PlacementStructureRow.svelte';
 let {store}:{store:ManagedProjection<Root,Action>}=$props();
 const views=defineViews(composition,{workspace:{headless:true},worker:{headless:true},rows:{render:Row}});
 let alternate=$state(false),duplicate=$state(false);
</script>
<button data-move onclick={()=>alternate=!alternate}>Move</button>
<button data-duplicate onclick={()=>duplicate=true}>Duplicate</button>
{#if alternate}
 <ul data-location="second" transition:fade={{duration:60000}}>
  <FeatureViews {store} definition={views}>{#snippet children(handles)}<FeatureOutlet view={handles.rows}/>{/snippet}</FeatureViews>
 </ul>
{:else}
 <ul data-location="first" transition:fade={{duration:60000}}>
  <FeatureViews {store} definition={views}>{#snippet children(handles)}<FeatureOutlet view={handles.rows}/>{/snippet}</FeatureViews>
 </ul>
{/if}
{#if duplicate}
 <ul data-location="duplicate">
  <FeatureViews {store} definition={views}>{#snippet children(handles)}<FeatureOutlet view={handles.rows}/>{/snippet}</FeatureViews>
 </ul>
{/if}
