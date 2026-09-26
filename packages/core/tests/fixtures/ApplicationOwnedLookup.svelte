<script lang="ts">
 import {ApplicationRoot,ApplicationHost,type ApplicationInstance} from '../../src/lib/application/index.js';
 import {definition,type State,type Action,type Dependencies} from './ApplicationBasicModel.js';
 import Lookup from './ApplicationLookup.svelte';
 let {dependencies,onApp,onLookup,expected=definition}:{dependencies:Dependencies;onApp:(app:ApplicationInstance<State,Action>)=>void;onLookup:(app:ApplicationInstance<State,Action>)=>void;expected?:typeof definition|undefined}=$props();
 let epoch=$state(0);let visible=$state(true);let count=$state(0);
 export function replace(){epoch++;}
 export function hide(){visible=false;}
 export function show(){visible=true;}
 export function changeInput(){count++;}
</script>
{#key epoch}
 <ApplicationRoot {definition} options={{dependencies,initial:{input:count}}}>
  {#snippet children(app)}
   {@const observed=onApp(app)}
   {#if visible}<ApplicationHost {app}><Lookup {expected} onApp={onLookup}/></ApplicationHost>{/if}
  {/snippet}
 </ApplicationRoot>
{/key}
