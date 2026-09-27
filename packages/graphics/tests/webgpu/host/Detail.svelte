<script lang="ts">
  import type { PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import type { Empty } from './model.js';
  let { store }: PresentationFeatureViewProps<Empty, { type: 'noop' }, {}> = $props();
  void store;
</script>

<main data-page="detail" style="padding-top: 260px;"><h1>Detail</h1></main>
