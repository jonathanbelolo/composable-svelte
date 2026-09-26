<script lang="ts">
 import {onDestroy} from 'svelte';
 import {createStore} from '../../src/lib/store.svelte.js';
 import ApplicationHost from '../../src/lib/application/ApplicationHost.svelte';
 import {rendererOwner} from '../../src/lib/application/renderer/owner.js';
 import Host0bChild from './Host0bChild.svelte';
 import {definition,slot} from './Host0bModel.js';
 let {onEvent=()=>{}}:{onEvent?:(value:string)=>void}=$props();
 const store=createStore({initialState:{child:{opacity:'0.3'}},...definition});
 const owner=rendererOwner(store,definition.execution);
 const view=$derived.by(()=>{store.state;return definition.bind(store,slot);});
 onDestroy(()=>store.destroy());
 export function remove(){store.dispatch({type:'remove'});}
 export function replace(){store.dispatch({type:'replace'});}
 export function resourceCount(){return store._runtime!.resourceScope.size;}
</script>
<ApplicationHost {owner}>
 {#if view}{#key view}<Host0bChild {view} {onEvent}/>{/key}{/if}
</ApplicationHost>
