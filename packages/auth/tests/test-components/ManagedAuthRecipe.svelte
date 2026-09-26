<script lang="ts">
	/**
	 * The managed recipe, as a consumer writes it: `defineViews` content
	 * snippets handing each genuine presentation view to the existing form in
	 * `mode="managed"`, mounted through core's `FeatureViews` and `FeatureOutlet`.
	 */
	import type { Store } from '@composable-svelte/core';
	import {
		FeatureOutlet,
		FeatureViews,
		defineViews,
		type PresentationFeatureViewProps
	} from '@composable-svelte/core/application';

	import LoginForm from '../../src/lib/components/LoginForm.svelte';
	import MfaChallengeForm from '../../src/lib/components/MfaChallengeForm.svelte';
	import SignupForm from '../../src/lib/components/SignupForm.svelte';
	import ForgotPasswordForm from '../../src/lib/components/ForgotPasswordForm.svelte';
	import ResetPasswordForm from '../../src/lib/components/ResetPasswordForm.svelte';
	import EmailVerification from '../../src/lib/components/EmailVerification.svelte';
	import MfaEnrolment from '../../src/lib/components/MfaEnrolment.svelte';
	import MfaManagementPanel from '../../src/lib/components/MfaManagementPanel.svelte';
	import OAuthSignIn from '../../src/lib/components/OAuthSignIn.svelte';
	import OAuthCallback from '../../src/lib/components/OAuthCallback.svelte';
	import MagicLinkRequestForm from '../../src/lib/components/MagicLinkRequestForm.svelte';
	import MagicLinkSignIn from '../../src/lib/components/MagicLinkSignIn.svelte';
	import ConnectedAccountsPanel from '../../src/lib/components/ConnectedAccountsPanel.svelte';
	import ChangeEmailForm from '../../src/lib/components/ChangeEmailForm.svelte';
	import EmailChangeConfirmation from '../../src/lib/components/EmailChangeConfirmation.svelte';
	import ChangePasswordForm from '../../src/lib/components/ChangePasswordForm.svelte';
	import DeleteAccountPanel from '../../src/lib/components/DeleteAccountPanel.svelte';
	import SessionRefresh from '../../src/lib/components/SessionRefresh.svelte';
	import type {
		AuthFeature,
		AuthFeatureAction,
		AuthFeatureState
	} from '../../src/lib/application/index.js';
	import type {
		LoginAction,
		LoginState,
		MfaChallengeAction,
		MfaChallengeState,
		SignupAction,
		SignupState,
		ForgotPasswordAction,
		ForgotPasswordState,
		ResetPasswordAction,
		ResetPasswordState,
		EmailVerificationAction,
		EmailVerificationState,
		MfaEnrolmentAction,
		MfaEnrolmentState,
		MfaManagementAction,
		MfaManagementState,
		OAuthStartAction,
		OAuthStartState,
		OAuthCallbackAction,
		OAuthCallbackState,
		OAuthCallbackParams,
		MagicLinkRequestAction,
		MagicLinkRequestState,
		MagicLinkSignInAction,
		MagicLinkSignInState,
		AccountAction,
		AccountState,
		ConnectedAccountsAction,
		ConnectedAccountsState,
		ChangeEmailAction,
		ChangeEmailState,
		ChangeEmailConfirmAction,
		ChangeEmailConfirmState,
		ChangePasswordAction,
		ChangePasswordState,
		DeleteAccountAction,
		DeleteAccountState,
		SessionRefreshAction,
		SessionRefreshState
	} from '../../src/lib/flows/index.js';
	import type { OAuthProvider } from '../../src/lib/flows/oauth-pending.js';

	let {
		auth,
		store,
		mfaEnabled: initialMfaEnabled,
		callbackParams = null,
		magicLinkToken: initialMagicLinkToken = undefined,
		changeEmailConfirmToken: initialChangeEmailConfirmToken = undefined,
		pendingEmail: initialPendingEmail = undefined,
		hasPassword: initialHasPassword = undefined,
		deleteAccountEmail: initialDeleteAccountEmail = undefined,
		providers = [
			{ id: 'github', label: 'GitHub' },
			{ id: 'google', label: 'Google' }
		],
		onLink
	}: {
		auth: AuthFeature;
		store: Store<AuthFeatureState, AuthFeatureAction>;
		mfaEnabled?: boolean | undefined;
		callbackParams?: OAuthCallbackParams | null | undefined;
		magicLinkToken?: string | null | undefined;
		changeEmailConfirmToken?: string | null | undefined;
		pendingEmail?: string | null | undefined;
		hasPassword?: boolean | undefined;
		deleteAccountEmail?: string | undefined;
		providers?: readonly { id: string; label: string }[] | undefined;
		onLink?: ((provider: OAuthProvider) => void) | undefined;
	} = $props();

	/** The account read a parent would pass; changed from a test as a re-read would. */
	let mfaEnabled = $state(initialMfaEnabled);
	export function observeAccount(enabled: boolean | undefined) {
		mfaEnabled = enabled;
	}

	let magicLinkToken = $state(initialMagicLinkToken);
	export function setMagicLinkToken(token: string | null | undefined) {
		magicLinkToken = token;
	}

	let changeEmailConfirmToken = $state(initialChangeEmailConfirmToken);
	export function setChangeEmailConfirmToken(token: string | null | undefined) {
		changeEmailConfirmToken = token;
	}

	let pendingEmail = $state(initialPendingEmail);
	export function observePendingEmail(email: string | null | undefined) {
		pendingEmail = email;
	}

	let hasPassword = $state(initialHasPassword);
	export function setHasPassword(hp: boolean | undefined) {
		hasPassword = hp;
	}

	let deleteAccountEmail = $state(initialDeleteAccountEmail);
	export function setDeleteAccountEmail(email: string | undefined) {
		deleteAccountEmail = email;
	}

	const accountView = $derived(auth.composition.bind(store, auth.accountSlot));
	const oauthStartView = $derived(auth.composition.bind(store, auth.oauthStartSlot));

	// svelte-ignore state_referenced_locally
	const views = defineViews(auth.composition, {
		login: { content: loginContent },
		mfa: { content: mfaContent },
		signup: { content: signupContent },
		forgotPassword: { content: forgotContent },
		resetPassword: { content: resetContent },
		emailVerification: { content: verificationContent },
		mfaEnrolment: { content: enrolmentContent },
		mfaManagement: { content: managementContent },
		oauthStart: { content: oauthStartContent },
		oauthCallback: { content: oauthCallbackContent },
		magicLinkRequest: { content: magicLinkRequestContent },
		magicLinkSignIn: { content: magicLinkSignInContent },
		account: { content: accountContent },
		connectedAccounts: { content: connectedAccountsContent },
		changeEmail: { content: changeEmailContent },
		changeEmailConfirm: { content: changeEmailConfirmContent },
		changePassword: { content: changePasswordContent },
		deleteAccount: { content: deleteAccountContent },
		sessionRefresh: { content: sessionRefreshContent }
	});
