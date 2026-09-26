<script lang="ts">
  import { ApplicationHost, ApplicationRoot } from '@composable-svelte/core/application';
  import { SAMPLE_PRODUCTS } from '../models/sample-data.js';
  import { galleryApplication } from './app.reducer.js';
  import AppContent from './AppContent.svelte';

  interface AppProps {
    url?: string;
  }

  let { url }: AppProps = $props();

  const resolvedUrl =
    url ??
    (typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}${window.location.hash}`
      : '/');
</script>

<ApplicationRoot
  definition={galleryApplication}
  options={{
    dependencies: {},
    initial: {
      input: { products: SAMPLE_PRODUCTS, url: resolvedUrl },
      url: resolvedUrl
    }
  }}
>
  {#snippet children(app)}
    <ApplicationHost {app}>
      <AppContent {app} />
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>
