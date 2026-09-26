<script lang="ts">
  import type { PresentationView } from '@composable-svelte/core/application';
  import type { OAuthStartAction, OAuthStartState } from '@composable-svelte/auth/flows';
  import { currentAccountPort } from './AccountScope.svelte';
  import { onDestroy } from 'svelte';

  let { view }: { view: PresentationView<OAuthStartState, OAuthStartAction> } = $props();

  const port = currentAccountPort();
  // svelte-ignore state_referenced_locally
  port?.setOAuthStartView(view);
  $effect(() => {
    port?.setOAuthStartView(view);
  });
  onDestroy(() => {
    if (port?.getOAuthStartView() === view) {
      port?.setOAuthStartView(undefined);
    }
  });
</script>
