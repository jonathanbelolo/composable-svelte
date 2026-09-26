<script lang="ts">
 import {ApplicationRoot,ApplicationHost,type ApplicationInstance,type ChildView} from '../../src/lib/application/index.js';
 import {definition,type Root,type Action,type Leaf,type LeafAction,type Dependencies} from './ApplicationNestedModel.js';
 import Child from './ApplicationNestedChild.svelte';
 let {count=0,dependencies,onApp,onView,onInitialView,incrementOnSetup=false}:{count?:number|undefined;dependencies:Dependencies;onApp?:((app:ApplicationInstance<Root,Action>)=>void)|undefined;onInitialView?:((view:ChildView<Leaf,LeafAction>|undefined)=>void)|undefined;onView?:((view:ChildView<Leaf,LeafAction>|undefined)=>void)|undefined;incrementOnSetup?:boolean|undefined}=$props();
 let visible=$state(true);export function hide(){visible=false;}export function show(){visible=true;}
</script>
<ApplicationRoot definition={definition} options={{dependencies,initial:{input:count}}}>
 {#snippet children(app)}
  {@const observed=onApp?.(app)}
{#if visible}<ApplicationHost {app}><Child store={app.store} {onView} {onInitialView} {incrementOnSetup}/></ApplicationHost>{/if}
 {/snippet}
</ApplicationRoot>
