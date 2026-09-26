<script lang="ts">
 import {onMount} from 'svelte';
 import type {createRootRouteModel} from './RootRouteModel.js';
 let {model}:{model:ReturnType<typeof createRootRouteModel>}=$props();
 // Internal routing seam fixture; actual ApplicationHost bridge is a separate qualification.
 onMount(()=>model.attach());
</script>
<p data-root-route>{model.store.state.url}</p>
<p data-root-startup>{model.store.state.booted.join(',')}</p>
