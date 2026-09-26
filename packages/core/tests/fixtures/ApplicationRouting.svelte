<script lang="ts">
 import {untrack} from 'svelte';
 import {ApplicationHost,ApplicationRoot,type ApplicationInstance} from '../../src/lib/application/index.js';
 import {definition,initial,type State,type Action,type Dependencies,type makeDefinition} from './ApplicationRoutingModel.js';
 let {initialURL,dependencies,snapshot=initial(),initiallyVisible=true,definitionOverride=definition,onApp=()=>{}}:{initialURL:string;dependencies:Dependencies;snapshot?:State|undefined;initiallyVisible?:boolean|undefined;definitionOverride?:ReturnType<typeof makeDefinition>|undefined;onApp?:((app:ApplicationInstance<State,Action>)=>void)|undefined}=$props();
 let visible=$state(untrack(()=>initiallyVisible));
 export function hide(){visible=false;}
 export function show(){visible=true;}
</script>
<ApplicationRoot definition={definitionOverride} options={{dependencies,initial:{state:snapshot,url:initialURL}}}>
 {#snippet children(app)}
  {@const observed=onApp(app)}
<svelte:boundary>
 {#if visible}
  <ApplicationHost {app}>
   <p data-route>{app.store.state.url}</p>
   <p data-started>{app.store.state.started.join(',')}</p>
   <p data-visits>{app.store.state.visits}</p>
   <button onclick={()=>app.store.dispatch({type:'navigate',url:'/next'})}>Next</button>
  </ApplicationHost>
 {/if}
 {#snippet failed(error)}<p data-attachment-error>{error instanceof Error?error.message:String(error)}</p>{/snippet}
</svelte:boundary>
 {/snippet}
</ApplicationRoot>
