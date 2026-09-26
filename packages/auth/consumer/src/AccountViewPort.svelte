<script lang="ts">
  import type { PresentationView } from '@composable-svelte/core/application';
  import type { AccountAction, AccountState } from '@composable-svelte/auth/flows';
  import { currentAccountPort } from './AccountScope.svelte';
  import { onDestroy } from 'svelte';

  let { view }: { view: PresentationView<AccountState, AccountAction> } = $props();

  const port = currentAccountPort();
  // svelte-ignore state_referenced_locally
  port?.setAccountView(view);
  $effect(() => {
    port?.setAccountView(view);
  });
  onDestroy(() => {
    if (port?.getAccountView() === view) {
      port?.setAccountView(undefined);
    }
  });
</script>
