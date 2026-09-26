<script lang="ts">
 import {onMount,onDestroy,untrack} from 'svelte';
 import type {FeatureViewProps} from '../../src/lib/application/index.js';
 import {events,captured,type Leaf,type LA} from './FeatureViewsModel.js';
 let {store,surface}:FeatureViewProps<Leaf,LA>=$props();
 const original=untrack(()=>store);const name=untrack(()=>store.state?.name??'missing');
 let draft=$state(0);captured.push(original);onMount(()=>{events.push('mount:'+name);});onDestroy(()=>{events.push('destroy:'+name);});
</script>
<section use:surface data-leaf={name}><button data-action="increment" onclick={()=>original.dispatch({type:'increment'})}>{store.state?.count}</button><button data-action="local" onclick={()=>draft++}>{draft}</button></section>
