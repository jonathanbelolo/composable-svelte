<script lang="ts">
 import {ApplicationRoot,ApplicationHost,type ApplicationInstance} from '../../src/lib/application/index.js';
 import {definition,type State,type Action,type Dependencies} from './ApplicationBasicModel.js';
 import Lookup from './ApplicationLookup.svelte';
 let {outer,inner,onLookup}:{outer:Dependencies;inner:Dependencies;onLookup:(app:ApplicationInstance<State,Action>)=>void}=$props();
</script>
<ApplicationRoot {definition} options={{dependencies:outer,initial:{input:1}}}>
 {#snippet children(app)}<ApplicationHost {app}>
  <Lookup onApp={onLookup}/>
  <ApplicationRoot {definition} options={{dependencies:inner,initial:{input:10}}}>
   {#snippet children(nested)}<ApplicationHost app={nested}><Lookup onApp={onLookup}/></ApplicationHost>{/snippet}
  </ApplicationRoot>
  <Lookup onApp={onLookup}/>
 </ApplicationHost>{/snippet}
</ApplicationRoot>
