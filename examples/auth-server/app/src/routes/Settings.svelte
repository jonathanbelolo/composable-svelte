<script lang="ts">
	/**
	 * The signed-in half, against a real backend.
	 *
	 * This is where the branches with no counterparty finally get one: the
	 * server demands re-authentication on a session that never proved a
	 * credential, and refuses to unlink a provider that is the last way in.
	 * Neither is decided here — the panels ask, and show what comes back.
	 */
	import {
		ChangePasswordForm,
		ConnectedAccountsPanel,
		MfaEnrolment,
		MfaManagementPanel,
		SignOutButton,
		createAccountStore,
		createChangePasswordStore,
		createConnectedAccountsStore,
		createMfaEnrolmentStore,
		createMfaManagementStore,
		createOAuthStartStore
	} from '@composable-svelte/auth';

	import { PROVIDERS, deps, go, pendingOAuth, redirect, session } from '../deps.js';

	const account = createAccountStore(deps);
	const password = createChangePasswordStore(deps);
	const mfa = createMfaManagementStore(deps);
	const enrolment = createMfaEnrolmentStore(deps);
	const connected = createConnectedAccountsStore(deps);
	const oauth = createOAuthStartStore({ beginOAuth: deps.beginOAuth, pendingOAuth, redirect });

	// The mount-driven read, dispatched once. The reducer refuses a second.
	$effect(() => {
		if (account.state.status === 'idle') account.dispatch({ type: 'accountRequested' });
	});

	const snapshot = $derived(account.state.account);
	const reload = () => account.dispatch({ type: 'reloadRequested' });

	/**
	 * What the backend said it would accept as proof, if it asked for any.
	 *
	 * Shown rather than acted on: a real app routes to a prompt here. What
	 * matters for the demonstration is that the list comes from the server and
	 * differs by account — this client never guesses it.
	 */
	let demand = $state<readonly string[] | null>(null);

	let enrolling = $state(false);
</script>

<h1>Settings</h1>

{#if snapshot === null}
	<p>Reading your account…</p>
{:else}
	<pre data-testid="account">{JSON.stringify(snapshot, null, 2)}</pre>

	{#if demand !== null}
		<p data-testid="demand">
			The server wants proof it is still you. It will accept: {demand.join(', ')}. Sign in again to
			clear it.
		</p>
	{/if}

	<section>
		<ChangePasswordForm
			flowStore={password}
			sessionStore={session}
			hasPassword={snapshot.hasPassword}
			onChanged={() => {
				demand = null;
				reload();
			}}
			onReauthenticationRequired={({ methods }) => (demand = methods)}
		/>
	</section>

	<section>
		{#if enrolling}
			<MfaEnrolment
				flowStore={enrolment}
				onDone={() => {
					enrolling = false;
					reload();
				}}
			/>
		{:else}
			<MfaManagementPanel
				store={mfa}
				mfaEnabled={snapshot.mfaEnabled}
				onChanged={reload}
				onReauthenticationRequired={({ methods }) => (demand = methods)}
			>
				{#snippet enrol()}
					<button type="button" onclick={() => (enrolling = true)}>Turn it on</button>
				{/snippet}
			</MfaManagementPanel>
		{/if}
	</section>

	<section>
		<!--
			The advisory here is words, not a disabled button. The client cannot know
			whether this backend offers magic links, so it offers the button and
			shows whatever the server says — which for one seeded account is a
			refusal, and for another is a success.
		-->
		<ConnectedAccountsPanel
			store={connected}
			oauthStore={oauth}
			providers={snapshot.providers}
			hasPassword={snapshot.hasPassword}
			available={PROVIDERS}
			returnTo="/settings"
			onUnlinked={reload}
			onReauthenticationRequired={({ methods }) => (demand = methods)}
		/>
	</section>
{/if}

<section>
	<SignOutButton store={session} onSignedOut={() => go('/')} />
</section>

<style>
	section {
		margin: 2rem 0;
		padding-top: 1.5rem;
		border-top: 1px solid #e2e8f0;
	}

	pre {
		padding: 0.75rem;
		overflow-x: auto;
		font-size: 0.75rem;
		background: #f1f5f9;
		border-radius: 0.375rem;
	}
</style>
