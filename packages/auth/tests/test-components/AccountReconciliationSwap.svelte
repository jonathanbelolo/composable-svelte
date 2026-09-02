<script lang="ts">
	/**
	 * A settings surface whose account read changes underneath the panels.
	 *
	 * That is the ordinary case — every successful operation triggers a re-read —
	 * and it is the one nothing exercised. Both panels hold local knowledge that
	 * has to yield when the account catches up, and both got it wrong in the
	 * opposite directions: connected accounts never let go, MFA management had no
	 * way back from `disabled`.
	 */
	import ConnectedAccountsPanel from '../../src/lib/components/ConnectedAccountsPanel.svelte';
	import MfaManagementPanel from '../../src/lib/components/MfaManagementPanel.svelte';
	import type {
		ConnectedAccountsAction,
		ConnectedAccountsState
	} from '../../src/lib/flows/connected-accounts/types.js';
	import type {
		MfaManagementAction,
		MfaManagementState
	} from '../../src/lib/flows/mfa-management/types.js';
	import type { OAuthStartAction, OAuthStartState } from '../../src/lib/flows/oauth-start/types.js';
	import type { OAuthProvider } from '../../src/lib/flows/oauth-pending.js';

	let {
		which,
		connectedStore,
		mfaStore,
		oauthStore,
		available,
		initialProviders,
		initialMfaEnabled
	}: {
		which: 'connected' | 'mfa';
		connectedStore: {
			readonly state: ConnectedAccountsState;
			dispatch(action: ConnectedAccountsAction): void;
		};
		mfaStore: { readonly state: MfaManagementState; dispatch(action: MfaManagementAction): void };
		oauthStore: { readonly state: OAuthStartState; dispatch(action: OAuthStartAction): void };
		available: readonly { id: OAuthProvider; label: string }[];
		initialProviders: readonly string[];
		initialMfaEnabled: boolean;
	} = $props();

	let providers = $state<readonly string[]>(initialProviders);
	let mfaEnabled = $state(initialMfaEnabled);

	/** Stand in for the surface re-reading the account after an operation. */
	export function reread(next: { providers?: readonly string[]; mfaEnabled?: boolean }) {
		if (next.providers !== undefined) providers = next.providers;
		if (next.mfaEnabled !== undefined) mfaEnabled = next.mfaEnabled;
	}
</script>

{#if which === 'connected'}
	<ConnectedAccountsPanel
		store={connectedStore}
		{oauthStore}
		{providers}
		{available}
		hasPassword={true}
	/>
{:else}
	<MfaManagementPanel store={mfaStore} {mfaEnabled} />
{/if}
