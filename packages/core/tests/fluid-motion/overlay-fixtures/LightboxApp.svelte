<script lang="ts">
 import { ApplicationRoot, ApplicationHost, type ApplicationDefinition } from '../../../src/lib/application/index.js';
 import LightboxPage from './LightboxPage.svelte';
 let { definition }: { definition: ApplicationDefinition<never, never, never, never> } = $props();
</script>
<ApplicationRoot definition={definition as never} options={{ dependencies: {}, initial: { input: undefined } } as never}>
 {#snippet children(app)}
  <ApplicationHost {app}><LightboxPage/></ApplicationHost>
 {/snippet}
</ApplicationRoot>
