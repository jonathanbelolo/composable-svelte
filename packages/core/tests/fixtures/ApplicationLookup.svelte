<script lang="ts">
 import {untrack} from 'svelte';
 import {useApplication,type ApplicationInstance} from '../../src/lib/application/index.js';
 import {definition,type State,type Action} from './ApplicationBasicModel.js';
 let {expected=definition,onApp}:{expected?:typeof definition|undefined;onApp:(app:ApplicationInstance<State,Action>)=>void}=$props();
 const app=untrack(()=>useApplication(expected));
 untrack(()=>onApp(app));
</script>
<button onclick={()=>app.store.dispatch({type:'increment'})}>{app.store.state.count}</button>
