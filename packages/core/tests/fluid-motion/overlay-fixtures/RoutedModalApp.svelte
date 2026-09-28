<script lang="ts">
 import { ApplicationRoot, ApplicationHost, type ApplicationDefinition } from '../../../src/lib/application/index.js';
 import RoutedModalPage from './RoutedModalPage.svelte';
 let { definition, url }: { definition: ApplicationDefinition<never, never, never, never>; url: string } = $props();
</script>
<ApplicationRoot definition={definition as never} options={{ dependencies: {}, initial: { state: { url, presentation: { status: 'idle' } }, url } } as never}>
 {#snippet children(app)}
  <ApplicationHost {app}><RoutedModalPage store={(app as never as { store: never }).store}/></ApplicationHost>
 {/snippet}
</ApplicationRoot>