</script>

{#snippet loginContent(view: PresentationFeatureViewProps<LoginState, LoginAction>)}
	<LoginForm mode="managed" flowStore={view.store} />
{/snippet}

{#snippet mfaContent(view: PresentationFeatureViewProps<MfaChallengeState, MfaChallengeAction>)}
	<MfaChallengeForm mode="managed" flowStore={view.store} />
{/snippet}

{#snippet signupContent(view: PresentationFeatureViewProps<SignupState, SignupAction>)}
	<SignupForm mode="managed" flowStore={view.store} />
{/snippet}

{#snippet forgotContent(view: PresentationFeatureViewProps<ForgotPasswordState, ForgotPasswordAction>)}
	<ForgotPasswordForm mode="managed" flowStore={view.store} />
{/snippet}

{#snippet resetContent(view: PresentationFeatureViewProps<ResetPasswordState, ResetPasswordAction>)}
	<ResetPasswordForm mode="managed" flowStore={view.store} />
{/snippet}

{#snippet verificationContent(view: PresentationFeatureViewProps<EmailVerificationState, EmailVerificationAction>)}
	<EmailVerification mode="managed" flowStore={view.store} token="test-verification-token" />
{/snippet}

{#snippet enrolmentContent(view: PresentationFeatureViewProps<MfaEnrolmentState, MfaEnrolmentAction>)}
	<MfaEnrolment mode="managed" flowStore={view.store} />
{/snippet}

{#snippet managementContent(view: PresentationFeatureViewProps<MfaManagementState, MfaManagementAction>)}
	<MfaManagementPanel mode="managed" store={view.store} {mfaEnabled} />
{/snippet}

{#snippet oauthStartContent(view: PresentationFeatureViewProps<OAuthStartState, OAuthStartAction>)}
	<OAuthSignIn mode="managed" flowStore={view.store} {providers} />
{/snippet}

{#snippet oauthCallbackContent(view: PresentationFeatureViewProps<OAuthCallbackState, OAuthCallbackAction>)}
	<OAuthCallback mode="managed" flowStore={view.store} params={callbackParams} />
{/snippet}

{#snippet magicLinkRequestContent(view: PresentationFeatureViewProps<MagicLinkRequestState, MagicLinkRequestAction>)}
	<MagicLinkRequestForm mode="managed" flowStore={view.store} />
{/snippet}

{#snippet magicLinkSignInContent(view: PresentationFeatureViewProps<MagicLinkSignInState, MagicLinkSignInAction>)}
	<MagicLinkSignIn mode="managed" flowStore={view.store} token={magicLinkToken} />
{/snippet}

{#snippet accountContent(view: PresentationFeatureViewProps<AccountState, AccountAction>)}
	<div class="account-summary" data-testid="account-summary">
		{#if view.store.state?.account}
			<p data-testid="account-email">{view.store.state.account.email}</p>
			<p data-testid="account-providers">{view.store.state.account.providers.join(', ')}</p>
		{:else if view.store.state?.status === 'loading'}
			<p data-testid="account-loading">Loading account…</p>
		{:else if view.store.state?.status === 'idle'}
			<p data-testid="account-idle">Account idle</p>
		{/if}
	</div>
{/snippet}

{#snippet connectedAccountsContent(view: PresentationFeatureViewProps<ConnectedAccountsState, ConnectedAccountsAction>)}
	<ConnectedAccountsPanel
		mode="managed"
		store={view.store}
		accountStore={accountView}
		oauthStore={oauthStartView}
		available={providers.map((p) => ({ id: p.id as OAuthProvider, label: p.label }))}
		{onLink}
	/>
{/snippet}

{#snippet changeEmailContent(view: PresentationFeatureViewProps<ChangeEmailState, ChangeEmailAction>)}
	<ChangeEmailForm mode="managed" flowStore={view.store} {pendingEmail} />
{/snippet}

{#snippet changeEmailConfirmContent(view: PresentationFeatureViewProps<ChangeEmailConfirmState, ChangeEmailConfirmAction>)}
	<EmailChangeConfirmation mode="managed" flowStore={view.store} token={changeEmailConfirmToken} />
{/snippet}

{#snippet changePasswordContent(view: PresentationFeatureViewProps<ChangePasswordState, ChangePasswordAction>)}
	<ChangePasswordForm mode="managed" flowStore={view.store} {hasPassword} />
{/snippet}

{#snippet deleteAccountContent(view: PresentationFeatureViewProps<DeleteAccountState, DeleteAccountAction>)}
	<DeleteAccountPanel mode="managed" store={view.store} email={deleteAccountEmail} />
{/snippet}

{#snippet sessionRefreshContent(view: PresentationFeatureViewProps<SessionRefreshState, SessionRefreshAction>)}
	<SessionRefresh mode="managed" store={view.store}>
		{#snippet ended()}
			<div data-testid="session-ended">Session ended</div>
		{/snippet}
	</SessionRefresh>
{/snippet}

<FeatureViews {store} definition={views}>
	{#snippet children(handles)}
		<FeatureOutlet view={handles.login} />
		<FeatureOutlet view={handles.mfa} />
		<FeatureOutlet view={handles.signup} />
		<FeatureOutlet view={handles.forgotPassword} />
		<FeatureOutlet view={handles.resetPassword} />
		<FeatureOutlet view={handles.emailVerification} />
		<FeatureOutlet view={handles.mfaEnrolment} />
		<FeatureOutlet view={handles.mfaManagement} />
		<FeatureOutlet view={handles.oauthStart} />
		<FeatureOutlet view={handles.oauthCallback} />
		<FeatureOutlet view={handles.magicLinkRequest} />
		<FeatureOutlet view={handles.magicLinkSignIn} />
		<FeatureOutlet view={handles.account} />
		<FeatureOutlet view={handles.connectedAccounts} />
		<FeatureOutlet view={handles.changeEmail} />
		<FeatureOutlet view={handles.changeEmailConfirm} />
		<FeatureOutlet view={handles.changePassword} />
		<FeatureOutlet view={handles.deleteAccount} />
		<FeatureOutlet view={handles.sessionRefresh} />
	{/snippet}
</FeatureViews>
