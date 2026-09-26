<script lang="ts">
  import type { PresentationView } from '@composable-svelte/core/application';
  import { ConnectedAccountsPanel } from '@composable-svelte/auth/components';
  import type { ConnectedAccountsAction, ConnectedAccountsState } from '@composable-svelte/auth/flows';
  import type { OAuthProvider } from '@composable-svelte/auth/flows';
  import {
    currentAccount,
    currentAccountPort,
    currentOnLink,
    currentProviders
  } from './AccountScope.svelte';

  let { view }: { view: PresentationView<ConnectedAccountsState, ConnectedAccountsAction> } = $props();

  const port = currentAccountPort();
  const accountStore = $derived(port?.getAccountView());
  const oauthStore = $derived(port?.getOAuthStartView());
  const account = currentAccount();
  const providers = currentProviders();
  const onLink = currentOnLink();
</script>

<ConnectedAccountsPanel
  mode="managed"
  store={view}
  {accountStore}
  {oauthStore}
  providers={accountStore ? undefined : account().providers}
  hasPassword={accountStore ? undefined : account().hasPassword}
  available={providers.map((p) => ({ id: p.id as OAuthProvider, label: p.label }))}
  {onLink}
/>
