<script lang="ts">
 import { ApplicationRoot, ApplicationHost, type ApplicationDefinition } from '../../../src/lib/application/index.js';
 import OverlayPage from './OverlayPage.svelte';
 let { definition }: { definition: ApplicationDefinition<never, never, never, never> } = $props();
</script>
<ApplicationRoot definition={definition as never} options={{ dependencies: {}, initial: { input: undefined } } as never}>
 {#snippet children(app)}
  <ApplicationHost {app}><OverlayPage store={(app as never as { store: never }).store}/></ApplicationHost>
 {/snippet}
</ApplicationRoot>
