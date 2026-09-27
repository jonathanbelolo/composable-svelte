<script lang="ts">
  import { ApplicationRoot, type ApplicationInstance } from '@composable-svelte/core/application';
  import { definition, type HostState, type HostAction, type HostDeps } from './model.js';
  import HostShell from './HostShell.svelte';
  let { url, dependencies, onApp }: { url: string; dependencies: HostDeps; onApp: (app: ApplicationInstance<HostState, HostAction>) => void } = $props();
</script>

<ApplicationRoot {definition} options={{ dependencies, initial: { input: url, url } }}>
  {#snippet children(app)}
    <HostShell {app} {onApp} />
  {/snippet}
</ApplicationRoot>
