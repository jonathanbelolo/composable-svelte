<script lang="ts">
 import {ApplicationRoot,type ApplicationInstance} from '../../src/lib/application/index.js';
 import {definition,type State,type Action,type Dependencies} from './ApplicationBasicModel.js';
 import Fail from './ApplicationFail.svelte';
 let {dependencies,onApp}:{dependencies:Dependencies;onApp:(app:ApplicationInstance<State,Action>)=>void}=$props();
</script>
<ApplicationRoot {definition} options={{dependencies,initial:{input:0}}}>
 {#snippet children(app)}{@const observed=onApp(app)}<Fail/>{/snippet}
</ApplicationRoot>
