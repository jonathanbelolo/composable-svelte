<script lang="ts">
 import { ApplicationRoot, ApplicationHost, type ApplicationDefinition } from '../../../src/lib/application/index.js';
 import CommandPage from './CommandPage.svelte';
 let { definition, onPage }: { definition: ApplicationDefinition<never, never, never, never>; onPage: (page: unknown) => void } = $props();
 let page: unknown = $state();
 $effect(() => { if (page) onPage(page); });
</script>
<ApplicationRoot definition={definition as never} options={{ dependencies: {}, initial: { input: undefined } } as never}>
 {#snippet children(app)}
  <ApplicationHost {app}><CommandPage bind:this={page} /></ApplicationHost>
 {/snippet}
</ApplicationRoot>
