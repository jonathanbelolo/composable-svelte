<script lang="ts">
  import {
    ApplicationHost,
    ApplicationRoot,
    type ApplicationInstance
  } from '@composable-svelte/core/application';
  import AppContent from '../src/app/AppContent.svelte';
  import { galleryApplication } from '../src/app/app.reducer.js';
  import type { AppAction, AppState } from '../src/app/app.types.js';
  import { SAMPLE_PRODUCTS } from '../src/models/sample-data.js';

  let {
    expose
  }: {
    expose: (app: ApplicationInstance<AppState, AppAction>) => void;
  } = $props();

</script>

<ApplicationRoot
  definition={galleryApplication}
  options={{
    dependencies: {},
    initial: { input: { products: SAMPLE_PRODUCTS, url: '/' }, url: '/' }
  }}
>
  {#snippet children(app)}
    {@const observed = expose(app)}
    <ApplicationHost {app}>
      <AppContent {app} />
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>
