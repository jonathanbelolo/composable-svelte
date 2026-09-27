<script lang="ts">
 import { ApplicationRoot, ApplicationHost, type ApplicationInstance } from '../../../src/lib/application/index.js';
 import { localDefinition, type LocalState, type LocalAction } from './LocalModel.js';
 import LocalPanel from './LocalPanel.svelte';
 let { onApp }: { onApp: (app: ApplicationInstance<LocalState, LocalAction>) => void } = $props();
</script>
<ApplicationRoot definition={localDefinition} options={{ dependencies: {}, initial: { input: undefined } }}>
 {#snippet children(app)}
  {@const observed = onApp(app)}
  <ApplicationHost {app}><LocalPanel store={app.store}/></ApplicationHost>
 {/snippet}
</ApplicationRoot>
