<script lang="ts">
 import {untrack} from 'svelte';
 import {ApplicationHost,ApplicationRoot,type ApplicationInstance} from '../../../src/lib/application/index.js';
 import type {ScrollState,ScrollAction,scrollDefinition} from './ScrollModel.js';
 let {url,definition,onApp=()=>{},anchor=true}:{url:string;definition:ReturnType<typeof scrollDefinition>;onApp?:(app:ApplicationInstance<ScrollState,ScrollAction>)=>void;anchor?:boolean}=$props();
 let visible=$state(true);
 export function hide(){visible=false;}
 export function show(){visible=true;}
 const initialState=untrack(()=>({url:url.split('#')[0]!,visits:0}));
</script>
<ApplicationRoot {definition} options={{dependencies:{},initial:{state:initialState,url}}}>
 {#snippet children(app)}
  {@const observed=onApp(app)}
  <!-- {@const} is lazily derived; reading it guarantees onApp runs in production builds too. -->
  <span hidden>{observed ?? ''}</span>
  {#if visible}
   <ApplicationHost {app}>
    <p data-route style="margin:0">{app.store.state.url}</p>
    <div style="height:1500px">top</div>
    {#if anchor}<h2 id="sec" style="height:50px;margin:0">Section</h2>{/if}
    <div data-composable-scroll="panel" style="height:100px;overflow:auto"><div style="height:1000px">panel</div></div>
    <div style="height:3000px">bottom</div>
   </ApplicationHost>
  {/if}
 {/snippet}
</ApplicationRoot>
