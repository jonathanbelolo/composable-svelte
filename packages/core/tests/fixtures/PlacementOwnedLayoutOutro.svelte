<script lang="ts">
 import {ApplicationRoot,ApplicationHost,defineApplication,type ApplicationInstance} from '../../src/lib/application/index.js';
 import {composition,initial,type Root,type Action} from './FeatureViewsModel.js';
 import type {TargetRegistry} from '../../src/lib/application/renderer/target-registry.js';
 import Probe from './PlacementRegistry.svelte';
 import Layout from './PlacementBorrowedOutro.svelte';
 let {onApp,onRegistry}:{onApp:(app:ApplicationInstance<Root,Action>)=>void;onRegistry:(registry:TargetRegistry)=>void}=$props();
 const definition=defineApplication(composition,{initialState:()=>initial(0)});
</script>
<ApplicationRoot {definition} options={{dependencies:{step:1,trace:[]},initial:{input:undefined}}}>
 {#snippet children(app)}
  {@const observed=onApp(app)}
  <ApplicationHost {app}><Probe inspect={onRegistry}/><Layout store={app.store}/></ApplicationHost>
 {/snippet}
</ApplicationRoot>
