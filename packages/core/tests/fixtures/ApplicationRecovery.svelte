<script lang="ts">
 import {untrack} from 'svelte';
 import {ApplicationHost,ApplicationRoot,type ApplicationInstance} from '../../src/lib/application/index.js';
 import {definition,type State,type Action,type Dependencies} from './ApplicationBasicModel.js';
 import Fail from './ApplicationFail.svelte';
 let {dependencies,onApp}:{dependencies:Dependencies;onApp:(app:ApplicationInstance<State,Action>)=>void}=$props();
</script>
<ApplicationRoot definition={definition} options={{dependencies,initial:{input:0}}}>
 {#snippet children(app)}
  {@const observed=onApp(app)}
<svelte:boundary>
 <ApplicationHost {app}>
  {#if app.store.state.count>0}<Fail/>{/if}
  <span>content</span>
 </ApplicationHost>
 {#snippet failed(_error,reset)}<button onclick={reset}>Recover</button>{/snippet}
</svelte:boundary>
 {/snippet}
</ApplicationRoot>
