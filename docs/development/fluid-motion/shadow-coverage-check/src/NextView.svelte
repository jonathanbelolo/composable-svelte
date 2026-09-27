<script lang="ts">
  import type { PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import type { NextState, NoAction } from './model.js';
  let { store }: PresentationFeatureViewProps<NextState, NoAction, {}> = $props();
  void store;
</script>

<!-- margin 0: a collapsed default h1 margin made the page scrollable, and route focus scrolled it (see report). -->
<main style="font: 14px sans-serif"><h1 data-route-focus style="margin: 0">Next</h1></main>
