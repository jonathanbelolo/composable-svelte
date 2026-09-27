<script lang="ts">
  import { ApplicationRoot, type ApplicationInstance } from '@composable-svelte/core/application';
  import { applicationDefinition, type AppState, type AppAction, type AppDependencies } from './model.js';
  import Gallery from './Gallery.svelte';
  import Observe from './Observe.svelte';

  let {
    url = '/',
    dependencies = {},
    onApp
  }: {
    url?: string;
    dependencies?: AppDependencies;
    /** Test observation seam: receives the application instance once. Not used by the product. */
    onApp?: (app: ApplicationInstance<AppState, AppAction>) => void;
  } = $props();
</script>

<ApplicationRoot definition={applicationDefinition} options={{ dependencies, initial: { input: url, url } }}>
  {#snippet children(app)}
    {#if onApp}<Observe {app} {onApp} />{/if}
    <Gallery {app} />
  {/snippet}
</ApplicationRoot>
