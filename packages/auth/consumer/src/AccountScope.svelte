<script lang="ts" module>
  import { getContext, setContext, type Snippet } from 'svelte';
  import type { Account, Side, State } from './model.js';
  import type { AuthFeatureState } from '@composable-svelte/auth/application';
  import type { AccountAction, AccountState, OAuthProvider, OAuthStartAction, OAuthStartState } from '@composable-svelte/auth/flows';
  import type { PresentationView } from '@composable-svelte/core/application';

  const ACCOUNTS = Symbol('consumer-accounts');
  const SIDE = Symbol('consumer-side');
  const FEATURE = Symbol('consumer-feature');
  const ACCOUNT_PORT = Symbol('consumer-account-port');
  const PROVIDERS = Symbol('consumer-providers');
  const ON_LINK = Symbol('consumer-on-link');

  export type AccountPort = {
    getAccountView(): PresentationView<AccountState, AccountAction> | undefined;
    setAccountView(view: PresentationView<AccountState, AccountAction> | undefined): void;
    getOAuthStartView(): PresentationView<OAuthStartState, OAuthStartAction> | undefined;
    setOAuthStartView(view: PresentationView<OAuthStartState, OAuthStartAction> | undefined): void;
  };

  /** The parent's account read for the auth section this view renders in. Call during init. */
  export function currentAccount(): () => Account {
    const accounts = getContext<(() => State['accounts']) | undefined>(ACCOUNTS);
    const side = getContext<Side | undefined>(SIDE);
    const feature = getContext<(() => AuthFeatureState | null | undefined) | undefined>(FEATURE);
    return () => {
      const feat = feature?.();
      const parentAcc = side && accounts ? accounts()[side] : undefined;
      const featAcc = feat?.account?.account;
      return {
        enabled: parentAcc?.enabled ?? featAcc?.mfaEnabled,
        retry: parentAcc?.retry ?? null,
        providers: featAcc ? featAcc.providers : parentAcc?.providers,
        hasPassword: featAcc ? featAcc.hasPassword : parentAcc?.hasPassword
      };
    };
  }

  export function currentSide(): Side | undefined {
    return getContext<Side | undefined>(SIDE);
  }

  export function currentAccountPort(): AccountPort | undefined {
    return getContext<AccountPort | undefined>(ACCOUNT_PORT);
  }

  export function currentProviders(): readonly { id: string; label: string }[] {
    return getContext<readonly { id: string; label: string }[]>(PROVIDERS) ?? [
      { id: 'github', label: 'GitHub' },
      { id: 'google', label: 'Google' }
    ];
  }

  export function currentOnLink(): ((provider: OAuthProvider) => void) | undefined {
    return getContext<((provider: OAuthProvider) => void) | undefined>(ON_LINK);
  }
</script>

<script lang="ts">
  // Nested view snippets see only their own view. The parent's account reads
  // (set once at the root) and the section (set by each auth section) reach the
  // MFA panel and connected accounts panel through context instead.
  let {
    accounts,
    side,
    feature,
    providers,
    onLink,
    children
  }: {
    accounts?: () => State['accounts'];
    side?: Side;
    feature?: () => AuthFeatureState | null | undefined;
    providers?: readonly { id: string; label: string }[];
    onLink?: (provider: OAuthProvider) => void;
    children: Snippet;
  } = $props();

  let activeAccountView = $state<PresentationView<AccountState, AccountAction> | undefined>();
  let activeOAuthStartView = $state<PresentationView<OAuthStartState, OAuthStartAction> | undefined>();

  const port: AccountPort = {
    getAccountView: () => activeAccountView,
    setAccountView: (v) => { activeAccountView = v; },
    getOAuthStartView: () => activeOAuthStartView,
    setOAuthStartView: (v) => { activeOAuthStartView = v; }
  };

  // Set once: each scope is created for one parent and one section.
  // svelte-ignore state_referenced_locally
  if (accounts !== undefined) setContext(ACCOUNTS, accounts);
  // svelte-ignore state_referenced_locally
  if (side !== undefined) setContext(SIDE, side);
  // svelte-ignore state_referenced_locally
  if (feature !== undefined) setContext(FEATURE, feature);
  setContext(ACCOUNT_PORT, port);
  // svelte-ignore state_referenced_locally
  if (providers !== undefined) setContext(PROVIDERS, providers);
  // svelte-ignore state_referenced_locally
  if (onLink !== undefined) setContext(ON_LINK, onLink);
</script>

{@render children()}
