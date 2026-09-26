<script lang="ts">
  import type { PresentationView } from '@composable-svelte/core/application';
  import { MfaManagementPanel } from '@composable-svelte/auth/components';
  import type { MfaManagementAction, MfaManagementState } from '@composable-svelte/auth/flows';
  import { currentAccount } from './AccountScope.svelte';

  let { view }: { view: PresentationView<MfaManagementState, MfaManagementAction> } = $props();
  const account = currentAccount();

  // The parent routed `reauthenticationRequired` to this prompt. A real app
  // collects a password here; the retry is the same operation, on the same view.
  function retry() {
    const operation = account().retry;
    if (operation === 'disable') view.dispatch({ type: 'disableRequested' });
    else if (operation === 'regenerate') view.dispatch({ type: 'regenerateRequested' });
  }
</script>

<MfaManagementPanel mode="managed" store={view} mfaEnabled={account().enabled} />
{#if account().retry !== null}
  <button type="button" onclick={retry}>Confirm it's you and retry</button>
{/if}
