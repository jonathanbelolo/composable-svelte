<script lang="ts">
 import {untrack} from 'svelte';
 import {ApplicationHost,ApplicationRoot,type ApplicationDefinition,type ApplicationOptions,type ApplicationInstance} from '../../src/lib/application/index.js';
 import {definition,type State,type Action,type Dependencies} from './ApplicationBasicModel.js';
 import Fail from './ApplicationFail.svelte';
 import Descendant from './ApplicationDescendant.svelte';
 let {initialCount=0,dependencies,fail=false,descendant=false,definitionOverride=definition,options,onApp=()=>{}}:{initialCount?:number|undefined;dependencies:Dependencies;fail?:boolean|undefined;definitionOverride?:ApplicationDefinition<State,Action,Dependencies,number>|undefined;descendant?:boolean|undefined;options?:ApplicationOptions<State,Dependencies,number>|undefined;onApp?:((app:ApplicationInstance<State,Action>)=>void)|undefined}=$props();
 let visible=$state(true);
 export function hide(){visible=false;}
 export function show(){visible=true;}
</script>
<ApplicationRoot definition={definitionOverride} options={options??{dependencies,initial:{input:initialCount}}}>
 {#snippet children(app)}
  {@const observed=onApp(app)}
{#if visible}
 <ApplicationHost {app}>
  {#if fail}<Fail/>{/if}
  {#if descendant}<Descendant {app}/>{/if}
  <button onclick={()=>app.store.dispatch({type:'increment'})}>{app.store.state.count}</button>
 </ApplicationHost>
{/if}
 {/snippet}
</ApplicationRoot>
