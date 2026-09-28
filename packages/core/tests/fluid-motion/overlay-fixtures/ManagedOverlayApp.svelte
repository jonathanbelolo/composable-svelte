<script lang="ts">
 import { ApplicationRoot, ApplicationHost, type ApplicationDefinition } from '../../../src/lib/application/index.js';
 import ManagedOverlayPage from './ManagedOverlayPage.svelte';
 let { definition }: { definition: ApplicationDefinition<never, never, never, never> } = $props();
</script>
<ApplicationRoot definition={definition as never} options={{ dependencies: {}, initial: { input: undefined } } as never}>
 {#snippet children(app)}
  <ApplicationHost {app}><ManagedOverlayPage/></ApplicationHost>
 {/snippet}
</ApplicationRoot>
