<script lang="ts">
 import ApplicationHost from '../../src/lib/application/ApplicationHost.svelte';
 import type {createDecisionModel} from './StartupDecisionModel.js';
 let {model}:{model:ReturnType<typeof createDecisionModel>}=$props();
</script>
<ApplicationHost owner={model.owner}>
 <p data-decision-route>{model.store.state.route}</p>
 <p data-decision-boot>{model.store.state.booted.join(',')}</p>
</ApplicationHost>
